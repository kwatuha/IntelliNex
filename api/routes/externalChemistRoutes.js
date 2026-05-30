const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';

function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded?.user || decoded || null;
  } catch {
    return null;
  }
}

function isChemistUser(user) {
  const roleName = String(user?.roleName || user?.role || '').toLowerCase();
  return roleName === 'chemist' || roleName.includes('chemist') || roleName.includes('external_pharmacy');
}

async function getChemistScopeForUser(userId) {
  if (!userId) return null;
  const [rows] = await pool.execute(
    `SELECT ecu.chemistId, ec.chemistName, ec.chemistCode
     FROM external_chemist_users ecu
     INNER JOIN external_chemists ec ON ecu.chemistId = ec.chemistId
     WHERE ecu.userId = ? AND ecu.isActive = 1 AND ec.isActive = 1
     ORDER BY ecu.isPrimary DESC, ecu.chemistUserId ASC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function nextChemistCode(connection) {
  const [rows] = await connection.execute('SELECT COUNT(*) AS count FROM external_chemists');
  return `CHEM-${String((rows[0]?.count || 0) + 1).padStart(4, '0')}`;
}

async function nextReferralNumber(connection) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM prescription_external_referrals
     WHERE DATE(referralDate) = CURDATE()`
  );
  return `CER-${datePart}-${String((rows[0]?.count || 0) + 1).padStart(4, '0')}`;
}

async function createLinkedChemistUser(connection, data, chemistName) {
  if (!data.username || !data.password) return data.userId || null;

  const [roles] = await connection.execute('SELECT roleId FROM roles WHERE roleName = ? LIMIT 1', ['chemist']);
  if (!roles.length) {
    throw new Error('Chemist role is not configured');
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const email = data.loginEmail || data.email || `${data.username}@external-chemist.local`;
  const [result] = await connection.execute(
    `INSERT INTO users (username, email, passwordHash, firstName, lastName, phone, roleId, department, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      data.username,
      email,
      passwordHash,
      data.contactPerson || chemistName,
      'Chemist',
      data.phone || null,
      roles[0].roleId,
      'External Chemist',
    ]
  );
  return result.insertId;
}

function buildReferralSelect(whereClause = '1=1') {
  return `
    SELECT r.*,
           ec.chemistName, ec.chemistCode, ec.phone AS chemistPhone, ec.email AS chemistEmail,
           ec.address AS chemistAddress, ec.latitude, ec.longitude,
           p.prescriptionNumber, p.prescriptionDate,
           pt.patientNumber, pt.firstName AS patientFirstName, pt.lastName AS patientLastName, pt.phone AS patientPhone,
           dr.firstName AS doctorFirstName, dr.lastName AS doctorLastName,
           rb.firstName AS referredByFirstName, rb.lastName AS referredByLastName, rb.username AS referredByUsername
    FROM prescription_external_referrals r
    INNER JOIN external_chemists ec ON r.chemistId = ec.chemistId
    INNER JOIN prescriptions p ON r.prescriptionId = p.prescriptionId
    INNER JOIN patients pt ON r.patientId = pt.patientId
    LEFT JOIN users dr ON p.doctorId = dr.userId
    LEFT JOIN users rb ON r.referredBy = rb.userId
    WHERE ${whereClause}
  `;
}

async function attachReferralItems(referrals) {
  if (!referrals.length) return referrals;
  const ids = referrals.map((r) => r.referralId);
  const placeholders = ids.map(() => '?').join(',');
  const [items] = await pool.execute(
    `SELECT ri.*, pi.status AS prescriptionItemStatus
     FROM prescription_external_referral_items ri
     LEFT JOIN prescription_items pi ON ri.prescriptionItemId = pi.itemId
     WHERE ri.referralId IN (${placeholders})
     ORDER BY ri.referralItemId ASC`,
    ids
  );
  const byReferral = new Map();
  for (const item of items) {
    if (!byReferral.has(item.referralId)) byReferral.set(item.referralId, []);
    byReferral.get(item.referralId).push(item);
  }
  return referrals.map((referral) => ({
    ...referral,
    items: byReferral.get(referral.referralId) || [],
  }));
}

router.get('/external-chemists', async (req, res) => {
  try {
    const { search, active } = req.query;
    let query = 'SELECT * FROM external_chemists WHERE 1=1';
    const params = [];

    if (active !== undefined) {
      query += ' AND isActive = ?';
      params.push(String(active) === 'false' ? 0 : 1);
    }

    if (search) {
      query += ` AND (
        chemistName LIKE ? OR chemistCode LIKE ? OR phone LIKE ? OR email LIKE ? OR county LIKE ? OR subcounty LIKE ?
      )`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }

    query += ' ORDER BY isActive DESC, chemistName ASC';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching external chemists:', error);
    res.status(500).json({ error: 'Failed to fetch external chemists', message: error.message });
  }
});

router.get('/external-chemists/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM external_chemists WHERE chemistId = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Chemist not found' });
    const [users] = await pool.execute(
      `SELECT ecu.*, u.username, u.email, u.firstName, u.lastName
       FROM external_chemist_users ecu
       INNER JOIN users u ON ecu.userId = u.userId
       WHERE ecu.chemistId = ?
       ORDER BY ecu.isPrimary DESC, u.username ASC`,
      [req.params.id]
    );
    res.json({ ...rows[0], users });
  } catch (error) {
    console.error('Error fetching external chemist:', error);
    res.status(500).json({ error: 'Failed to fetch external chemist', message: error.message });
  }
});

router.post('/external-chemists', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const data = req.body || {};
    const chemistCode = data.chemistCode || await nextChemistCode(connection);

    const [result] = await connection.execute(
      `INSERT INTO external_chemists (
        chemistCode, chemistName, contactPerson, phone, email, address, county, subcounty, ward,
        latitude, longitude, licenseNumber, notes, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chemistCode,
        data.chemistName,
        data.contactPerson || null,
        data.phone || null,
        data.email || null,
        data.address || null,
        data.county || null,
        data.subcounty || null,
        data.ward || null,
        data.latitude || null,
        data.longitude || null,
        data.licenseNumber || null,
        data.notes || null,
        data.isActive === false ? 0 : 1,
      ]
    );

    const linkedUserId = await createLinkedChemistUser(connection, data, data.chemistName);
    if (linkedUserId) {
      await connection.execute(
        `INSERT INTO external_chemist_users (chemistId, userId, isPrimary, isActive)
         VALUES (?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary), isActive = VALUES(isActive), updatedAt = NOW()`,
        [result.insertId, linkedUserId]
      );
    }

    await connection.commit();
    const [rows] = await pool.execute('SELECT * FROM external_chemists WHERE chemistId = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating external chemist:', error);
    res.status(500).json({ error: 'Failed to create external chemist', message: error.message });
  } finally {
    connection.release();
  }
});

