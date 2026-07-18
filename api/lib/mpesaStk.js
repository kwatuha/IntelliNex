/**
 * Cloudsasa M-Pesa STK Push client (docs/MPESA_STK_INTEGRATION_GUIDE.md).
 */
const pool = require('../config/db');

const STK_URL =
  process.env.MPESA_STK_URL ||
  process.env.CLOUD_SASA_STK_URL ||
  'https://idyangu.cloudsasa.com/api/wallet/app/stk-push';

let tablesReady = false;

function getCredentials() {
  const clientId =
    process.env.CLOUD_SASA_CLIENT_ID ||
    process.env.MPESA_CLIENT_ID ||
    process.env.CLOUD_SASA_CLIENTID ||
    '';
  const clientSecret =
    process.env.CLOUD_SASA_CLIENT_SECRET ||
    process.env.MPESA_CLIENT_SECRET ||
    process.env.CLOUD_SASA_CLIENTSECRET ||
    '';
  return {
    clientId: String(clientId).trim(),
    clientSecret: String(clientSecret).trim(),
  };
}

function isMpesaConfigured() {
  const { clientId, clientSecret } = getCredentials();
  return Boolean(clientId && clientSecret);
}

function getCallbackUrl() {
  const explicit =
    process.env.MPESA_CALLBACK_URL ||
    process.env.CLOUD_SASA_CALLBACK_URL ||
    '';
  if (explicit.trim()) return explicit.trim().replace(/\/$/, '');

  const publicApi =
    process.env.PUBLIC_API_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    '';
  if (publicApi.trim()) {
    return `${publicApi.trim().replace(/\/$/, '')}/api/billing/mpesa/callback`;
  }

  const frontend = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (frontend) {
    return `${frontend}/api/billing/mpesa/callback`;
  }

  return '';
}

/**
 * Normalize Safaricom numbers to 2547XXXXXXXX (accepted formats: 07…, 254…, +254…).
 */
function normalizeKenyaPhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `254${digits.slice(1)}`;
  } else if (digits.startsWith('7') && digits.length === 9) {
    digits = `254${digits}`;
  } else if (digits.startsWith('254') && digits.length === 12) {
    // already ok
  } else if (digits.startsWith('2540') && digits.length === 13) {
    digits = `254${digits.slice(4)}`;
  } else {
    return null;
  }
  if (!/^254[17]\d{8}$/.test(digits)) return null;
  return digits;
}

function phoneForStkRequest(normalized254) {
  // Cloudsasa accepts 07… / 254… / +254… — send 0-prefixed local form.
  if (!normalized254 || !normalized254.startsWith('254')) return normalized254;
  return `0${normalized254.slice(3)}`;
}

