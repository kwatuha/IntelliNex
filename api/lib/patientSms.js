/**
 * Patient-facing SMS helpers (Advanta QuickSMS).
 * All sends are fire-and-forget — never throw into clinical/billing flows.
 */
const pool = require('../config/db');
const {
  isAdvantaConfigured,
  normalizeKenyaMobile,
  isValidKenyaMobile,
  maskPhone,
  sendAdvantaSms,
} = require('./advantaSms');

function isSmsEnabled() {
  const flag = String(process.env.SMS_ENABLED || 'true').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return isAdvantaConfigured();
}

function facilityName() {
  return (
    String(process.env.SMS_FACILITY_NAME || '').trim() ||
    String(process.env.APP_NAME || '').trim() ||
    String(process.env.NEXT_PUBLIC_APP_BRAND || '').trim() ||
    'IntelliNex'
  );
}

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function patientDisplayName(patient) {
  const first = String(patient?.firstName || '').trim();
  const last = String(patient?.lastName || '').trim();
  const name = `${first} ${last}`.trim();
  return name || patient?.patientNumber || 'Patient';
}

/**
 * Resolve patient phone (prefer patient.phone, fall back to nextOfKinPhone).
 */
async function resolvePatientContact(patientId, executor = pool) {
  if (!patientId) return null;
  const [rows] = await executor.execute(
    `SELECT patientId, patientNumber, firstName, lastName, phone, nextOfKinPhone
     FROM patients WHERE patientId = ? LIMIT 1`,
    [patientId]
  );
  if (!rows.length) return null;
  const p = rows[0];
  const primary = normalizeKenyaMobile(p.phone);
  const nok = normalizeKenyaMobile(p.nextOfKinPhone);
  let mobile = null;
  let source = null;
  if (isValidKenyaMobile(primary)) {
    mobile = primary;
    source = 'phone';
  } else if (isValidKenyaMobile(nok)) {
    mobile = nok;
    source = 'nextOfKinPhone';
  }
  return { ...p, mobile, source };
}

/**
 * Send SMS to a patient. Soft-fails (logs only).
 * @returns {Promise<{ sent: boolean, reason?: string, mobile?: string }>}
 */
async function notifyPatient(patientId, message, options = {}) {
  const { executor = pool, preferNok = false } = options;
  if (!isSmsEnabled()) {
    return { sent: false, reason: 'sms_disabled_or_unconfigured' };
  }
  const text = String(message || '').trim();
  if (!text) return { sent: false, reason: 'empty_message' };

  try {
    const contact = await resolvePatientContact(patientId, executor);
    if (!contact) return { sent: false, reason: 'patient_not_found' };

    let mobile = contact.mobile;
    if (preferNok) {
      const nok = normalizeKenyaMobile(contact.nextOfKinPhone);
      if (isValidKenyaMobile(nok)) mobile = nok;
    }
    if (!mobile) {
      console.warn('[patientSms] no valid phone for patient', patientId);
      return { sent: false, reason: 'no_valid_phone' };
    }

    await sendAdvantaSms({ mobile, message: text.slice(0, 480) });
    return { sent: true, mobile: maskPhone(mobile) };
  } catch (err) {
    console.error('[patientSms] send failed:', err.message || err);
    return { sent: false, reason: err.message || 'send_failed' };
  }
}

/** Queue SMS without blocking the request (errors already swallowed). */
function queuePatientSms(patientId, message, options = {}) {
  setImmediate(() => {
    notifyPatient(patientId, message, options).catch((err) => {
      console.error('[patientSms] queue error:', err.message || err);
    });
  });
}

// --- Typed notification templates ---

function notifyLabResultsReady(patientId, { orderNumber, testName } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const orderBit = orderNumber ? ` (order ${orderNumber})` : '';
      const testBit = testName ? ` for ${testName}` : '';
      const text = `${facility}: Dear ${who}, your laboratory results${testBit}${orderBit} are ready. Please collect them at the facility.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] lab results notify failed:', err.message || err);
    }
  });
}

function notifyPaymentReceived(patientId, { amount, invoiceNumber, balance, paymentMethod } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const inv = invoiceNumber ? ` for invoice ${invoiceNumber}` : '';
      const method = paymentMethod ? ` via ${paymentMethod}` : '';
      const bal =
        balance != null && Number(balance) > 0
          ? ` Outstanding balance: KES ${formatMoney(balance)}.`
          : ' Your invoice is fully paid.';
      const text = `${facility}: Dear ${who}, thank you for your payment of KES ${formatMoney(amount)}${inv}${method}.${bal}`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] payment notify failed:', err.message || err);
    }
  });
}

function notifyTelemedicineScheduled(patientId, { joinUrl, doctorName, sessionUuid } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const doc = doctorName ? ` with ${doctorName}` : '';
      const link = joinUrl ? ` Join: ${joinUrl}` : ' You will receive the meeting link shortly.';
      const ref = sessionUuid ? ` Ref: ${String(sessionUuid).slice(0, 8)}.` : '';
      const text = `${facility}: Dear ${who}, you have a telemedicine session scheduled${doc}.${ref}${link}`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] telemedicine notify failed:', err.message || err);
    }
  });
}

function notifyBillWaived(patientId, { amount, invoiceNumber, waiverAmount } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const inv = invoiceNumber ? ` on invoice ${invoiceNumber}` : '';
      const amt = waiverAmount != null ? waiverAmount : amount;
      const amtBit = amt != null ? ` of KES ${formatMoney(amt)}` : '';
      const text = `${facility}: Dear ${who}, your bill waiver${amtBit}${inv} has been approved. Thank you.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] waiver notify failed:', err.message || err);
    }
  });
}

