const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { ensurePublicBookingTable } = require('../lib/publicBookingSchema');
const publicRateLimit = require('../middleware/publicRateLimit');
const authenticate = require('../middleware/authenticate');

function staffAuth(req, res, next) {
  if (process.env.NODE_ENV !== 'production' && !req.header('Authorization')) {
    return next();
  }
  return authenticate(req, res, next);
}
const {
  isAdvantaConfigured,
  normalizeKenyaMobile,
  isValidKenyaMobile,
  sendAdvantaSms,
} = require('../lib/advantaSms');
const { facilityName, notifyAppointmentScheduled } = require('../lib/patientSms');

const ALLOWED_CLINICS = new Set([
  'General OPD',
  'Neurosurgery',
  'Cardiology',
  'Renal & Dialysis',
  'Orthopaedics',
  'Obstetrics & Gynaecology',
  'Paediatrics',
  'Ophthalmology',
  'ENT',
  'Dental',
  'Dermatology',
  'Mental Health',
  'Physiotherapy',
  'Nutrition',
]);

function smsEnabled() {
  const flag = String(process.env.SMS_ENABLED || 'true').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return isAdvantaConfigured();
}

function whatsappNumber() {
  return String(process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '');
}

function whatsappLink(code) {
  const digits = whatsappNumber();
  if (!digits) return null;
  const intl = digits.startsWith('254') ? digits : digits.replace(/^0/, '254');
  const text = encodeURIComponent(
    `Hello, I submitted an appointment request. My code is ${code}.`
  );
  return `https://wa.me/${intl}?text=${text}`;
}

function queueSms(mobile, message) {
  if (!smsEnabled() || !isValidKenyaMobile(mobile) || !message) return;
  setImmediate(() => {
    sendAdvantaSms({ mobile, message: message.slice(0, 480) }).catch((err) => {
      console.error('[publicBooking] SMS failed:', err.message || err);
    });
  });
}