router.put('/external-chemists/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const data = req.body || {};
    await connection.execute(
      `UPDATE external_chemists SET
        chemistCode = ?, chemistName = ?, contactPerson = ?, phone = ?, email = ?, address = ?,
        county = ?, subcounty = ?, ward = ?, latitude = ?, longitude = ?, licenseNumber = ?,
        notes = ?, isActive = ?, updatedAt = NOW()
       WHERE chemistId = ?`,
      [
        data.chemistCode || null,
        data.chemistName,
        data.contactPerson || null,
        data.phone || null,
        data.email || null,
        data.address || null,
        data.county || null,
        data.subcounty || null,
        data.ward || null,
        data.latitude || null,
        data.longitude || null,
        data.licenseNumber || null,
        data.notes || null,
        data.isActive === false ? 0 : 1,
        req.params.id,
      ]
    );

    const linkedUserId = await createLinkedChemistUser(connection, data, data.chemistName);
    if (linkedUserId) {
      await connection.execute(
        `INSERT INTO external_chemist_users (chemistId, userId, isPrimary, isActive)
         VALUES (?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary), isActive = VALUES(isActive), updatedAt = NOW()`,
        [req.params.id, linkedUserId]
      );
    }

    await connection.commit();
    const [rows] = await pool.execute('SELECT * FROM external_chemists WHERE chemistId = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating external chemist:', error);
    res.status(500).json({ error: 'Failed to update external chemist', message: error.message });
  } finally {
    connection.release();
  }
});

