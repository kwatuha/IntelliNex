const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { resolveReferralOrigin } = require('../lib/branchContext');

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

function normalizeDrugName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeTestName(value) {
  return normalizeDrugName(value);
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parsePositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw httpError(`${fieldName} must be a positive whole number`, 400);
  }
  return number;
}

function quantityRequiredForPrescriptionItem(item) {
  const quantity = Number(item.quantity ?? item.quantityReferred ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? Math.ceil(quantity) : 1;
}

function availabilityStatusForQuantity(quantity, minimumStockLevel = 0) {
  const current = Number(quantity) || 0;
  const minimum = Number(minimumStockLevel) || 0;
  if (current <= 0) return 'out_of_stock';
  if (minimum > 0 && current <= minimum) return 'low_stock';
  return 'available';
}

async function recordStockMovement(executor, movement) {
  if (!movement?.chemistDrugId || !movement?.chemistId || !Number(movement.quantityChange)) return;
  await executor.execute(
    `INSERT INTO external_chemist_stock_movements (
      chemistDrugId, chemistId, movementType, quantityChange, quantityBefore, quantityAfter,
      referenceType, referenceId, referralId, referralItemId, actorUserId, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.chemistDrugId,
      movement.chemistId,
      movement.movementType,
      movement.quantityChange,
      movement.quantityBefore,
      movement.quantityAfter,
      movement.referenceType || null,
      movement.referenceId || null,
      movement.referralId || null,
      movement.referralItemId || null,
      movement.actorUserId || null,
      movement.notes || null,
    ]
  );
}

async function getChemistScopeForUser(userId) {
  if (!userId) return null;
  const [rows] = await pool.execute(
    `SELECT ec.*, ecu.chemistUserId, ecu.isPrimary, ecu.canManageUsers
     FROM external_chemist_users ecu
     INNER JOIN external_chemists ec ON ecu.chemistId = ec.chemistId
     WHERE ecu.userId = ? AND ecu.isActive = 1 AND ec.isActive = 1
     ORDER BY ecu.isPrimary DESC, ecu.chemistUserId ASC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

function duplicateUserMessage(error) {
  if (error?.code !== 'ER_DUP_ENTRY' && error?.errno !== 1062) return null;
  const message = String(error.sqlMessage || error.message || '').toLowerCase();
  if (message.includes('username')) return 'Username already exists. Please choose another username.';
  if (message.includes('email')) return 'Email already exists. Please choose another email address.';
  return 'Username or email already exists. Please choose different login details.';
}

async function assertUserLoginAvailable(connection, username, email) {
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim();
  if (!normalizedUsername && !normalizedEmail) return;

  const conditions = [];
  const params = [];
  if (normalizedUsername) {
    conditions.push('username = ?');
    params.push(normalizedUsername);
  }
  if (normalizedEmail) {
    conditions.push('email = ?');
    params.push(normalizedEmail);
  }

  const [existing] = await connection.execute(
    `SELECT username, email FROM users WHERE ${conditions.join(' OR ')} LIMIT 1`,
    params
  );
  if (!existing.length) return;

  const conflict = new Error(
    existing[0].username === normalizedUsername
      ? 'Username already exists. Please choose another username.'
      : 'Email already exists. Please choose another email address.'
  );
  conflict.status = 409;
  throw conflict;
}

async function requirePrimaryChemistUser(req) {
  const user = getAuthUser(req);
  if (!user) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  const scope = await getChemistScopeForUser(user.id || user.userId);
  if (!scope) {
    const error = new Error('Chemist user is not assigned to a chemist');
    error.status = 403;
    throw error;
  }
  if (!scope.isPrimary && !scope.canManageUsers) {
    const error = new Error('Only the primary chemist user can manage chemist staff');
    error.status = 403;
    throw error;
  }
  return { user, scope };
}

async function resolveChemistIdForRequest(req, requestedChemistId = null) {
  const user = getAuthUser(req);
  if (user && isChemistUser(user)) {
    const scope = await getChemistScopeForUser(user.id || user.userId);
    if (!scope) {
      const error = new Error('Chemist user is not assigned to a chemist');
      error.status = 403;
      throw error;
    }
    return Number(scope.chemistId);
  }
  return Number(requestedChemistId);
}

async function fetchChemistDrugs(chemistId, filters = {}, executor = pool, options = {}) {
  const params = [chemistId];
  let query = `
    SELECT cda.*, m.name AS catalogMedicationName, m.medicationCode, m.dosageForm AS catalogDosageForm,
           m.strength AS catalogStrength, m.genericName AS catalogGenericName
    FROM external_chemist_drug_availability cda
    LEFT JOIN medications m ON cda.medicationId = m.medicationId
    WHERE cda.chemistId = ? AND cda.isActive = 1
  `;

  if (filters.status) {
    query += ' AND cda.availabilityStatus = ?';
    params.push(filters.status);
  }

  if (filters.search) {
    query += ` AND (
      cda.medicationName LIKE ? OR cda.genericName LIKE ? OR cda.strength LIKE ? OR cda.dosageForm LIKE ?
      OR m.name LIKE ? OR m.genericName LIKE ? OR m.medicationCode LIKE ?
    )`;
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term, term);
  }

  query += ` ORDER BY
    FIELD(cda.availabilityStatus, 'available', 'low_stock', 'unknown', 'out_of_stock'),
    cda.medicationName ASC`;
  if (options.lockForUpdate) {
    query += ' FOR UPDATE';
  }

  const [rows] = await executor.execute(query, params);
  return rows;
}

async function attachOutstandingDrugReservations(executor, chemistId, availabilityRows) {
  if (!availabilityRows.length) return availabilityRows;

  const [reservedRows] = await executor.execute(
    `SELECT
       ri.chemistDrugId,
       ri.medicationId,
       ri.medicationName,
       SUM(GREATEST(
         COALESCE(ri.quantityBalance, COALESCE(ri.quantityReferred, 0) - COALESCE(ri.quantityPicked, 0)),
         0
       )) AS reservedQuantity
     FROM prescription_external_referral_items ri
     INNER JOIN prescription_external_referrals r ON ri.referralId = r.referralId
     WHERE r.chemistId = ?
       AND r.referralType = 'drug'
       AND r.status NOT IN ('picked_up', 'completed', 'not_picked', 'cancelled')
       AND ri.status NOT IN ('picked_up', 'not_available', 'not_picked', 'cancelled')
     GROUP BY ri.chemistDrugId, ri.medicationId, ri.medicationName`,
    [chemistId]
  );

  return availabilityRows.map((row) => {
    const reservedQuantity = reservedRows.reduce((total, reserved) => {
      if (reserved.chemistDrugId && Number(reserved.chemistDrugId) === Number(row.chemistDrugId)) {
        return total + Number(reserved.reservedQuantity || 0);
      }
      if (!reserved.chemistDrugId && reserved.medicationId && row.medicationId && Number(reserved.medicationId) === Number(row.medicationId)) {
        return total + Number(reserved.reservedQuantity || 0);
      }
      if (!reserved.chemistDrugId && !reserved.medicationId) {
        const reservedName = normalizeDrugName(reserved.medicationName);
        const rowNames = [row.medicationName, row.genericName, row.catalogMedicationName, row.catalogGenericName]
          .map(normalizeDrugName)
          .filter(Boolean);
        if (reservedName && rowNames.includes(reservedName)) {
          return total + Number(reserved.reservedQuantity || 0);
        }
      }
      return total;
    }, 0);
    const quantityAvailable = Number(row.quantityAvailable || 0);
    return {
      ...row,
      reservedQuantity,
      availableForReferral: Math.max(quantityAvailable - reservedQuantity, 0),
    };
  });
}

async function lockChemistDrugAvailabilityRows(connection, chemistId) {
  await connection.execute(
    `SELECT chemistDrugId
     FROM external_chemist_drug_availability
     WHERE chemistId = ? AND isActive = 1
     FOR UPDATE`,
    [chemistId]
  );
}

async function fetchChemistLabs(chemistId, filters = {}) {
  const params = [chemistId];
  let query = `
    SELECT cla.*, ltt.testCode, ltt.testName AS catalogTestName, ltt.category AS catalogCategory,
           ltt.specimenType AS catalogSpecimenType, ltt.turnaroundTime AS catalogTurnaroundTime
    FROM external_chemist_lab_availability cla
    LEFT JOIN lab_test_types ltt ON cla.testTypeId = ltt.testTypeId
    WHERE cla.chemistId = ? AND cla.isActive = 1
  `;

  if (filters.status) {
    query += ' AND cla.availabilityStatus = ?';
    params.push(filters.status);
  }

  if (filters.search) {
    query += ` AND (
      cla.testName LIKE ? OR cla.category LIKE ? OR cla.specimenType LIKE ?
      OR ltt.testName LIKE ? OR ltt.testCode LIKE ? OR ltt.category LIKE ?
    )`;
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }

  query += ` ORDER BY FIELD(cla.availabilityStatus, 'available', 'unknown', 'unavailable'), cla.testName ASC`;
  const [rows] = await pool.execute(query, params);
  return rows;
}

async function upsertChemistLab(executor, chemistId, data) {
  let testName = data.testName || null;
  let category = data.category || null;
  let specimenType = data.specimenType || null;
  let turnaroundTime = data.turnaroundTime || null;
  const testTypeId = data.testTypeId || null;

  if (testTypeId) {
    const [tests] = await executor.execute('SELECT * FROM lab_test_types WHERE testTypeId = ?', [testTypeId]);
    if (tests.length) {
      testName = testName || tests[0].testName;
      category = category || tests[0].category;
      specimenType = specimenType || tests[0].specimenType;
      turnaroundTime = turnaroundTime || tests[0].turnaroundTime;
    }
  }

  if (!testName) {
    throw new Error('Test name is required');
  }

  const [existing] = testTypeId
    ? await executor.execute(
        'SELECT chemistLabId FROM external_chemist_lab_availability WHERE chemistId = ? AND testTypeId = ? LIMIT 1',
        [chemistId, testTypeId]
      )
    : await executor.execute(
        `SELECT chemistLabId FROM external_chemist_lab_availability
         WHERE chemistId = ? AND LOWER(TRIM(testName)) = LOWER(TRIM(?)) LIMIT 1`,
        [chemistId, testName]
      );

  const values = [
    testTypeId,
    testName,
    category,
    specimenType,
    turnaroundTime,
    data.availabilityStatus || 'unknown',
    data.price || null,
    data.notes || null,
  ];

  if (existing.length) {
    await executor.execute(
      `UPDATE external_chemist_lab_availability SET
        testTypeId = ?, testName = ?, category = ?, specimenType = ?, turnaroundTime = ?,
        availabilityStatus = ?, price = ?, lastConfirmedAt = NOW(), notes = ?, isActive = 1, updatedAt = NOW()
       WHERE chemistLabId = ? AND chemistId = ?`,
      [...values, existing[0].chemistLabId, chemistId]
    );
    return existing[0].chemistLabId;
  }

  const [result] = await executor.execute(
    `INSERT INTO external_chemist_lab_availability (
      chemistId, testTypeId, testName, category, specimenType, turnaroundTime,
      availabilityStatus, price, lastConfirmedAt, notes, isActive
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 1)`,
    [chemistId, ...values]
  );
  return result.insertId;
}

async function upsertChemistDrug(executor, chemistId, data, options = {}) {
  let medicationName = data.medicationName || null;
  let genericName = data.genericName || null;
  let dosageForm = data.dosageForm || null;
  let strength = data.strength || null;
  const medicationId = data.medicationId || null;

  if (medicationId) {
    const [medications] = await executor.execute('SELECT * FROM medications WHERE medicationId = ?', [medicationId]);
    if (medications.length) {
      medicationName = medicationName || medications[0].name;
      genericName = genericName || medications[0].genericName;
      dosageForm = dosageForm || medications[0].dosageForm;
      strength = strength || medications[0].strength;
    }
  }

  if (!medicationName) {
    throw new Error('Medication name is required');
  }

  const [existing] = medicationId
    ? await executor.execute(
        'SELECT chemistDrugId, quantityAvailable FROM external_chemist_drug_availability WHERE chemistId = ? AND medicationId = ? LIMIT 1',
        [chemistId, medicationId]
      )
    : await executor.execute(
        `SELECT chemistDrugId, quantityAvailable FROM external_chemist_drug_availability
         WHERE chemistId = ? AND LOWER(TRIM(medicationName)) = LOWER(TRIM(?)) LIMIT 1`,
        [chemistId, medicationName]
      );

  const values = [
    medicationId,
    medicationName,
    data.brandName || null,
    genericName,
    strength,
    dosageForm,
    data.packSize || null,
    data.quantityAvailable ?? 0,
    data.minimumStockLevel ?? 0,
    data.availabilityStatus || 'unknown',
    data.unitPrice || null,
    data.expiryDate || null,
    data.restockEta || null,
    data.supplierName || null,
    data.notes || null,
    options.imported ? new Date() : null,
  ];

  if (existing.length) {
    const quantityBefore = Number(existing[0].quantityAvailable) || 0;
    const quantityAfter = Number(data.quantityAvailable ?? 0) || 0;
    await executor.execute(
      `UPDATE external_chemist_drug_availability SET
        medicationId = ?, medicationName = ?, brandName = ?, genericName = ?, strength = ?, dosageForm = ?,
        packSize = ?, quantityAvailable = ?, minimumStockLevel = ?, availabilityStatus = ?, unitPrice = ?,
        expiryDate = ?, restockEta = ?, supplierName = ?, notes = ?, lastConfirmedAt = NOW(),
        lastImportedAt = COALESCE(?, lastImportedAt), isActive = 1, updatedAt = NOW()
       WHERE chemistDrugId = ? AND chemistId = ?`,
      [...values, existing[0].chemistDrugId, chemistId]
    );
    const delta = quantityAfter - quantityBefore;
    if (delta !== 0) {
      await recordStockMovement(executor, {
        chemistDrugId: existing[0].chemistDrugId,
        chemistId,
        movementType: options.imported ? 'import' : delta > 0 ? 'adjustment_in' : 'adjustment_out',
        quantityChange: delta,
        quantityBefore,
        quantityAfter,
        referenceType: options.imported ? 'bulk_import' : 'availability_update',
        actorUserId: options.actorUserId,
        notes: data.notes || null,
      });
    }
    return existing[0].chemistDrugId;
  }

  const initialQuantity = Number(data.quantityAvailable ?? 0) || 0;
  const [result] = await executor.execute(
    `INSERT INTO external_chemist_drug_availability (
      chemistId, medicationId, medicationName, brandName, genericName, strength, dosageForm, packSize,
      quantityAvailable, minimumStockLevel, availabilityStatus, unitPrice, expiryDate, restockEta,
      supplierName, lastConfirmedAt, lastImportedAt, notes, isActive
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 1)`,
    [
      chemistId,
      medicationId,
      medicationName,
      data.brandName || null,
      genericName,
      strength,
      dosageForm,
      data.packSize || null,
      data.quantityAvailable ?? 0,
      data.minimumStockLevel ?? 0,
      data.availabilityStatus || 'unknown',
      data.unitPrice || null,
      data.expiryDate || null,
      data.restockEta || null,
      data.supplierName || null,
      options.imported ? new Date() : null,
      data.notes || null,
    ]
  );
  if (initialQuantity !== 0) {
    await recordStockMovement(executor, {
      chemistDrugId: result.insertId,
      chemistId,
      movementType: options.imported ? 'import' : 'initial',
      quantityChange: initialQuantity,
      quantityBefore: 0,
      quantityAfter: initialQuantity,
      referenceType: options.imported ? 'bulk_import' : 'availability_create',
      actorUserId: options.actorUserId,
      notes: data.notes || null,
    });
  }
  return result.insertId;
}

async function recordStockAlert(executor, chemistId, item, availability, context = {}) {
  const alertType =
    availability.availabilityStatus === 'out_of_stock'
      ? 'out_of_stock'
      : availability.displayStatus === 'stale'
        ? 'stale'
        : availability.availabilityStatus === 'low_stock'
          ? 'low_stock'
          : availability.availabilityStatus === 'not_listed'
            ? 'not_listed'
            : null;

  if (!alertType) return;

  const medicationName = item.medicationName || item.medicationNameFromCatalog || availability.medicationName || 'Medication';
  const medicationKey = item.medicationId
    ? `id:${item.medicationId}`
    : `name:${normalizeDrugName(medicationName)}`;

  await executor.execute(
    `INSERT INTO external_chemist_stock_alerts (
      chemistId, medicationId, medicationKey, medicationName, alertType, requestCount,
      lastPrescriptionId, lastReferralId, lastRequestedAt, status
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW(), 'open')
    ON DUPLICATE KEY UPDATE
      requestCount = requestCount + 1,
      lastPrescriptionId = VALUES(lastPrescriptionId),
      lastReferralId = COALESCE(VALUES(lastReferralId), lastReferralId),
      lastRequestedAt = NOW(),
      updatedAt = NOW()`,
    [
      chemistId,
      item.medicationId || null,
      medicationKey,
      medicationName,
      alertType,
      context.prescriptionId || null,
      context.referralId || null,
    ]
  );
}

function matchAvailabilityForPrescriptionItem(item, availabilityRows) {
  const itemNames = [
    item.medicationName,
    item.medicationNameFromCatalog,
    item.genericName,
  ].map(normalizeDrugName).filter(Boolean);

  const byMedicationId = item.medicationId
    ? availabilityRows.find((row) => Number(row.medicationId) === Number(item.medicationId))
    : null;

  const byExactName = availabilityRows.find((row) => {
    const rowNames = [row.medicationName, row.genericName, row.catalogMedicationName, row.catalogGenericName]
      .map(normalizeDrugName)
      .filter(Boolean);
    return rowNames.some((rowName) => itemNames.includes(rowName));
  });

  const byPartialName = availabilityRows.find((row) => {
    const rowNames = [row.medicationName, row.genericName, row.catalogMedicationName, row.catalogGenericName]
      .map(normalizeDrugName)
      .filter(Boolean);
    return rowNames.some((rowName) => itemNames.some((itemName) => rowName.includes(itemName) || itemName.includes(rowName)));
  });

  const match = byMedicationId || byExactName || byPartialName || null;
  if (!match) {
    return {
      matched: false,
      availabilityStatus: 'not_listed',
      displayStatus: 'not_listed',
      quantityAvailable: 0,
      lastConfirmedAt: null,
      stale: true,
    };
  }

  const lastConfirmedAt = match.lastConfirmedAt ? new Date(match.lastConfirmedAt) : null;
  const stale = !lastConfirmedAt || (Date.now() - lastConfirmedAt.getTime()) > 7 * 24 * 60 * 60 * 1000;
  return {
    matched: true,
    availabilityStatus: match.availabilityStatus,
    displayStatus: stale ? 'stale' : match.availabilityStatus,
    quantityAvailable: match.quantityAvailable ?? 0,
    reservedQuantity: match.reservedQuantity ?? 0,
    availableForReferral: match.availableForReferral ?? match.quantityAvailable ?? 0,
    unitPrice: match.unitPrice,
    expiryDate: match.expiryDate,
    lastConfirmedAt: match.lastConfirmedAt,
    stale,
    chemistDrugId: match.chemistDrugId,
    medicationName: match.medicationName,
    genericName: match.genericName,
    strength: match.strength || match.catalogStrength,
    dosageForm: match.dosageForm || match.catalogDosageForm,
    notes: match.notes,
  };
}

function matchAvailabilityForLabItem(item, availabilityRows) {
  const itemNames = [item.testName, item.catalogTestName]
    .map(normalizeTestName)
    .filter(Boolean);

  const byTestTypeId = item.testTypeId
    ? availabilityRows.find((row) => Number(row.testTypeId) === Number(item.testTypeId))
    : null;

  const byExactName = availabilityRows.find((row) => {
    const rowNames = [row.testName, row.catalogTestName].map(normalizeTestName).filter(Boolean);
    return rowNames.some((rowName) => itemNames.includes(rowName));
  });

  const byPartialName = availabilityRows.find((row) => {
    const rowNames = [row.testName, row.catalogTestName].map(normalizeTestName).filter(Boolean);
    return rowNames.some((rowName) => itemNames.some((itemName) => rowName.includes(itemName) || itemName.includes(rowName)));
  });

  const match = byTestTypeId || byExactName || byPartialName || null;
  if (!match) {
    return {
      matched: false,
      availabilityStatus: 'not_listed',
      displayStatus: 'not_listed',
      stale: true,
    };
  }

  const lastConfirmedAt = match.lastConfirmedAt ? new Date(match.lastConfirmedAt) : null;
  const stale = !lastConfirmedAt || (Date.now() - lastConfirmedAt.getTime()) > 14 * 24 * 60 * 60 * 1000;
  return {
    matched: true,
    availabilityStatus: match.availabilityStatus,
    displayStatus: stale ? 'stale' : match.availabilityStatus,
    price: match.price,
    lastConfirmedAt: match.lastConfirmedAt,
    stale,
    chemistLabId: match.chemistLabId,
    testName: match.testName,
    category: match.category || match.catalogCategory,
    specimenType: match.specimenType || match.catalogSpecimenType,
    turnaroundTime: match.turnaroundTime || match.catalogTurnaroundTime,
    notes: match.notes,
  };
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
  await assertUserLoginAvailable(connection, data.username, email);
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
           ob.branchName AS originBranchName, ob.branchCode AS originBranchCode,
           os.storeName AS originStoreName, os.location AS originStoreLocation,
           p.prescriptionNumber, p.prescriptionDate,
           lo.orderNumber AS labOrderNumber, lo.orderDate AS labOrderDate, lo.priority AS labPriority,
           pt.patientNumber, pt.firstName AS patientFirstName, pt.lastName AS patientLastName, pt.phone AS patientPhone,
           dr.firstName AS doctorFirstName, dr.lastName AS doctorLastName, dr.username AS doctorUsername,
           rb.firstName AS referredByFirstName, rb.lastName AS referredByLastName, rb.username AS referredByUsername
    FROM prescription_external_referrals r
    INNER JOIN external_chemists ec ON r.chemistId = ec.chemistId
    LEFT JOIN branches ob ON r.branchId = ob.branchId
    LEFT JOIN drug_stores os ON r.originStoreId = os.storeId
    LEFT JOIN prescriptions p ON r.prescriptionId = p.prescriptionId
    LEFT JOIN lab_test_orders lo ON r.labOrderId = lo.orderId
    INNER JOIN patients pt ON r.patientId = pt.patientId
    LEFT JOIN users dr ON COALESCE(p.doctorId, lo.orderedBy) = dr.userId
    LEFT JOIN users rb ON r.referredBy = rb.userId
    WHERE ${whereClause}
  `;
}

async function attachReferralItems(referrals) {
  if (!referrals.length) return referrals;
  const ids = referrals.map((r) => r.referralId);
  const placeholders = ids.map(() => '?').join(',');
  const [items] = await pool.execute(
    `SELECT ri.*, pi.status AS prescriptionItemStatus,
            du.firstName AS dispensedByFirstName, du.lastName AS dispensedByLastName, du.username AS dispensedByUsername
     FROM prescription_external_referral_items ri
     LEFT JOIN prescription_items pi ON ri.prescriptionItemId = pi.itemId
     LEFT JOIN users du ON ri.dispensedBy = du.userId
     WHERE ri.referralId IN (${placeholders})
     ORDER BY ri.referralItemId ASC`,
    ids
  );
  const [labItems] = await pool.execute(
    `SELECT lri.*, loi.status AS labOrderItemStatus, ltt.category, ltt.turnaroundTime, ltt.preparationInstructions,
            cu.firstName AS completedByFirstName, cu.lastName AS completedByLastName, cu.username AS completedByUsername,
            'lab' AS itemType
     FROM prescription_external_lab_referral_items lri
     LEFT JOIN lab_test_order_items loi ON lri.labOrderItemId = loi.itemId
     LEFT JOIN lab_test_types ltt ON lri.testTypeId = ltt.testTypeId
     LEFT JOIN users cu ON lri.completedBy = cu.userId
     WHERE lri.referralId IN (${placeholders})
     ORDER BY lri.referralLabItemId ASC`,
    ids
  );
  const byReferral = new Map();
  for (const item of items) {
    if (!byReferral.has(item.referralId)) byReferral.set(item.referralId, []);
    byReferral.get(item.referralId).push({ ...item, itemType: 'drug', displayName: item.medicationName });
  }
  for (const item of labItems) {
    if (!byReferral.has(item.referralId)) byReferral.set(item.referralId, []);
    byReferral.get(item.referralId).push({
      ...item,
      referralItemId: item.referralLabItemId,
      medicationName: item.testName,
      displayName: item.testName,
      quantityReferred: 1,
      quantityPicked: item.status === 'completed' ? 1 : 0,
      dosage: item.specimenType || item.category || null,
      frequency: item.turnaroundTime || null,
      duration: null,
      instructions: item.preparationInstructions || null,
    });
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

router.get('/external-chemists/:chemistId/drugs', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    if (!chemistId) return res.status(400).json({ error: 'chemistId is required' });
    const rows = await fetchChemistDrugs(chemistId, req.query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching chemist drugs:', error);
    res.status(error.status || 500).json({ error: 'Failed to fetch chemist drugs', message: error.message });
  }
});

router.post('/external-chemists/:chemistId/drugs', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const authUser = getAuthUser(req);
    if (!chemistId) return res.status(400).json({ error: 'chemistId is required' });
    const data = req.body || {};
    if (!data.medicationName && !data.medicationId) {
      return res.status(400).json({ error: 'medicationName or medicationId is required' });
    }

    const id = await upsertChemistDrug(pool, chemistId, data, { actorUserId: authUser?.id || authUser?.userId || null });
    const [rows] = await pool.execute(
      'SELECT * FROM external_chemist_drug_availability WHERE chemistId = ? AND chemistDrugId = ?',
      [chemistId, id]
    );
    res.status(201).json(rows[0] || { chemistId });
  } catch (error) {
    console.error('Error saving chemist drug:', error);
    res.status(error.status || 500).json({ error: 'Failed to save chemist drug', message: error.message });
  }
});

router.post('/external-chemists/:chemistId/drugs/bulk', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const authUser = getAuthUser(req);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!chemistId) return res.status(400).json({ error: 'chemistId is required' });
    if (!rows.length) return res.status(400).json({ error: 'No rows supplied for import' });

    await connection.beginTransaction();
    let imported = 0;
    const errors = [];

    for (const [index, row] of rows.entries()) {
      try {
        if (!row.medicationName && !row.medicationId) {
          errors.push({ row: index + 1, message: 'Medication name is required' });
          continue;
        }
        await upsertChemistDrug(connection, chemistId, row, { imported: true, actorUserId: authUser?.id || authUser?.userId || null });
        imported += 1;
      } catch (error) {
        errors.push({ row: index + 1, message: error.message });
      }
    }

    await connection.commit();
    res.json({ imported, failed: errors.length, errors });
  } catch (error) {
    await connection.rollback();
    console.error('Error importing chemist drugs:', error);
    res.status(error.status || 500).json({ error: 'Failed to import chemist drugs', message: error.message });
  } finally {
    connection.release();
  }
});

router.put('/external-chemists/:chemistId/drugs/:chemistDrugId', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const authUser = getAuthUser(req);
    const data = req.body || {};
    const [beforeRows] = await pool.execute(
      'SELECT chemistDrugId, quantityAvailable FROM external_chemist_drug_availability WHERE chemistDrugId = ? AND chemistId = ?',
      [req.params.chemistDrugId, chemistId]
    );
    if (!beforeRows.length) return res.status(404).json({ error: 'Drug availability record not found' });
    const quantityBefore = Number(beforeRows[0].quantityAvailable) || 0;
    const quantityAfter = Number(data.quantityAvailable ?? 0) || 0;
    await pool.execute(
      `UPDATE external_chemist_drug_availability SET
        medicationId = ?, medicationName = ?, brandName = ?, genericName = ?, strength = ?, dosageForm = ?,
        packSize = ?, quantityAvailable = ?, minimumStockLevel = ?, availabilityStatus = ?, unitPrice = ?,
        expiryDate = ?, restockEta = ?, supplierName = ?, lastConfirmedAt = NOW(),
        notes = ?, isActive = ?, updatedAt = NOW()
       WHERE chemistDrugId = ? AND chemistId = ?`,
      [
        data.medicationId || null,
        data.medicationName,
        data.brandName || null,
        data.genericName || null,
        data.strength || null,
        data.dosageForm || null,
        data.packSize || null,
        data.quantityAvailable ?? 0,
        data.minimumStockLevel ?? 0,
        data.availabilityStatus || 'unknown',
        data.unitPrice || null,
        data.expiryDate || null,
        data.restockEta || null,
        data.supplierName || null,
        data.notes || null,
        data.isActive === false ? 0 : 1,
        req.params.chemistDrugId,
        chemistId,
      ]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM external_chemist_drug_availability WHERE chemistDrugId = ? AND chemistId = ?',
      [req.params.chemistDrugId, chemistId]
    );
    const delta = quantityAfter - quantityBefore;
    if (delta !== 0) {
      await recordStockMovement(pool, {
        chemistDrugId: Number(req.params.chemistDrugId),
        chemistId,
        movementType: delta > 0 ? 'adjustment_in' : 'adjustment_out',
        quantityChange: delta,
        quantityBefore,
        quantityAfter,
        referenceType: 'availability_update',
        actorUserId: authUser?.id || authUser?.userId || null,
        notes: data.notes || null,
      });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating chemist drug:', error);
    res.status(error.status || 500).json({ error: 'Failed to update chemist drug', message: error.message });
  }
});

router.delete('/external-chemists/:chemistId/drugs/:chemistDrugId', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const authUser = getAuthUser(req);
    const [beforeRows] = await pool.execute(
      'SELECT chemistDrugId, quantityAvailable FROM external_chemist_drug_availability WHERE chemistDrugId = ? AND chemistId = ?',
      [req.params.chemistDrugId, chemistId]
    );
    if (!beforeRows.length) return res.status(404).json({ error: 'Drug availability record not found' });
    const quantityBefore = Number(beforeRows[0].quantityAvailable) || 0;
    await pool.execute(
      `UPDATE external_chemist_drug_availability
       SET quantityAvailable = 0, availabilityStatus = 'out_of_stock', isActive = 0, updatedAt = NOW()
       WHERE chemistDrugId = ? AND chemistId = ?`,
      [req.params.chemistDrugId, chemistId]
    );
    if (quantityBefore !== 0) {
      await recordStockMovement(pool, {
        chemistDrugId: Number(req.params.chemistDrugId),
        chemistId,
        movementType: 'remove',
        quantityChange: -quantityBefore,
        quantityBefore,
        quantityAfter: 0,
        referenceType: 'availability_remove',
        actorUserId: authUser?.id || authUser?.userId || null,
      });
    }
    res.json({ message: 'Drug removed from chemist availability list' });
  } catch (error) {
    console.error('Error deleting chemist drug:', error);
    res.status(error.status || 500).json({ error: 'Failed to delete chemist drug', message: error.message });
  }
});

router.get('/external-chemists/:chemistId/drugs/:chemistDrugId/movements', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const limit = Math.min(Number(req.query.limit) || 100, 250);
    const [rows] = await pool.execute(
      `SELECT sm.*,
              u.firstName AS actorFirstName, u.lastName AS actorLastName, u.username AS actorUsername,
              r.referralNumber,
              ri.medicationName AS referralMedicationName,
              ri.quantityReferred,
              ri.quantityPicked AS referralQuantityPicked,
              ri.quantityBalance,
              p.prescriptionNumber,
              pr.firstName AS prescribedByFirstName, pr.lastName AS prescribedByLastName, pr.username AS prescribedByUsername
       FROM external_chemist_stock_movements sm
       LEFT JOIN users u ON sm.actorUserId = u.userId
       LEFT JOIN prescription_external_referrals r ON sm.referralId = r.referralId
       LEFT JOIN prescription_external_referral_items ri ON sm.referralItemId = ri.referralItemId
       LEFT JOIN prescriptions p ON r.prescriptionId = p.prescriptionId
       LEFT JOIN users pr ON p.doctorId = pr.userId
       WHERE sm.chemistId = ? AND sm.chemistDrugId = ?
       ORDER BY sm.createdAt DESC, sm.movementId DESC
       LIMIT ?`,
      [chemistId, req.params.chemistDrugId, limit]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching chemist stock movements:', error);
    res.status(error.status || 500).json({ error: 'Failed to fetch stock movements', message: error.message });
  }
});

router.get('/external-chemists/:chemistId/labs', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    if (!chemistId) return res.status(400).json({ error: 'chemistId is required' });
    const rows = await fetchChemistLabs(chemistId, req.query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching chemist labs:', error);
    res.status(error.status || 500).json({ error: 'Failed to fetch chemist labs', message: error.message });
  }
});

router.post('/external-chemists/:chemistId/labs', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    if (!chemistId) return res.status(400).json({ error: 'chemistId is required' });
    const data = req.body || {};
    if (!data.testName && !data.testTypeId) {
      return res.status(400).json({ error: 'testName or testTypeId is required' });
    }

    const id = await upsertChemistLab(pool, chemistId, data);
    await pool.execute('UPDATE external_chemists SET hasLaboratory = 1, updatedAt = NOW() WHERE chemistId = ?', [chemistId]);
    const [rows] = await pool.execute(
      'SELECT * FROM external_chemist_lab_availability WHERE chemistId = ? AND chemistLabId = ?',
      [chemistId, id]
    );
    res.status(201).json(rows[0] || { chemistId });
  } catch (error) {
    console.error('Error saving chemist lab:', error);
    res.status(error.status || 500).json({ error: 'Failed to save chemist lab', message: error.message });
  }
});

router.put('/external-chemists/:chemistId/labs/:chemistLabId', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const data = req.body || {};
    await pool.execute(
      `UPDATE external_chemist_lab_availability SET
        testTypeId = ?, testName = ?, category = ?, specimenType = ?, turnaroundTime = ?,
        availabilityStatus = ?, price = ?, lastConfirmedAt = NOW(), notes = ?, isActive = ?, updatedAt = NOW()
       WHERE chemistLabId = ? AND chemistId = ?`,
      [
        data.testTypeId || null,
        data.testName,
        data.category || null,
        data.specimenType || null,
        data.turnaroundTime || null,
        data.availabilityStatus || 'unknown',
        data.price || null,
        data.notes || null,
        data.isActive === false ? 0 : 1,
        req.params.chemistLabId,
        chemistId,
      ]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM external_chemist_lab_availability WHERE chemistLabId = ? AND chemistId = ?',
      [req.params.chemistLabId, chemistId]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating chemist lab:', error);
    res.status(error.status || 500).json({ error: 'Failed to update chemist lab', message: error.message });
  }
});

router.delete('/external-chemists/:chemistId/labs/:chemistLabId', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    await pool.execute(
      'UPDATE external_chemist_lab_availability SET isActive = 0, updatedAt = NOW() WHERE chemistLabId = ? AND chemistId = ?',
      [req.params.chemistLabId, chemistId]
    );
    res.json({ message: 'Lab test removed from chemist availability list' });
  } catch (error) {
    console.error('Error deleting chemist lab:', error);
    res.status(error.status || 500).json({ error: 'Failed to delete chemist lab', message: error.message });
  }
});

router.get('/external-chemists/:chemistId/priority-drugs', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.params.chemistId);
    const limit = Math.min(Number(req.query.limit || 100), 300);
    const [chemistRows] = await pool.execute(
      `SELECT
         COALESCE(ri.medicationId, pi.medicationId) AS medicationId,
         COALESCE(ri.medicationName, m.name) AS medicationName,
         MAX(m.genericName) AS genericName,
         MAX(m.strength) AS strength,
         MAX(m.dosageForm) AS dosageForm,
         COUNT(*) AS referralCount,
         MAX(r.referralDate) AS lastReferredAt
       FROM prescription_external_referral_items ri
       INNER JOIN prescription_external_referrals r ON ri.referralId = r.referralId
       LEFT JOIN prescription_items pi ON ri.prescriptionItemId = pi.itemId
       LEFT JOIN medications m ON COALESCE(ri.medicationId, pi.medicationId) = m.medicationId
       WHERE r.chemistId = ?
       GROUP BY COALESCE(ri.medicationId, pi.medicationId), COALESCE(ri.medicationName, m.name)
       ORDER BY referralCount DESC, lastReferredAt DESC
       LIMIT ${limit}`,
      [chemistId]
    );

    const [globalRows] = await pool.execute(
      `SELECT
         pi.medicationId,
         COALESCE(pi.medicationName, m.name) AS medicationName,
         MAX(m.genericName) AS genericName,
         MAX(m.strength) AS strength,
         MAX(m.dosageForm) AS dosageForm,
         COUNT(*) AS referralCount,
         MAX(p.prescriptionDate) AS lastReferredAt
       FROM prescription_items pi
       INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
       LEFT JOIN medications m ON pi.medicationId = m.medicationId
       GROUP BY pi.medicationId, COALESCE(pi.medicationName, m.name)
       ORDER BY referralCount DESC, lastReferredAt DESC
       LIMIT ${limit}`
    );

    const seen = new Set();
    const rows = [...chemistRows, ...globalRows].filter((row) => {
      const key = row.medicationId ? `id:${row.medicationId}` : `name:${normalizeDrugName(row.medicationName)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching priority chemist drugs:', error);
    res.status(error.status || 500).json({ error: 'Failed to fetch priority drugs', message: error.message });
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
        `INSERT INTO external_chemist_users (chemistId, userId, isPrimary, isActive, canManageUsers)
         VALUES (?, ?, 1, 1, 1)
         ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary), isActive = VALUES(isActive), canManageUsers = VALUES(canManageUsers), updatedAt = NOW()`,
        [result.insertId, linkedUserId]
      );
    }

    await connection.commit();
    const [rows] = await pool.execute('SELECT * FROM external_chemists WHERE chemistId = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating external chemist:', error);
    const duplicateMessage = duplicateUserMessage(error);
    if (duplicateMessage) {
      return res.status(409).json({ error: duplicateMessage });
    }
    res.status(error.status || 500).json({ error: error.status === 409 ? error.message : 'Failed to create external chemist', message: error.message });
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
        `INSERT INTO external_chemist_users (chemistId, userId, isPrimary, isActive, canManageUsers)
         VALUES (?, ?, 1, 1, 1)
         ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary), isActive = VALUES(isActive), canManageUsers = VALUES(canManageUsers), updatedAt = NOW()`,
        [req.params.id, linkedUserId]
      );
    }

    await connection.commit();
    const [rows] = await pool.execute('SELECT * FROM external_chemists WHERE chemistId = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating external chemist:', error);
    const duplicateMessage = duplicateUserMessage(error);
    if (duplicateMessage) {
      return res.status(409).json({ error: duplicateMessage });
    }
    res.status(error.status || 500).json({ error: error.status === 409 ? error.message : 'Failed to update external chemist', message: error.message });
  } finally {
    connection.release();
  }
});