function formatTime(value) {
  if (!value) return '';
  const s = String(value);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function uniqueCode(conn) {
  for (let i = 0; i < 12; i += 1) {
    const code = `TH-${Math.floor(1000 + Math.random() * 9000)}`;
    const [rows] = await conn.execute(
      'SELECT requestId FROM public_appointment_requests WHERE code = ? LIMIT 1',
      [code]
    );
    if (!rows.length) return code;
  }
  return `TH-${Date.now().toString().slice(-6)}`;
}

async function findOrCreatePatient(conn, row, userId) {
  const phoneNorm = normalizeKenyaMobile(row.phone);
  const idNumber = String(row.nationalId || '').trim();

  if (idNumber) {
    const [byId] = await conn.execute(
      `SELECT patientId FROM patients WHERE voided = 0 AND idNumber = ? LIMIT 1`,
      [idNumber]
    );
    if (byId.length) return byId[0].patientId;
  }

  if (isValidKenyaMobile(phoneNorm)) {
    const compact = phoneNorm.slice(-9);
    const [byPhone] = await conn.execute(
      `SELECT patientId FROM patients
       WHERE voided = 0 AND (
         REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?
         OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?
       )
       LIMIT 1`,
      [`%${compact}`, `%${phoneNorm}`]
    );
    if (byPhone.length) return byPhone[0].patientId;
  }

  const [count] = await conn.execute('SELECT COUNT(*) as count FROM patients');
  const patientNumber = `P-${String(Number(count[0].count || 0) + 1).padStart(6, '0')}`;
  const paying = /self-pay|cash/i.test(String(row.insurance || ''));
  const gender = ['Male', 'Female', 'Other'].includes(row.gender) ? row.gender : 'Other';

  const [result] = await conn.execute(
    `INSERT INTO patients (
      patientNumber, firstName, lastName, gender, patientType, insuranceNumber,
      phone, idNumber, idType, createdBy, voided
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      patientNumber,
      row.firstName,
      row.lastName,
      gender,
      paying ? 'paying' : 'insurance',
      row.shaMemberNumber || null,
      row.phone,
      idNumber || null,
      idNumber ? 'National ID' : null,
      userId || null,
    ]
  );
  return result.insertId;
}

function mapRow(row) {
  return {
    id: row.requestId,
    requestId: row.requestId,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    nationalId: row.nationalId,
    shaMemberNumber: row.shaMemberNumber,
    clinic: row.clinic,
    preferredDate: formatDate(row.preferredDate),
    preferredTime: formatTime(row.preferredTime),
    reason: row.reason,
    insurance: row.insurance,
    gender: row.gender,
    status: row.status,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    source: row.source,
    createdAt: row.createdAt,
    whatsappUrl: whatsappLink(row.code),
  };
}

router.post('/', publicRateLimit({ max: 8 }), async (req, res) => {
  try {
    await ensurePublicBookingTable();
    const body = req.body || {};
    if (String(body.website || body.company || '').trim()) {
      return res.status(201).json({ code: 'TH-0000', status: 'pending' });
    }

    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const phoneRaw = String(body.phone || '').trim();
    const clinic = String(body.clinic || '').trim();
    const preferredDate = String(body.preferredDate || '').trim();
    const preferredTime = String(body.preferredTime || '').trim();
    const mobile = normalizeKenyaMobile(phoneRaw);

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required.' });
    }
    if (!isValidKenyaMobile(mobile)) {
      return res.status(400).json({ error: 'Enter a valid Kenyan mobile number.' });
    }
    if (!ALLOWED_CLINICS.has(clinic)) {
      return res.status(400).json({ error: 'Select a clinic from the list.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
      return res.status(400).json({ error: 'Preferred date is required (YYYY-MM-DD).' });
    }
    if (!preferredTime) {
      return res.status(400).json({ error: 'Preferred time is required.' });
    }

    const timeSql = preferredTime.length === 5 ? `${preferredTime}:00` : preferredTime;
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
      .split(',')[0]
      .trim()
      .slice(0, 64);
    const source = String(body.source || 'web').slice(0, 80);

    const conn = await pool.getConnection();
    let created;
    try {
      const code = await uniqueCode(conn);
      const [result] = await conn.execute(
        `INSERT INTO public_appointment_requests (
          code, firstName, lastName, phone, nationalId, shaMemberNumber, clinic,
          preferredDate, preferredTime, reason, insurance, gender, source, ipAddress
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          firstName,
          lastName,
          phoneRaw,
          String(body.nationalId || '').trim() || null,
          String(body.shaMemberNumber || body.shaNumber || '').trim() || null,
          clinic,
          preferredDate,
          timeSql,
          String(body.reason || '').trim() || null,
          String(body.insurance || '').trim() || null,
          String(body.gender || '').trim() || null,
          source,
          ip || null,
        ]
      );
      const [rows] = await conn.execute(
        'SELECT * FROM public_appointment_requests WHERE requestId = ?',
        [result.insertId]
      );
      created = rows[0];
    } finally {
      conn.release();
    }

    const facility = facilityName();
    const when = `${formatDate(created.preferredDate)} ${formatTime(created.preferredTime)}`;
    const wa = whatsappNumber()
      ? ` WhatsApp ${whatsappNumber().replace(/^254/, '0')} if you have questions.`
      : '';
    queueSms(
      mobile,
      `${facility}: ${firstName}, we received your ${clinic} request (${created.code}) for ${when}. Registration will confirm your slot.${wa}`
    );

    res.status(201).json({
      ...mapRow(created),
      smsQueued: smsEnabled(),
    });
  } catch (error) {
    console.error('Error creating public booking:', error);
    res.status(500).json({ error: 'Could not submit booking request.', message: error.message });
  }
});

