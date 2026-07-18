/**
 * M-Pesa STK Push routes (Cloudsasa) — mounted at /api/billing/mpesa
 */
const express = require('express');
const router = express.Router();
const {
  ensureTables,
  isMpesaConfigured,
  getCallbackUrl,
  normalizeKenyaPhone,
  initiateStkPush,
  createPendingSession,
  getSessionByCheckoutId,
  parseAllocations,
  markSessionFromCallback,
  applySuccessfulSession,
} = require('../lib/mpesaStk');
const pool = require('../config/db');

router.use(async (_req, _res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/mpesa/config
 * Whether STK is configured (no secrets).
 */
router.get('/config', (_req, res) => {
  res.json({
    configured: isMpesaConfigured(),
    callbackConfigured: Boolean(getCallbackUrl() && /^https:\/\//i.test(getCallbackUrl())),
  });
});

/**
 * POST /api/billing/mpesa/stk-push
 * Body: { amount, phone, patientId?, allocations: [{ invoiceId, amount }], batchReceiptNumber? }
 */
router.post('/stk-push', async (req, res) => {
  try {
    if (!isMpesaConfigured()) {
      return res.status(503).json({
        error: 'mpesa_not_configured',
        message:
          'M-Pesa STK is not configured. Set CLOUD_SASA_CLIENT_ID and CLOUD_SASA_CLIENT_SECRET on the API server.',
      });
    }

    const { phone, patientId, allocations, batchReceiptNumber } = req.body || {};
    let amount = Number(req.body?.amount);

    const allocs = Array.isArray(allocations) ? allocations : [];
    if (allocs.length) {
      const sum = allocs.reduce((s, a) => s + Number(a.amount || 0), 0);
      if (!amount || amount <= 0) amount = sum;
      if (Math.abs(sum - amount) > 0.05) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Amount must match the sum of invoice allocations.',
        });
      }
    }

    if (!(amount > 0)) {
      return res.status(400).json({ error: 'invalid_request', message: 'amount is required' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'invalid_request', message: 'phone is required' });
    }
    if (!allocs.length) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'allocations is required (list of { invoiceId, amount })',
      });
    }

    // Validate invoices still have enough balance
    for (const a of allocs) {
      const invoiceId = Number(a.invoiceId);
      const payAmt = Number(a.amount);
      if (!invoiceId || !(payAmt > 0)) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Each allocation needs invoiceId and amount > 0',
        });
      }
      const [rows] = await pool.execute(
        `SELECT invoiceId, totalAmount, paidAmount, status FROM invoices WHERE invoiceId = ?`,
        [invoiceId]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'not_found', message: `Invoice ${invoiceId} not found` });
      }
      const inv = rows[0];
      if (String(inv.status).toLowerCase() === 'cancelled') {
        return res.status(400).json({
          error: 'invalid_request',
          message: `Invoice ${invoiceId} is cancelled`,
        });
      }
      const balance = Number(inv.totalAmount) - Number(inv.paidAmount || 0);
      if (payAmt > balance + 0.01) {
        return res.status(400).json({
          error: 'invalid_request',
          message: `Payment for invoice ${invoiceId} exceeds balance (${balance})`,
        });
      }
    }

    const stk = await initiateStkPush({ amount, phone });

    await createPendingSession({
      checkoutRequestId: stk.checkoutRequestId,
      amount: stk.amount,
      phone: stk.phone,
      patientId: patientId ? Number(patientId) : null,
      allocations: allocs.map((a) => ({
        invoiceId: Number(a.invoiceId),
        amount: Number(a.amount),
        invoiceNumber: a.invoiceNumber || null,
      })),
      batchReceiptNumber: batchReceiptNumber || null,
      initiatedByUserId: req.user?.id || req.user?.userId || null,
      rawInitiate: stk.raw,
    });

    return res.status(200).json({
      success: true,
      checkoutRequest_id: stk.checkoutRequestId,
      checkoutRequestId: stk.checkoutRequestId,
      message: stk.message,
      status: 'pending',
      amount: stk.amount,
      phone: stk.phone,
    });
  } catch (err) {
    console.error('[mpesa] stk-push error:', err.message || err);
    const status =
      err.code === 'mpesa_not_configured'
        ? 503
        : err.code === 'invalid_phone' || err.code === 'invalid_amount' || err.code === 'invalid_callback'
          ? 400
          : err.status || 502;
    return res.status(status).json({
      error: err.code || 'stk_push_failed',
      message: err.message || 'Failed to initiate payment',
      details: err.details || undefined,
    });
  }
});