async function ensureTables() {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mpesa_stk_payments (
      stkPaymentId INT NOT NULL AUTO_INCREMENT,
      checkoutRequestId VARCHAR(128) NOT NULL,
      merchantRequestId VARCHAR(128) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      amount DECIMAL(12, 2) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      patientId INT NULL,
      allocationsJson JSON NOT NULL,
      batchReceiptNumber VARCHAR(96) NULL,
      mpesaReceiptNumber VARCHAR(64) NULL,
      resultCode INT NULL,
      resultDesc VARCHAR(512) NULL,
      transactionDate VARCHAR(32) NULL,
      callbackPhone VARCHAR(32) NULL,
      initiatedByUserId INT NULL,
      appliedAt TIMESTAMP NULL,
      rawInitiateJson JSON NULL,
      rawCallbackJson JSON NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (stkPaymentId),
      UNIQUE KEY uq_mpesa_stk_checkout (checkoutRequestId),
      INDEX idx_mpesa_stk_status (status, createdAt),
      INDEX idx_mpesa_stk_patient (patientId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablesReady = true;
}

function metadataItemsToMap(items) {
  const map = {};
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (item && item.Name != null) map[item.Name] = item.Value;
  }
  return map;
}

async function initiateStkPush({ amount, phone, callbackUrl }) {
  const { clientId, clientSecret } = getCredentials();
  if (!clientId || !clientSecret) {
    const err = new Error(
      'M-Pesa is not configured. Set CLOUD_SASA_CLIENT_ID and CLOUD_SASA_CLIENT_SECRET on the API.'
    );
    err.code = 'mpesa_not_configured';
    throw err;
  }

  const normalized = normalizeKenyaPhone(phone);
  if (!normalized) {
    const err = new Error('Invalid Safaricom phone number. Use 07XXXXXXXX or 2547XXXXXXXX.');
    err.code = 'invalid_phone';
    throw err;
  }

  const kes = Number(amount);
  if (!Number.isFinite(kes) || kes <= 0) {
    const err = new Error('Amount must be greater than 0.');
    err.code = 'invalid_amount';
    throw err;
  }

  const url = callbackUrl || getCallbackUrl();
  if (!url || !/^https:\/\//i.test(url)) {
    const err = new Error(
      'MPESA_CALLBACK_URL must be a public HTTPS URL (Cloudsasa cannot reach localhost).'
    );
    err.code = 'invalid_callback';
    throw err;
  }

  // Guide: Basic Auth with base64(client_id:client_secret).
  // Cloudsasa also accepts client_id/client_secret in the JSON body (see their 401 message).
  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const body = {
    amount: Math.round(kes * 100) / 100,
    phone: phoneForStkRequest(normalized),
    callback_url: url,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const res = await fetch(STK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const hint =
      data?.error === 'invalid_client'
        ? ` Cloudsasa rejected client_id="${clientId}" (check the exact value registered for this environment).`
        : '';
    const err = new Error(
      (data?.message || data?.error || `STK push failed (HTTP ${res.status})`) + hint
    );
    err.code = data?.error || 'stk_push_failed';
    err.status = res.status;
    err.details = { ...(typeof data === 'object' && data ? data : { raw: data }), client_id_used: clientId };
    console.error('[mpesaStk] Cloudsasa STK failed:', {
      status: res.status,
      error: data?.error,
      message: data?.message,
      client_id: clientId,
      url: STK_URL,
    });
    throw err;
  }

  const checkoutRequestId =
    data?.checkout_request_id ||
    data?.CheckoutRequestID ||
    data?.checkoutRequestId;
  if (!checkoutRequestId) {
    const err = new Error('STK push response missing checkout_request_id');
    err.code = 'stk_push_failed';
    err.details = data;
    throw err;
  }

  return {
    success: true,
    checkoutRequestId: String(checkoutRequestId),
    message: data?.message || 'Success. Request accepted for processing',
    status: data?.status || 'pending',
    phone: normalized,
    amount: body.amount,
    raw: data,
  };
}

async function createPendingSession({
  checkoutRequestId,
  amount,
  phone,
  patientId = null,
  allocations,
  batchReceiptNumber = null,
  initiatedByUserId = null,
  rawInitiate = null,
}) {
  await ensureTables();
  await pool.execute(
    `INSERT INTO mpesa_stk_payments
      (checkoutRequestId, status, amount, phone, patientId, allocationsJson,
       batchReceiptNumber, initiatedByUserId, rawInitiateJson)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    [
      checkoutRequestId,
      amount,
      phone,
      patientId,
      JSON.stringify(allocations || []),
      batchReceiptNumber,
      initiatedByUserId,
      rawInitiate ? JSON.stringify(rawInitiate) : null,
    ]
  );
}

async function getSessionByCheckoutId(checkoutRequestId) {
  await ensureTables();
  const [rows] = await pool.execute(
    `SELECT * FROM mpesa_stk_payments WHERE checkoutRequestId = ? LIMIT 1`,
    [checkoutRequestId]
  );
  return rows[0] || null;
}

function parseAllocations(row) {
  if (!row) return [];
  let raw = row.allocationsJson ?? row.allocations_json;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

async function markSessionFromCallback(checkoutRequestId, payload) {
  await ensureTables();
  const stk = payload?.Body?.stkCallback;
  if (!stk) {
    return { ok: false, reason: 'missing_stk_callback' };
  }

  const resultCode = Number(stk.ResultCode);
  const resultDesc = stk.ResultDesc || null;
  const merchantRequestId = stk.MerchantRequestID || null;
  const meta = metadataItemsToMap(stk.CallbackMetadata?.Item);
  const receipt = meta.MpesaReceiptNumber != null ? String(meta.MpesaReceiptNumber) : null;
  const txDate = meta.TransactionDate != null ? String(meta.TransactionDate) : null;
  const callbackPhone = meta.PhoneNumber != null ? String(meta.PhoneNumber) : null;
  const status = resultCode === 0 ? 'success' : 'failed';

  const [result] = await pool.execute(
    `UPDATE mpesa_stk_payments
     SET status = ?,
         merchantRequestId = COALESCE(?, merchantRequestId),
         resultCode = ?,
         resultDesc = ?,
         mpesaReceiptNumber = COALESCE(?, mpesaReceiptNumber),
         transactionDate = COALESCE(?, transactionDate),
         callbackPhone = COALESCE(?, callbackPhone),
         rawCallbackJson = ?,
         updatedAt = NOW()
     WHERE checkoutRequestId = ?
       AND status IN ('pending', 'failed')`,
    [
      status,
      merchantRequestId,
      Number.isFinite(resultCode) ? resultCode : null,
      resultDesc ? String(resultDesc).slice(0, 512) : null,
      receipt,
      txDate,
      callbackPhone,
      JSON.stringify(payload),
      checkoutRequestId,
    ]
  );

  return {
    ok: true,
    status,
    resultCode,
    resultDesc,
    receipt,
    affected: result.affectedRows,
  };
}

async function markSessionApplied(checkoutRequestId) {
  await ensureTables();
  const [result] = await pool.execute(
    `UPDATE mpesa_stk_payments
     SET appliedAt = NOW(), status = 'applied', updatedAt = NOW()
     WHERE checkoutRequestId = ?
       AND appliedAt IS NULL
       AND status IN ('success', 'applied')`,
    [checkoutRequestId]
  );
  return result.affectedRows > 0;
}

/**
 * Apply invoice payments for a successful STK session (idempotent).
 * Calls the existing billing payment endpoint over loopback so pharmacy/lab side-effects stay in one place.
 */
async function applySuccessfulSession(checkoutRequestId) {
  const session = await getSessionByCheckoutId(checkoutRequestId);
  if (!session) {
    return { applied: false, reason: 'not_found' };
  }
  if (session.appliedAt) {
    return { applied: false, reason: 'already_applied', session };
  }
  if (session.status !== 'success' && session.status !== 'applied') {
    return { applied: false, reason: 'not_success', session };
  }

  const allocations = parseAllocations(session);
  if (!allocations.length) {
    return { applied: false, reason: 'no_allocations', session };
  }

  const receipt = session.mpesaReceiptNumber || checkoutRequestId;
  const batchReceiptNumber = session.batchReceiptNumber || null;
  const port = process.env.PORT || process.env.API_PORT || 3001;
  const base =
    process.env.MPESA_INTERNAL_API_BASE ||
    `http://127.0.0.1:${port}`;

  const results = [];
  for (const alloc of allocations) {
    if (alloc.applied) {
      results.push({ invoiceId: alloc.invoiceId, amount: alloc.amount, ok: true, skipped: true });
      continue;
    }
    const invoiceId = alloc.invoiceId ?? alloc.invoice_id;
    const amount = Number(alloc.amount);
    if (!invoiceId || !(amount > 0)) continue;

    const res = await fetch(`${base.replace(/\/$/, '')}/api/billing/invoices/${invoiceId}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-Mpesa': process.env.MPESA_INTERNAL_SECRET || 'intellinex-mpesa',
      },
      body: JSON.stringify({
        paymentAmount: amount,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'mpesa',
        referenceNumber: String(receipt),
        notes: `M-Pesa STK payment. Checkout: ${checkoutRequestId}. Receipt: ${receipt}`,
        batchReceiptNumber: batchReceiptNumber || undefined,
      }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      await pool.execute(
        `UPDATE mpesa_stk_payments SET allocationsJson = ?, updatedAt = NOW() WHERE checkoutRequestId = ?`,
        [JSON.stringify(allocations), checkoutRequestId]
      );
      const err = new Error(
        data?.error || data?.message || `Failed to apply payment on invoice ${invoiceId}`
      );
      err.status = res.status;
      err.details = data;
      throw err;
    }
    alloc.applied = true;
    results.push({ invoiceId, amount, ok: true });
  }

  await pool.execute(
    `UPDATE mpesa_stk_payments SET allocationsJson = ?, updatedAt = NOW() WHERE checkoutRequestId = ?`,
    [JSON.stringify(allocations), checkoutRequestId]
  );
  await markSessionApplied(checkoutRequestId);
  return { applied: true, results, session };
}

module.exports = {
  ensureTables,
  isMpesaConfigured,
  getCredentials,
  getCallbackUrl,
  normalizeKenyaPhone,
  initiateStkPush,
  createPendingSession,
  getSessionByCheckoutId,
  parseAllocations,
  markSessionFromCallback,
  markSessionApplied,
  applySuccessfulSession,
  metadataItemsToMap,
};