router.get('/lookup/:code', async (req, res) => {
  try {
    await ensurePublicBookingTable();
    const code = String(req.params.code || '').trim().toUpperCase();
    const [rows] = await pool.execute(
      'SELECT code, clinic, preferredDate, preferredTime, status FROM public_appointment_requests WHERE code = ? LIMIT 1',
      [code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking code not found.' });
    res.json({
      code: rows[0].code,
      clinic: rows[0].clinic,
      preferredDate: formatDate(rows[0].preferredDate),
      preferredTime: formatTime(rows[0].preferredTime),
      status: rows[0].status,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', staffAuth, async (req, res) => {
  try {
    await ensurePublicBookingTable();
    const status = String(req.query.status || '').trim();
    let sql = 'SELECT * FROM public_appointment_requests WHERE 1=1';
    const params = [];
    if (status && ['pending', 'accepted', 'declined'].includes(status)) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY createdAt DESC LIMIT 100';
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(mapRow));
  } catch (error) {
    console.error('Error listing public bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/accept', staffAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensurePublicBookingTable();
    const id = Number(req.params.id);
    const userId = req.user?.id || req.user?.userId || null;
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM public_appointment_requests WHERE requestId = ? FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Request not found.' });
    }
    const row = rows[0];
    if (row.status === 'accepted' && row.appointmentId) {
      await connection.rollback();
      return res.json({ ...mapRow(row), alreadyAccepted: true });
    }
    if (row.status === 'declined') {
      await connection.rollback();
      return res.status(409).json({ error: 'This request was already declined.' });
    }

    const patientId = await findOrCreatePatient(connection, row, userId);
    const notes = [
      `Online booking ${row.code}`,
      row.insurance ? `Payer: ${row.insurance}` : null,
      row.shaMemberNumber ? `SHA: ${row.shaMemberNumber}` : null,
    ]
      .filter(Boolean)
      .join('. ');

    const [appt] = await connection.execute(
      `INSERT INTO appointments
        (patientId, doctorId, appointmentDate, appointmentTime, department, reason, status, notes, createdBy)
       VALUES (?, NULL, ?, ?, ?, ?, 'confirmed', ?, ?)`,
      [
        patientId,
        formatDate(row.preferredDate),
        formatTime(row.preferredTime).length === 5
          ? `${formatTime(row.preferredTime)}:00`
          : row.preferredTime,
        row.clinic,
        row.reason || `Online request ${row.code}`,
        notes,
        userId,
      ]
    );

    await connection.execute(
      `UPDATE public_appointment_requests
       SET status = 'accepted', patientId = ?, appointmentId = ?, decidedAt = NOW(), decidedBy = ?
       WHERE requestId = ?`,
      [patientId, appt.insertId, userId, id]
    );
    await connection.commit();

    notifyAppointmentScheduled(patientId, {
      appointmentDate: formatDate(row.preferredDate),
      appointmentTime: formatTime(row.preferredTime),
      department: row.clinic,
    });

    const mobile = normalizeKenyaMobile(row.phone);
    const facility = facilityName();
    queueSms(
      mobile,
      `${facility}: ${row.firstName}, booking ${row.code} is confirmed for ${formatDate(row.preferredDate)} ${formatTime(row.preferredTime)} (${row.clinic}). Please arrive 15 minutes early and quote this code at registration.`
    );

    const [updated] = await pool.execute(
      'SELECT * FROM public_appointment_requests WHERE requestId = ?',
      [id]
    );
    res.json({ ...mapRow(updated[0]), appointmentId: appt.insertId, patientId });
  } catch (error) {
    await connection.rollback();
    console.error('Error accepting public booking:', error);
    res.status(500).json({ error: 'Could not accept booking.', message: error.message });
  } finally {
    connection.release();
  }
});

router.post('/:id/decline', staffAuth, async (req, res) => {
  try {
    await ensurePublicBookingTable();
    const id = Number(req.params.id);
    const userId = req.user?.id || req.user?.userId || null;
    const [rows] = await pool.execute(
      'SELECT * FROM public_appointment_requests WHERE requestId = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
    const row = rows[0];
    if (row.status !== 'pending') {
      return res.status(409).json({ error: `Request is already ${row.status}.` });
    }
    await pool.execute(
      `UPDATE public_appointment_requests
       SET status = 'declined', decidedAt = NOW(), decidedBy = ?
       WHERE requestId = ?`,
      [userId, id]
    );
    const mobile = normalizeKenyaMobile(row.phone);
    const facility = facilityName();
    queueSms(
      mobile,
      `${facility}: ${row.firstName}, we could not confirm online request ${row.code} for ${row.clinic}. Please call the hospital to book another slot.`
    );
    res.json({ ...mapRow({ ...row, status: 'declined' }) });
  } catch (error) {
    console.error('Error declining public booking:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