/**
 * GET /api/billing/mpesa/stk-status/:checkoutRequestId
 */
router.get('/stk-status/:checkoutRequestId', async (req, res) => {
  try {
    const id = String(req.params.checkoutRequestId || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'invalid_request', message: 'checkoutRequestId required' });
    }
    const session = await getSessionByCheckoutId(id);
    if (!session) {
      return res.status(404).json({ error: 'not_found', message: 'STK session not found' });
    }
    return res.json({
      checkoutRequestId: session.checkoutRequestId,
      status: session.status,
      amount: Number(session.amount),
      phone: session.phone,
      mpesaReceiptNumber: session.mpesaReceiptNumber,
      resultCode: session.resultCode,
      resultDesc: session.resultDesc,
      appliedAt: session.appliedAt,
      allocations: parseAllocations(session),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (err) {
    console.error('[mpesa] stk-status error:', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

/**
 * POST /api/billing/mpesa/callback
 * Public — Cloudsasa forwards the Safaricom STK callback body here.
 */
router.post('/callback', async (req, res) => {
  // Acknowledge immediately
  res.status(200).json({ received: true });

  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) {
      console.warn('[mpesa] callback missing Body.stkCallback');
      return;
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    if (!checkoutRequestId) {
      console.warn('[mpesa] callback missing CheckoutRequestID');
      return;
    }

    const update = await markSessionFromCallback(String(checkoutRequestId), req.body);
    console.log(
      `[mpesa] callback ${checkoutRequestId}: status=${update.status} code=${update.resultCode} desc=${update.resultDesc || ''}`
    );

    if (update.status === 'success') {
      try {
        const applied = await applySuccessfulSession(String(checkoutRequestId));
        console.log(`[mpesa] apply ${checkoutRequestId}:`, applied.reason || 'ok', applied.results || '');
      } catch (applyErr) {
        console.error('[mpesa] apply payment failed:', applyErr.message || applyErr);
      }
    }
  } catch (err) {
    console.error('[mpesa] callback handler error:', err);
  }
});

/**
 * POST /api/billing/mpesa/finalize/:checkoutRequestId
 * Idempotent re-apply if callback succeeded but invoice update failed.
 */
router.post('/finalize/:checkoutRequestId', async (req, res) => {
  try {
    const id = String(req.params.checkoutRequestId || '').trim();
    const session = await getSessionByCheckoutId(id);
    if (!session) {
      return res.status(404).json({ error: 'not_found', message: 'STK session not found' });
    }
    if (session.status !== 'success' && session.status !== 'applied') {
      return res.status(400).json({
        error: 'not_ready',
        message: `Payment is ${session.status}`,
        status: session.status,
        resultDesc: session.resultDesc,
      });
    }
    const applied = await applySuccessfulSession(id);
    return res.json({ ok: true, ...applied });
  } catch (err) {
    console.error('[mpesa] finalize error:', err);
    return res.status(500).json({
      error: 'apply_failed',
      message: err.message || 'Failed to apply M-Pesa payment',
    });
  }
});

/** Dev helper: normalize phone display */
router.post('/normalize-phone', (req, res) => {
  const normalized = normalizeKenyaPhone(req.body?.phone);
  if (!normalized) {
    return res.status(400).json({ ok: false, message: 'Invalid phone' });
  }
  return res.json({ ok: true, phone: normalized });
});

module.exports = router;