router.get('/external-referrals', async (req, res) => {
  try {
    const user = getAuthUser(req);
    const params = [];
    const conditions = [];
    const { status, chemistId, patientId, search } = req.query;

    if (user && isChemistUser(user)) {
      const scope = await getChemistScopeForUser(user.id || user.userId);
      if (!scope) return res.status(403).json({ error: 'Chemist user is not assigned to a chemist' });
      conditions.push('r.chemistId = ?');
      params.push(scope.chemistId);
    } else if (chemistId) {
      conditions.push('r.chemistId = ?');
      params.push(chemistId);
    }

    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (patientId) {
      conditions.push('r.patientId = ?');
      params.push(patientId);
    }
    if (search) {
      conditions.push(`(
        r.referralNumber LIKE ? OR r.pickupCode LIKE ? OR pt.firstName LIKE ? OR pt.lastName LIKE ? OR pt.patientNumber LIKE ?
        OR ec.chemistName LIKE ? OR p.prescriptionNumber LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term);
    }

    const where = conditions.length ? conditions.join(' AND ') : '1=1';
    const [rows] = await pool.execute(`${buildReferralSelect(where)} ORDER BY r.referralDate DESC, r.referralId DESC`, params);
    res.json(await attachReferralItems(rows));
  } catch (error) {
    console.error('Error fetching external referrals:', error);
    res.status(500).json({ error: 'Failed to fetch external referrals', message: error.message });
  }
});

router.post('/external-referrals', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const user = getAuthUser(req);
    const data = req.body || {};
    const prescriptionId = Number(data.prescriptionId);
    const chemistId = Number(data.chemistId);
    const itemIds = Array.isArray(data.itemIds) ? data.itemIds.map(Number).filter(Boolean) : [];

    if (!prescriptionId || !chemistId) {
      await connection.rollback();
      return res.status(400).json({ error: 'prescriptionId and chemistId are required' });
    }

    const [prescriptions] = await connection.execute('SELECT * FROM prescriptions WHERE prescriptionId = ?', [prescriptionId]);
    if (!prescriptions.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Prescription not found' });
    }

    const [chemists] = await connection.execute('SELECT * FROM external_chemists WHERE chemistId = ? AND isActive = 1', [chemistId]);
    if (!chemists.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Active chemist not found' });
    }

    let itemQuery = `
      SELECT pi.*, m.name AS medicationNameFromCatalog
      FROM prescription_items pi
      LEFT JOIN medications m ON pi.medicationId = m.medicationId
      WHERE pi.prescriptionId = ?
    `;
    const itemParams = [prescriptionId];
    if (itemIds.length) {
      itemQuery += ` AND pi.itemId IN (${itemIds.map(() => '?').join(',')})`;
      itemParams.push(...itemIds);
    }
    const [items] = await connection.execute(itemQuery, itemParams);
    if (!items.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'No prescription items found for referral' });
    }

    const referralNumber = await nextReferralNumber(connection);
    const pickupCode = data.pickupCode || crypto.randomBytes(3).toString('hex').toUpperCase();
    const referredBy = user?.id || user?.userId || data.referredBy || null;

    const [result] = await connection.execute(
      `INSERT INTO prescription_external_referrals (
        referralNumber, prescriptionId, patientId, chemistId, referredBy, pickupDeadline, pickupCode,
        patientInstructions, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        referralNumber,
        prescriptionId,
        prescriptions[0].patientId,
        chemistId,
        referredBy,
        data.pickupDeadline || null,
        pickupCode,
        data.patientInstructions || null,
        data.notes || null,
      ]
    );

    for (const item of items) {
      await connection.execute(
        `INSERT INTO prescription_external_referral_items (
          referralId, prescriptionItemId, medicationId, medicationName, dosage, frequency, duration,
          instructions, quantityReferred
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          item.itemId,
          item.medicationId || null,
          item.medicationName || item.medicationNameFromCatalog || 'Medication',
          item.dosage || null,
          item.frequency || null,
          item.duration || null,
          item.instructions || null,
          item.quantity || 1,
        ]
      );
    }

    await connection.commit();
    const [rows] = await pool.execute(buildReferralSelect('r.referralId = ?'), [result.insertId]);
    const [referral] = await attachReferralItems(rows);
    res.status(201).json(referral);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating external referral:', error);
    res.status(500).json({ error: 'Failed to create external referral', message: error.message });
  } finally {
    connection.release();
  }
});

router.get('/external-referrals/:id', async (req, res) => {
  try {
    const user = getAuthUser(req);
    const conditions = ['r.referralId = ?'];
    const params = [req.params.id];

    if (user && isChemistUser(user)) {
      const scope = await getChemistScopeForUser(user.id || user.userId);
      if (!scope) return res.status(403).json({ error: 'Chemist user is not assigned to a chemist' });
      conditions.push('r.chemistId = ?');
      params.push(scope.chemistId);
    }

    const [rows] = await pool.execute(buildReferralSelect(conditions.join(' AND ')), params);
    if (!rows.length) return res.status(404).json({ error: 'Referral not found' });
    const [referral] = await attachReferralItems(rows);
    res.json(referral);
  } catch (error) {
    console.error('Error fetching external referral:', error);
    res.status(500).json({ error: 'Failed to fetch external referral', message: error.message });
  }
});

router.patch('/external-referrals/:id/status', async (req, res) => {
  try {
    const { status, pickedUpByName, pickedUpByPhone, notes } = req.body || {};
    const allowed = ['referred', 'acknowledged', 'ready_for_pickup', 'partially_picked', 'picked_up', 'not_picked', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid referral status' });

    const updates = ['status = ?', 'updatedAt = NOW()'];
    const params = [status];
    if (status === 'acknowledged') updates.push('acknowledgedAt = COALESCE(acknowledgedAt, NOW())');
    if (status === 'picked_up') updates.push('pickedUpAt = COALESCE(pickedUpAt, NOW())', 'completedAt = COALESCE(completedAt, NOW())');
    if (status === 'cancelled') updates.push('cancelledAt = COALESCE(cancelledAt, NOW())');
    if (pickedUpByName !== undefined) { updates.push('pickedUpByName = ?'); params.push(pickedUpByName || null); }
    if (pickedUpByPhone !== undefined) { updates.push('pickedUpByPhone = ?'); params.push(pickedUpByPhone || null); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
    params.push(req.params.id);

    await pool.execute(`UPDATE prescription_external_referrals SET ${updates.join(', ')} WHERE referralId = ?`, params);
    const [rows] = await pool.execute(buildReferralSelect('r.referralId = ?'), [req.params.id]);
    const [referral] = await attachReferralItems(rows);
    res.json(referral);
  } catch (error) {
    console.error('Error updating external referral status:', error);
    res.status(500).json({ error: 'Failed to update external referral status', message: error.message });
  }
});

router.patch('/external-referrals/:id/items/:referralItemId', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { status, quantityPicked, chemistNotes } = req.body || {};
    const allowed = ['pending', 'ready_for_pickup', 'picked_up', 'partially_picked', 'not_available', 'not_picked', 'cancelled'];
    if (!allowed.includes(status)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid item status' });
    }

    const qty = quantityPicked === undefined || quantityPicked === null || quantityPicked === ''
      ? null
      : Number(quantityPicked);
    const pickedAt = ['picked_up', 'partially_picked'].includes(status) ? ', pickedUpAt = COALESCE(pickedUpAt, NOW())' : '';

    await connection.execute(
      `UPDATE prescription_external_referral_items
       SET status = ?, quantityPicked = COALESCE(?, quantityPicked), chemistNotes = ?, updatedAt = NOW()${pickedAt}
       WHERE referralItemId = ? AND referralId = ?`,
      [status, qty, chemistNotes || null, req.params.referralItemId, req.params.id]
    );

    const [counts] = await connection.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'picked_up') AS picked,
         SUM(status = 'partially_picked') AS partial,
         SUM(status IN ('not_available', 'not_picked', 'cancelled')) AS unavailable
       FROM prescription_external_referral_items
       WHERE referralId = ?`,
      [req.params.id]
    );

    let referralStatus = 'referred';
    const c = counts[0];
    if (Number(c.total) > 0 && Number(c.picked) === Number(c.total)) referralStatus = 'picked_up';
    else if (Number(c.picked) > 0 || Number(c.partial) > 0) referralStatus = 'partially_picked';
    else if (Number(c.unavailable) === Number(c.total)) referralStatus = 'not_picked';
    else if (status === 'ready_for_pickup') referralStatus = 'ready_for_pickup';

    await connection.execute(
      `UPDATE prescription_external_referrals
       SET status = ?, pickedUpAt = IF(? = 'picked_up', COALESCE(pickedUpAt, NOW()), pickedUpAt),
           completedAt = IF(? IN ('picked_up', 'not_picked'), COALESCE(completedAt, NOW()), completedAt),
           updatedAt = NOW()
       WHERE referralId = ?`,
      [referralStatus, referralStatus, referralStatus, req.params.id]
    );

    await connection.commit();
    const [rows] = await pool.execute(buildReferralSelect('r.referralId = ?'), [req.params.id]);
    const [referral] = await attachReferralItems(rows);
    res.json(referral);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating external referral item:', error);
    res.status(500).json({ error: 'Failed to update external referral item', message: error.message });
  } finally {
    connection.release();
  }
});

router.get('/chemist/me', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const scope = await getChemistScopeForUser(user.id || user.userId);
    if (!scope) return res.status(403).json({ error: 'User is not assigned to an external chemist' });
    res.json(scope);
  } catch (error) {
    console.error('Error fetching chemist scope:', error);
    res.status(500).json({ error: 'Failed to fetch chemist scope', message: error.message });
  }
});

module.exports = router;