router.get('/external-referrals', async (req, res) => {
  try {
    const user = getAuthUser(req);
    const params = [];
    const conditions = [];
    const { status, chemistId, patientId, search, referralType } = req.query;
    const branchId = req.query.branchId || req.headers['x-branch-id'];

    if (user && isChemistUser(user)) {
      const scope = await getChemistScopeForUser(user.id || user.userId);
      if (!scope) return res.status(403).json({ error: 'Chemist user is not assigned to a chemist' });
      conditions.push('r.chemistId = ?');
      params.push(scope.chemistId);
    } else {
      if (chemistId) {
        conditions.push('r.chemistId = ?');
        params.push(chemistId);
      }
      if (branchId && String(branchId) !== 'all') {
        conditions.push('r.branchId = ?');
        params.push(branchId);
      }
    }

    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (referralType) {
      conditions.push('r.referralType = ?');
      params.push(referralType);
    }
    if (patientId) {
      conditions.push('r.patientId = ?');
      params.push(patientId);
    }
    if (search) {
      conditions.push(`(
        r.referralNumber LIKE ? OR r.pickupCode LIKE ? OR pt.firstName LIKE ? OR pt.lastName LIKE ? OR pt.patientNumber LIKE ?
        OR ec.chemistName LIKE ? OR p.prescriptionNumber LIKE ? OR lo.orderNumber LIKE ?
        OR ob.branchName LIKE ? OR os.storeName LIKE ? OR r.originLocationLabel LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term, term, term, term, term);
    }

    const where = conditions.length ? conditions.join(' AND ') : '1=1';
    const [rows] = await pool.execute(`${buildReferralSelect(where)} ORDER BY r.referralDate DESC, r.referralId DESC`, params);
    res.json(await attachReferralItems(rows));
  } catch (error) {
    console.error('Error fetching external referrals:', error);
    res.status(500).json({ error: 'Failed to fetch external referrals', message: error.message });
  }
});

router.get('/external-referrals/availability', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.query.chemistId);
    const prescriptionId = Number(req.query.prescriptionId);
    const itemIds = String(req.query.itemIds || '')
      .split(',')
      .map((id) => Number(id))
      .filter(Boolean);

    if (!chemistId || !prescriptionId) {
      return res.status(400).json({ error: 'chemistId and prescriptionId are required' });
    }

    let itemQuery = `
      SELECT pi.*, m.name AS medicationNameFromCatalog, m.genericName
      FROM prescription_items pi
      LEFT JOIN medications m ON pi.medicationId = m.medicationId
      WHERE pi.prescriptionId = ?
    `;
    const itemParams = [prescriptionId];
    if (itemIds.length) {
      itemQuery += ` AND pi.itemId IN (${itemIds.map(() => '?').join(',')})`;
      itemParams.push(...itemIds);
    }
    itemQuery += ' ORDER BY pi.itemId ASC';

    const [items] = await pool.execute(itemQuery, itemParams);
    const availabilityRows = await attachOutstandingDrugReservations(pool, chemistId, await fetchChemistDrugs(chemistId));
    const matchedItems = items.map((item) => {
      const availability = matchAvailabilityForPrescriptionItem(item, availabilityRows);
      const requiredQuantity = quantityRequiredForPrescriptionItem(item);
      return {
        ...item,
        requiredQuantity,
        availability: {
          ...availability,
          hasEnoughQuantity: Number(availability.availableForReferral || 0) >= requiredQuantity,
          quantityShortfall: Math.max(requiredQuantity - Number(availability.availableForReferral || 0), 0),
        },
      };
    });

    const totals = {
      total: matchedItems.length,
      available: matchedItems.filter((item) => (
        ['available', 'low_stock'].includes(item.availability.availabilityStatus) &&
        !item.availability.stale &&
        item.availability.hasEnoughQuantity
      )).length,
      lowStock: matchedItems.filter((item) => item.availability.availabilityStatus === 'low_stock' && !item.availability.stale).length,
      outOfStock: matchedItems.filter((item) => item.availability.availabilityStatus === 'out_of_stock' && !item.availability.stale).length,
      notListed: matchedItems.filter((item) => item.availability.availabilityStatus === 'not_listed').length,
      stale: matchedItems.filter((item) => item.availability.stale && item.availability.matched).length,
      insufficientQuantity: matchedItems.filter((item) => item.availability.matched && !item.availability.hasEnoughQuantity).length,
    };

    res.json({
      chemistId,
      prescriptionId,
      totals,
      items: matchedItems,
      hasAllAvailable: totals.total > 0 && totals.available === totals.total,
    });
  } catch (error) {
    console.error('Error checking chemist availability:', error);
    res.status(error.status || 500).json({ error: 'Failed to check chemist availability', message: error.message });
  }
});

router.get('/external-referrals/lab-availability', async (req, res) => {
  try {
    const chemistId = await resolveChemistIdForRequest(req, req.query.chemistId);
    const labOrderId = Number(req.query.labOrderId);
    const itemIds = String(req.query.itemIds || '')
      .split(',')
      .map((id) => Number(id))
      .filter(Boolean);

    if (!chemistId || !labOrderId) {
      return res.status(400).json({ error: 'chemistId and labOrderId are required' });
    }

    let itemQuery = `
      SELECT loi.*, ltt.testName, ltt.category, ltt.specimenType, ltt.turnaroundTime, ltt.testName AS catalogTestName
      FROM lab_test_order_items loi
      INNER JOIN lab_test_types ltt ON loi.testTypeId = ltt.testTypeId
      WHERE loi.orderId = ?
    `;
    const itemParams = [labOrderId];
    if (itemIds.length) {
      itemQuery += ` AND loi.itemId IN (${itemIds.map(() => '?').join(',')})`;
      itemParams.push(...itemIds);
    }
    itemQuery += ' ORDER BY loi.itemId ASC';

    const [items] = await pool.execute(itemQuery, itemParams);
    const availabilityRows = await fetchChemistLabs(chemistId);
    const matchedItems = items.map((item) => ({
      ...item,
      availability: matchAvailabilityForLabItem(item, availabilityRows),
    }));

    const totals = {
      total: matchedItems.length,
      available: matchedItems.filter((item) => item.availability.availabilityStatus === 'available' && !item.availability.stale).length,
      unavailable: matchedItems.filter((item) => item.availability.availabilityStatus === 'unavailable' && !item.availability.stale).length,
      notListed: matchedItems.filter((item) => item.availability.availabilityStatus === 'not_listed').length,
      stale: matchedItems.filter((item) => item.availability.stale && item.availability.matched).length,
    };

    res.json({
      chemistId,
      labOrderId,
      totals,
      items: matchedItems,
      hasAllAvailable: totals.total > 0 && totals.available === totals.total,
    });
  } catch (error) {
    console.error('Error checking chemist lab availability:', error);
    res.status(error.status || 500).json({ error: 'Failed to check chemist lab availability', message: error.message });
  }
});

router.post('/external-referrals', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const user = getAuthUser(req);
    const data = req.body || {};
    const referralType = data.referralType === 'lab' ? 'lab' : 'drug';
    const prescriptionId = Number(data.prescriptionId);
    const labOrderId = Number(data.labOrderId);
    const chemistId = Number(data.chemistId);
    const itemIds = Array.isArray(data.itemIds) ? data.itemIds.map(Number).filter(Boolean) : [];

    if ((referralType === 'drug' && !prescriptionId) || (referralType === 'lab' && !labOrderId) || !chemistId) {
      await connection.rollback();
      return res.status(400).json({ error: referralType === 'lab' ? 'labOrderId and chemistId are required' : 'prescriptionId and chemistId are required' });
    }

    if (referralType === 'lab') {
      const [labOrders] = await connection.execute('SELECT * FROM lab_test_orders WHERE orderId = ?', [labOrderId]);
      if (!labOrders.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Lab order not found' });
      }

      const [chemists] = await connection.execute('SELECT * FROM external_chemists WHERE chemistId = ? AND isActive = 1', [chemistId]);
      if (!chemists.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'Active chemist not found' });
      }

      let labItemQuery = `
        SELECT loi.*, ltt.testName, ltt.specimenType
        FROM lab_test_order_items loi
        INNER JOIN lab_test_types ltt ON loi.testTypeId = ltt.testTypeId
        WHERE loi.orderId = ?
      `;
      const labItemParams = [labOrderId];
      if (itemIds.length) {
        labItemQuery += ` AND loi.itemId IN (${itemIds.map(() => '?').join(',')})`;
        labItemParams.push(...itemIds);
      }
      const [labItems] = await connection.execute(labItemQuery, labItemParams);
      if (!labItems.length) {
        await connection.rollback();
        return res.status(400).json({ error: 'No lab order items found for referral' });
      }

      const labAvailabilityRows = await fetchChemistLabs(chemistId);
      const unavailableLabItems = labItems
        .map((item) => ({ item, availability: matchAvailabilityForLabItem(item, labAvailabilityRows) }))
        .filter(({ availability }) => (
          !availability.matched ||
          availability.stale ||
          availability.availabilityStatus !== 'available'
        ));
      if (unavailableLabItems.length) {
        await connection.rollback();
        const names = unavailableLabItems
          .map(({ item }) => item.testName || item.catalogTestName || 'Lab test')
          .join(', ');
        return res.status(409).json({
          error: `Selected lab test is not available in this chemist: ${names}`,
          message: `Cannot refer unavailable lab test(s): ${names}`,
          unavailableItems: unavailableLabItems.map(({ item, availability }) => ({
            labOrderItemId: item.itemId,
            testTypeId: item.testTypeId,
            testName: item.testName || item.catalogTestName || 'Lab test',
            availability,
          })),
        });
      }

      const referralNumber = await nextReferralNumber(connection);
      const pickupCode = data.pickupCode || crypto.randomBytes(3).toString('hex').toUpperCase();
      const referredBy = user?.id || user?.userId || data.referredBy || null;
      const origin = await resolveReferralOrigin(connection, req, { ...data, referredBy }, labOrders[0]);

      const [result] = await connection.execute(
        `INSERT INTO prescription_external_referrals (
          referralNumber, referralType, branchId, originStoreId, originLocationLabel,
          prescriptionId, labOrderId, patientId, chemistId, referredBy, pickupDeadline, pickupCode,
          patientInstructions, notes
        ) VALUES (?, 'lab', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          referralNumber,
          origin.branchId,
          origin.originStoreId,
          origin.originLocationLabel,
          labOrderId,
          labOrders[0].patientId,
          chemistId,
          referredBy,
          data.pickupDeadline || null,
          pickupCode,
          data.patientInstructions || null,
          data.notes || null,
        ]
      );

      for (const item of labItems) {
        await connection.execute(
          `INSERT INTO prescription_external_lab_referral_items (
            referralId, labOrderItemId, testTypeId, testName, specimenType
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            result.insertId,
            item.itemId,
            item.testTypeId || null,
            item.testName || 'Lab test',
            item.specimenType || null,
          ]
        );
      }

      await connection.commit();
      const [rows] = await pool.execute(buildReferralSelect('r.referralId = ?'), [result.insertId]);
      const [referral] = await attachReferralItems(rows);
      return res.status(201).json(referral);
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
    await lockChemistDrugAvailabilityRows(connection, chemistId);
    const availabilityRows = await attachOutstandingDrugReservations(
      connection,
      chemistId,
      await fetchChemistDrugs(chemistId, {}, connection)
    );
    const itemAvailability = items.map((item) => ({
      item,
      requiredQuantity: quantityRequiredForPrescriptionItem(item),
      availability: matchAvailabilityForPrescriptionItem(item, availabilityRows),
    }));
    const unavailableDrugItems = itemAvailability.filter(({ requiredQuantity, availability }) => (
      !availability.matched ||
      availability.stale ||
      !['available', 'low_stock'].includes(availability.availabilityStatus) ||
      Number(availability.availableForReferral || 0) < requiredQuantity
    ));
    if (unavailableDrugItems.length) {
      await connection.rollback();
      const names = unavailableDrugItems
        .map(({ item }) => item.medicationName || item.medicationNameFromCatalog || 'Medication')
        .join(', ');
      const details = unavailableDrugItems
        .map(({ item, requiredQuantity, availability }) => {
          const name = item.medicationName || item.medicationNameFromCatalog || 'Medication';
          if (!availability.matched) return `${name} is not listed`;
          if (availability.stale) return `${name} has a stale stock update`;
          if (!['available', 'low_stock'].includes(availability.availabilityStatus)) return `${name} is ${availability.availabilityStatus}`;
          return `${name} needs ${requiredQuantity}, available after unpicked referrals is ${availability.availableForReferral || 0}`;
        })
        .join('; ');
      return res.status(409).json({
        error: `Selected drug is not available or has insufficient quantity in this chemist: ${details || names}`,
        message: `Cannot refer unavailable or insufficient drug(s): ${details || names}`,
        unavailableItems: unavailableDrugItems.map(({ item, requiredQuantity, availability }) => ({
          prescriptionItemId: item.itemId,
          medicationId: item.medicationId,
          medicationName: item.medicationName || item.medicationNameFromCatalog || 'Medication',
          requiredQuantity,
          availability,
          reservedQuantity: availability.reservedQuantity || 0,
          availableForReferral: availability.availableForReferral || 0,
        })),
      });
    }

    const referralNumber = await nextReferralNumber(connection);
    const pickupCode = data.pickupCode || crypto.randomBytes(3).toString('hex').toUpperCase();
    const referredBy = user?.id || user?.userId || data.referredBy || null;
    const origin = await resolveReferralOrigin(connection, req, { ...data, referredBy }, prescriptions[0]);

    const [result] = await connection.execute(
      `INSERT INTO prescription_external_referrals (
        referralNumber, referralType, branchId, originStoreId, originLocationLabel,
        prescriptionId, labOrderId, patientId, chemistId, referredBy, pickupDeadline, pickupCode,
        patientInstructions, notes
      ) VALUES (?, 'drug', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        referralNumber,
        origin.branchId,
        origin.originStoreId,
        origin.originLocationLabel,
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

    for (const { item, requiredQuantity, availability } of itemAvailability) {
      await connection.execute(
        `INSERT INTO prescription_external_referral_items (
          referralId, prescriptionItemId, medicationId, chemistDrugId, medicationName, dosage, frequency, duration,
          instructions, quantityReferred, quantityBalance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          item.itemId,
          item.medicationId || null,
          availability.chemistDrugId || null,
          item.medicationName || item.medicationNameFromCatalog || 'Medication',
          item.dosage || null,
          item.frequency || null,
          item.duration || null,
          item.instructions || null,
          requiredQuantity,
          requiredQuantity,
        ]
      );
      if (
        availability.availabilityStatus === 'not_listed' ||
        availability.availabilityStatus === 'out_of_stock' ||
        availability.availabilityStatus === 'low_stock' ||
        availability.displayStatus === 'stale'
      ) {
        await recordStockAlert(connection, chemistId, item, availability, {
          prescriptionId,
          referralId: result.insertId,
        });
      }
    }

    await connection.commit();
    const [rows] = await pool.execute(buildReferralSelect('r.referralId = ?'), [result.insertId]);
    const [referral] = await attachReferralItems(rows);
    res.status(201).json(referral);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating external referral:', error);
    res.status(error.status || 500).json({ error: 'Failed to create external referral', message: error.message });
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
    const allowed = ['referred', 'acknowledged', 'ready_for_pickup', 'sample_collected', 'in_progress', 'partially_picked', 'picked_up', 'completed', 'not_picked', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid referral status' });

    const updates = ['status = ?', 'updatedAt = NOW()'];
    const params = [status];
    if (status === 'acknowledged') updates.push('acknowledgedAt = COALESCE(acknowledgedAt, NOW())');
    if (status === 'picked_up' || status === 'completed') updates.push('pickedUpAt = COALESCE(pickedUpAt, NOW())', 'completedAt = COALESCE(completedAt, NOW())');
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
    const { status, quantityPicked, chemistNotes, externalResultSummary, itemType } = req.body || {};
    const authUser = getAuthUser(req);
    const actorId = authUser?.id || authUser?.userId || null;
    const allowed = ['pending', 'ready_for_pickup', 'picked_up', 'partially_picked', 'not_available', 'not_picked', 'cancelled', 'sample_collected', 'in_progress', 'completed'];
    if (!allowed.includes(status)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid item status' });
    }

    if (itemType === 'lab') {
      const completedAt = status === 'completed' ? ', completedAt = COALESCE(completedAt, NOW())' : '';
      await connection.execute(
        `UPDATE prescription_external_lab_referral_items
         SET status = ?, externalResultSummary = ?, chemistNotes = ?,
             completedBy = IF(? = 'completed', COALESCE(?, completedBy), completedBy),
             updatedAt = NOW()${completedAt}
         WHERE referralLabItemId = ? AND referralId = ?`,
        [status, externalResultSummary || null, chemistNotes || null, status, actorId, req.params.referralItemId, req.params.id]
      );

      const [counts] = await connection.execute(
        `SELECT
           COUNT(*) AS total,
           SUM(status = 'completed') AS completed,
           SUM(status = 'in_progress') AS inProgress,
           SUM(status = 'sample_collected') AS sampleCollected,
           SUM(status IN ('not_available', 'cancelled')) AS unavailable
         FROM prescription_external_lab_referral_items
         WHERE referralId = ?`,
        [req.params.id]
      );

      let referralStatus = 'referred';
      const c = counts[0];
      if (Number(c.total) > 0 && Number(c.completed) === Number(c.total)) referralStatus = 'completed';
      else if (Number(c.inProgress) > 0) referralStatus = 'in_progress';
      else if (Number(c.sampleCollected) > 0) referralStatus = 'sample_collected';
      else if (Number(c.unavailable) === Number(c.total)) referralStatus = 'not_picked';

      await connection.execute(
        `UPDATE prescription_external_referrals
         SET status = ?, completedAt = IF(? = 'completed', COALESCE(completedAt, NOW()), completedAt), updatedAt = NOW()
         WHERE referralId = ?`,
        [referralStatus, referralStatus, req.params.id]
      );

      await connection.commit();
      const [rows] = await pool.execute(buildReferralSelect('r.referralId = ?'), [req.params.id]);
      const [referral] = await attachReferralItems(rows);
      return res.json(referral);
    }

    const isPickupStatus = ['picked_up', 'partially_picked'].includes(status);
    if (isPickupStatus) {
      const pickupQty = parsePositiveInteger(quantityPicked, 'Picked quantity');
      const [itemRows] = await connection.execute(
        `SELECT ri.*, r.chemistId
         FROM prescription_external_referral_items ri
         INNER JOIN prescription_external_referrals r ON ri.referralId = r.referralId
         WHERE ri.referralItemId = ? AND ri.referralId = ?
         FOR UPDATE`,
        [req.params.referralItemId, req.params.id]
      );
      if (!itemRows.length) {
        throw httpError('Referral item not found', 404);
      }

      const item = itemRows[0];
      const quantityReferred = Number(item.quantityReferred) || 0;
      const quantityAlreadyPicked = Number(item.quantityPicked) || 0;
      const remainingQuantity = Math.max(quantityReferred - quantityAlreadyPicked, 0);
      if (quantityReferred <= 0) {
        throw httpError('Referral item does not have a valid prescribed quantity', 400);
      }
      if (remainingQuantity <= 0) {
        throw httpError('This referral item has already been fully picked', 409);
      }
      if (pickupQty > remainingQuantity) {
        throw httpError(`Picked quantity cannot exceed the remaining balance of ${remainingQuantity}`, 400);
      }

      let stockRows = [];
      if (item.chemistDrugId) {
        [stockRows] = await connection.execute(
          `SELECT *
           FROM external_chemist_drug_availability
           WHERE chemistDrugId = ? AND chemistId = ? AND isActive = 1
           FOR UPDATE`,
          [item.chemistDrugId, item.chemistId]
        );
      }
      if (!stockRows.length && item.medicationId) {
        [stockRows] = await connection.execute(
          `SELECT *
           FROM external_chemist_drug_availability
           WHERE chemistId = ? AND medicationId = ? AND isActive = 1
           ORDER BY availabilityStatus = 'available' DESC, quantityAvailable DESC
           LIMIT 1
           FOR UPDATE`,
          [item.chemistId, item.medicationId]
        );
      }
      if (!stockRows.length) {
        [stockRows] = await connection.execute(
          `SELECT *
           FROM external_chemist_drug_availability
           WHERE chemistId = ? AND LOWER(TRIM(medicationName)) = LOWER(TRIM(?)) AND isActive = 1
           ORDER BY availabilityStatus = 'available' DESC, quantityAvailable DESC
           LIMIT 1
           FOR UPDATE`,
          [item.chemistId, item.medicationName]
        );
      }
      if (!stockRows.length) {
        throw httpError('No active chemist stock record was found for this medication', 409);
      }

      const stock = stockRows[0];
      const quantityBefore = Number(stock.quantityAvailable) || 0;
      if (quantityBefore < pickupQty) {
        throw httpError(`Chemist stock is insufficient. Available quantity is ${quantityBefore}`, 409);
      }

      const quantityAfter = quantityBefore - pickupQty;
      const cumulativeAfter = quantityAlreadyPicked + pickupQty;
      const balanceAfter = Math.max(quantityReferred - cumulativeAfter, 0);
      const itemStatus = balanceAfter === 0 ? 'picked_up' : 'partially_picked';
      const stockStatus = availabilityStatusForQuantity(quantityAfter, stock.minimumStockLevel);

      await connection.execute(
        `UPDATE external_chemist_drug_availability
         SET quantityAvailable = ?, availabilityStatus = ?, lastConfirmedAt = NOW(), updatedAt = NOW()
         WHERE chemistDrugId = ? AND chemistId = ?`,
        [quantityAfter, stockStatus, stock.chemistDrugId, item.chemistId]
      );
      await recordStockMovement(connection, {
        chemistDrugId: stock.chemistDrugId,
        chemistId: item.chemistId,
        movementType: 'referral_pickup',
        quantityChange: -pickupQty,
        quantityBefore,
        quantityAfter,
        referenceType: 'external_referral_pickup',
        referenceId: Number(req.params.referralItemId),
        referralId: Number(req.params.id),
        referralItemId: Number(req.params.referralItemId),
        actorUserId: actorId,
        notes: chemistNotes || null,
      });
      await connection.execute(
        `INSERT INTO external_chemist_referral_pickups (
          referralId, referralItemId, chemistId, chemistDrugId, quantityPicked,
          cumulativeBefore, cumulativeAfter, balanceAfter, pickedBy, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          req.params.referralItemId,
          item.chemistId,
          stock.chemistDrugId,
          pickupQty,
          quantityAlreadyPicked,
          cumulativeAfter,
          balanceAfter,
          actorId,
          chemistNotes || null,
        ]
      );
      await connection.execute(
        `UPDATE prescription_external_referral_items
         SET status = ?, quantityPicked = ?, quantityBalance = ?, chemistDrugId = ?,
             chemistNotes = ?, pickedUpAt = COALESCE(pickedUpAt, NOW()),
             dispensedBy = ?, dispensedAt = NOW(), updatedAt = NOW()
         WHERE referralItemId = ? AND referralId = ?`,
        [
          itemStatus,
          cumulativeAfter,
          balanceAfter,
          stock.chemistDrugId,
          chemistNotes || null,
          actorId,
          req.params.referralItemId,
          req.params.id,
        ]
      );
    } else {
      await connection.execute(
        `UPDATE prescription_external_referral_items
         SET status = ?, chemistNotes = ?, updatedAt = NOW()
         WHERE referralItemId = ? AND referralId = ?`,
        [status, chemistNotes || null, req.params.referralItemId, req.params.id]
      );
    }

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
    res.status(error.status || 500).json({ error: 'Failed to update external referral item', message: error.message });
  } finally {
    connection.release();
  }
});

router.get('/chemist/users', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    let chemistId = Number(req.query.chemistId) || null;
    if (isChemistUser(user)) {
      const scope = await getChemistScopeForUser(user.id || user.userId);
      if (!scope) return res.status(403).json({ error: 'Chemist user is not assigned to a chemist' });
      chemistId = Number(scope.chemistId);
    }

    const params = [];
    let whereClause = '1=1';
    if (chemistId) {
      whereClause = 'ecu.chemistId = ?';
      params.push(chemistId);
    }

    const [rows] = await pool.execute(
      `SELECT ecu.chemistUserId, ecu.chemistId, ecu.userId, ecu.isPrimary, ecu.isActive, ecu.canManageUsers,
              ecu.createdAt, ecu.updatedAt,
              u.username, u.email, u.firstName, u.lastName, u.phone, u.department, u.isActive AS userIsActive,
              ec.chemistName, ec.chemistCode
       FROM external_chemist_users ecu
       INNER JOIN users u ON ecu.userId = u.userId
       INNER JOIN external_chemists ec ON ecu.chemistId = ec.chemistId
       WHERE ${whereClause}
       ORDER BY ec.chemistName ASC, ecu.isPrimary DESC, u.firstName ASC, u.username ASC`,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching chemist users:', error);
    res.status(error.status || 500).json({ error: 'Failed to fetch chemist users', message: error.message });
  }
});

router.post('/chemist/users', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { user, scope } = await requirePrimaryChemistUser(req);
    const data = req.body || {};
    if (!data.username || !data.password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    await connection.beginTransaction();
    const [roles] = await connection.execute('SELECT roleId FROM roles WHERE roleName = ? LIMIT 1', ['chemist']);
    if (!roles.length) {
      await connection.rollback();
      return res.status(500).json({ error: 'Chemist role is not configured' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const email = data.email || `${data.username}@external-chemist.local`;
    await assertUserLoginAvailable(connection, data.username, email);
    const [result] = await connection.execute(
      `INSERT INTO users (username, email, passwordHash, firstName, lastName, phone, roleId, department, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        data.username,
        email,
        passwordHash,
        data.firstName || data.fullName || 'Chemist',
        data.lastName || 'Staff',
        data.phone || null,
        roles[0].roleId,
        data.department || 'External Chemist',
      ]
    );

    const [linkResult] = await connection.execute(
      `INSERT INTO external_chemist_users (chemistId, userId, isPrimary, isActive, createdBy, canManageUsers)
       VALUES (?, ?, 0, 1, ?, ?)`,
      [scope.chemistId, result.insertId, user.id || user.userId || null, data.canManageUsers ? 1 : 0]
    );

    await connection.commit();
    const [rows] = await pool.execute(
      `SELECT ecu.chemistUserId, ecu.chemistId, ecu.userId, ecu.isPrimary, ecu.isActive, ecu.canManageUsers,
              u.username, u.email, u.firstName, u.lastName, u.phone, u.department
       FROM external_chemist_users ecu
       INNER JOIN users u ON ecu.userId = u.userId
       WHERE ecu.chemistUserId = ?`,
      [linkResult.insertId]
    );
    res.status(201).json(rows[0] || { userId: result.insertId });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating chemist user:', error);
    const duplicateMessage = duplicateUserMessage(error);
    if (duplicateMessage) {
      return res.status(409).json({ error: duplicateMessage });
    }
    res.status(error.status || 500).json({ error: error.status === 409 ? error.message : 'Failed to create chemist user', message: error.message });
  } finally {
    connection.release();
  }
});

router.patch('/chemist/users/:chemistUserId', async (req, res) => {
  try {
    const { scope } = await requirePrimaryChemistUser(req);
    const { isActive, canManageUsers } = req.body || {};
    const updates = ['updatedAt = NOW()'];
    const params = [];
    if (isActive !== undefined) {
      updates.push('isActive = ?');
      params.push(isActive ? 1 : 0);
    }
    if (canManageUsers !== undefined) {
      updates.push('canManageUsers = ?');
      params.push(canManageUsers ? 1 : 0);
    }
    params.push(req.params.chemistUserId, scope.chemistId);

    await pool.execute(
      `UPDATE external_chemist_users SET ${updates.join(', ')}
       WHERE chemistUserId = ? AND chemistId = ? AND isPrimary = 0`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT ecu.chemistUserId, ecu.chemistId, ecu.userId, ecu.isPrimary, ecu.isActive, ecu.canManageUsers,
              u.username, u.email, u.firstName, u.lastName, u.phone, u.department
       FROM external_chemist_users ecu
       INNER JOIN users u ON ecu.userId = u.userId
       WHERE ecu.chemistUserId = ? AND ecu.chemistId = ?`,
      [req.params.chemistUserId, scope.chemistId]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating chemist user:', error);
    res.status(error.status || 500).json({ error: 'Failed to update chemist user', message: error.message });
  }
});

router.get('/chemist/alerts', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const chemistId = await resolveChemistIdForRequest(req, req.query.chemistId);
    const status = req.query.status || 'open';
    const [rows] = await pool.execute(
      `SELECT a.*, m.name AS catalogMedicationName, m.genericName, m.strength, m.dosageForm
       FROM external_chemist_stock_alerts a
       LEFT JOIN medications m ON a.medicationId = m.medicationId
       WHERE a.chemistId = ? AND (? = 'all' OR a.status = ?)
       ORDER BY a.lastRequestedAt DESC, a.requestCount DESC`,
      [chemistId, status, status]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching chemist stock alerts:', error);
    res.status(error.status || 500).json({ error: 'Failed to fetch chemist stock alerts', message: error.message });
  }
});

router.patch('/chemist/alerts/:alertId', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const chemistId = await resolveChemistIdForRequest(req, req.body?.chemistId || null);
    const { status = 'open', restockEta, notes } = req.body || {};
    await pool.execute(
      `UPDATE external_chemist_stock_alerts
       SET status = ?, restockEta = ?, notes = ?, updatedAt = NOW()
       WHERE alertId = ? AND chemistId = ?`,
      [status, restockEta || null, notes || null, req.params.alertId, chemistId]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM external_chemist_stock_alerts WHERE alertId = ? AND chemistId = ?',
      [req.params.alertId, chemistId]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating chemist stock alert:', error);
    res.status(error.status || 500).json({ error: 'Failed to update chemist stock alert', message: error.message });
  }
});

router.get('/chemist/me', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!isChemistUser(user)) return res.status(403).json({ error: 'User is not an external chemist' });
    const scope = await getChemistScopeForUser(user.id || user.userId);
    if (!scope) return res.status(403).json({ error: 'User is not assigned to an external chemist' });
    res.json(scope);
  } catch (error) {
    console.error('Error fetching chemist scope:', error);
    res.status(500).json({ error: 'Failed to fetch chemist scope', message: error.message });
  }
});

module.exports = router;