function notifyPatientDischarged(patientId, { admissionNumber, wardName } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const adm = admissionNumber ? ` (admission ${admissionNumber})` : '';
      const ward = wardName ? ` from ${wardName}` : '';
      const text = `${facility}: Dear ${who}, you have been discharged${ward}${adm}. Wishing you a speedy recovery. Please follow your discharge instructions.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] discharge notify failed:', err.message || err);
    }
  });
}

function notifyAppointmentScheduled(patientId, { appointmentDate, appointmentTime, department, doctorName } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const when = [appointmentDate, appointmentTime].filter(Boolean).join(' ');
      const whenBit = when ? ` on ${when}` : '';
      const dept = department ? ` (${department})` : '';
      const doc = doctorName ? ` with ${doctorName}` : '';
      const text = `${facility}: Dear ${who}, your appointment${dept}${doc} is scheduled${whenBit}. Please arrive on time.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] appointment notify failed:', err.message || err);
    }
  });
}

function notifyAppointmentUpdated(patientId, { status, appointmentDate, appointmentTime } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const st = String(status || '').toLowerCase();
      let text;
      if (st === 'cancelled' || st === 'canceled') {
        text = `${facility}: Dear ${who}, your appointment has been cancelled. Contact the facility to reschedule.`;
      } else {
        const when = [appointmentDate, appointmentTime].filter(Boolean).join(' ');
        const whenBit = when ? ` to ${when}` : '';
        text = `${facility}: Dear ${who}, your appointment has been updated${whenBit}.`;
      }
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] appointment update notify failed:', err.message || err);
    }
  });
}

function notifyPrescriptionReady(patientId, { prescriptionNumber } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const presc = prescriptionNumber ? ` (${prescriptionNumber})` : '';
      const text = `${facility}: Dear ${who}, your prescription${presc} is ready for collection at the pharmacy.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] prescription notify failed:', err.message || err);
    }
  });
}

function notifyRadiologyReportReady(patientId, { orderNumber } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const orderBit = orderNumber ? ` (order ${orderNumber})` : '';
      const text = `${facility}: Dear ${who}, your radiology report${orderBit} is ready. Please collect it at the facility.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] radiology notify failed:', err.message || err);
    }
  });
}

function notifyPatientAdmitted(patientId, { wardName, bedNumber, admissionNumber } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const place = [wardName, bedNumber ? `bed ${bedNumber}` : null].filter(Boolean).join(', ');
      const placeBit = place ? ` to ${place}` : '';
      const adm = admissionNumber ? ` Ref: ${admissionNumber}.` : '';
      const text = `${facility}: Dear ${who}, you have been admitted${placeBit}.${adm} We wish you a quick recovery.`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] admission notify failed:', err.message || err);
    }
  });
}

function notifyAmbulanceDispatched(patientId, { pickupLocation, eta } = {}) {
  setImmediate(async () => {
    try {
      const contact = await resolvePatientContact(patientId);
      const who = contact ? patientDisplayName(contact) : 'patient';
      const facility = facilityName();
      const loc = pickupLocation ? ` Pickup: ${pickupLocation}.` : '';
      const etaBit = eta ? ` ETA: ${eta}.` : '';
      const text = `${facility}: Dear ${who}, an ambulance has been dispatched for you.${loc}${etaBit}`;
      await notifyPatient(patientId, text);
    } catch (err) {
      console.error('[patientSms] ambulance notify failed:', err.message || err);
    }
  });
}

module.exports = {
  isSmsEnabled,
  facilityName,
  resolvePatientContact,
  notifyPatient,
  queuePatientSms,
  notifyLabResultsReady,
  notifyPaymentReceived,
  notifyTelemedicineScheduled,
  notifyBillWaived,
  notifyPatientDischarged,
  notifyAppointmentScheduled,
  notifyAppointmentUpdated,
  notifyPrescriptionReady,
  notifyRadiologyReportReady,
  notifyPatientAdmitted,
  notifyAmbulanceDispatched,
};
