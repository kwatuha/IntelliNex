const pool = require('../config/db');

async function generateDocumentNumber(prefix, tableName, columnName, executor = pool) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = `${prefix}-${datePart}-`;
  const [rows] = await executor.execute(
    `SELECT ${columnName} AS docNumber FROM ${tableName}
     WHERE ${columnName} LIKE ?
     ORDER BY ${columnName} DESC LIMIT 1`,
    [`${base}%`]
  );
  let sequence = 1;
  if (rows.length) {
    const last = String(rows[0].docNumber || '');
    const parts = last.split('-');
    const lastSeq = Number(parts[parts.length - 1]);
    if (Number.isFinite(lastSeq)) sequence = lastSeq + 1;
  }
  return `${base}${String(sequence).padStart(4, '0')}`;
}

async function lockInventoryBatch(connection, drugInventoryId) {
  const [rows] = await connection.execute(
    `SELECT di.*, ds.storeName, ds.branchId AS storeBranchId
     FROM drug_inventory di
     LEFT JOIN drug_stores ds ON di.storeId = ds.storeId
     WHERE di.drugInventoryId = ?
     FOR UPDATE`,
    [drugInventoryId]
  );
  return rows[0] || null;
}

async function getStoreMatchLabels(connection, storeId) {
  const [rows] = await connection.execute(
    'SELECT storeId, storeName, storeCode, location FROM drug_stores WHERE storeId = ?',
    [storeId]
  );
  const store = rows[0];
  if (!store) return { storeId, labels: [] };
  const labels = [store.storeName, store.storeCode, store.location]
    .filter((value) => value != null && String(value).trim() !== '')
    .map((value) => String(value).trim());
  return { storeId, labels: [...new Set(labels)] };
}

function buildStoreInventoryFilter(alias = 'di', storeIdPlaceholder = '?') {
  return `(
    ${alias}.storeId = ${storeIdPlaceholder}
    OR (
      ${alias}.storeId IS NULL
      AND ${alias}.location IN (
        SELECT ds.storeName FROM drug_stores ds WHERE ds.storeId = ${storeIdPlaceholder}
        UNION
        SELECT ds.storeCode FROM drug_stores ds WHERE ds.storeId = ${storeIdPlaceholder} AND ds.storeCode IS NOT NULL
        UNION
        SELECT ds.location FROM drug_stores ds WHERE ds.storeId = ${storeIdPlaceholder} AND ds.location IS NOT NULL
      )
    )
  )`;
}

function buildBranchStoreInventoryFilter(alias = 'di', storeIdPlaceholder = '?') {
  return `(
    ${buildStoreInventoryFilter(alias, storeIdPlaceholder)}
    OR ${alias}.storeId IN (
      SELECT ds2.storeId
      FROM drug_stores ds2
      INNER JOIN drug_stores src ON src.storeId = ${storeIdPlaceholder}
      WHERE ds2.branchId = src.branchId
        AND ds2.isActive = 1
        AND src.isActive = 1
    )
    OR (
      ${alias}.storeId IS NULL
      AND ${alias}.location IN (
        SELECT ds2.storeName
        FROM drug_stores ds2
        INNER JOIN drug_stores src ON src.storeId = ${storeIdPlaceholder}
        WHERE ds2.branchId = src.branchId AND ds2.isActive = 1 AND src.isActive = 1
        UNION
        SELECT ds2.storeCode
        FROM drug_stores ds2
        INNER JOIN drug_stores src ON src.storeId = ${storeIdPlaceholder}
        WHERE ds2.branchId = src.branchId AND ds2.storeCode IS NOT NULL AND ds2.isActive = 1 AND src.isActive = 1
        UNION
        SELECT ds2.location
        FROM drug_stores ds2
        INNER JOIN drug_stores src ON src.storeId = ${storeIdPlaceholder}
        WHERE ds2.branchId = src.branchId AND ds2.location IS NOT NULL AND ds2.isActive = 1 AND src.isActive = 1
      )
    )
  )`;
}

function storeInventoryFilterParams(storeId) {
  return [storeId, storeId, storeId, storeId];
}

function branchInventoryFilterParams(storeId) {
  return [...storeInventoryFilterParams(storeId), storeId, storeId, storeId, storeId];
}

async function findFifoBatchForStore(connection, medicationId, storeId, options = {}) {
  const { scope = 'branch' } = options;
  const storeFilter = scope === 'branch'
    ? buildBranchStoreInventoryFilter('di', '?')
    : buildStoreInventoryFilter('di', '?');
  const filterParams = scope === 'branch' ? branchInventoryFilterParams(storeId) : storeInventoryFilterParams(storeId);
  const [rows] = await connection.execute(
    `SELECT di.*
     FROM drug_inventory di
     WHERE di.medicationId = ?
       AND ${storeFilter}
       AND di.quantity > 0
       AND di.status = 'active'
       AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
     ORDER BY di.expiryDate ASC, di.createdAt ASC
     LIMIT 1
     FOR UPDATE`,
    [medicationId, ...filterParams]
  );
  return rows[0] || null;
}

async function deductInventoryBatch(connection, options) {
  const {
    drugInventoryId,
    quantity,
    userId,
    referenceType,
    referenceId,
    referenceNumber,
    notes,
  } = options;

  const qty = Math.abs(Number(quantity) || 0);
  if (!drugInventoryId || qty <= 0) {
    const error = new Error('drugInventoryId and positive quantity are required');
    error.status = 400;
    throw error;
  }

  const batch = await lockInventoryBatch(connection, drugInventoryId);
  if (!batch) {
    const error = new Error('Drug inventory batch not found');
    error.status = 404;
    throw error;
  }
  if ((Number(batch.quantity) || 0) < qty) {
    const error = new Error(`Insufficient stock in batch ${batch.batchNumber}. Available: ${batch.quantity}, requested: ${qty}`);
    error.status = 400;
    throw error;
  }

  const quantityBefore = Number(batch.quantity) || 0;
  const quantityAfter = quantityBefore - qty;
  const transactionDate = new Date().toISOString().slice(0, 10);
  let batchStatus = batch.status || 'active';
  let dateExhausted = batch.dateExhausted || null;

  if (quantityAfter <= 0) {
    batchStatus = 'exhausted';
    dateExhausted = transactionDate;
  }

  await connection.execute(
    `UPDATE drug_inventory
     SET quantity = ?, status = ?, dateExhausted = ?, updatedAt = NOW()
     WHERE drugInventoryId = ?`,
    [quantityAfter, batchStatus, dateExhausted, drugInventoryId]
  );

  const unitPrice = batch.unitPrice || 0;
  await connection.execute(
    `INSERT INTO drug_inventory_transactions
     (drugInventoryId, transactionType, transactionDate, quantityChange, quantityBefore, quantityAfter, balanceAfter,
      unitPrice, totalValue, referenceType, referenceId, referenceNumber, performedBy, notes)
     VALUES (?, 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      drugInventoryId,
      transactionDate,
      -qty,
      quantityBefore,
      quantityAfter,
      quantityAfter,
      unitPrice,
      qty * unitPrice,
      referenceType || null,
      referenceId || null,
      referenceNumber || null,
      userId || null,
      notes || null,
    ]
  );

  return { batch, quantityBefore, quantityAfter, quantityDeducted: qty };
}

async function receiveInventoryAtStore(connection, options) {
  const {
    medicationId,
    batchNumber,
    quantity,
    unitPrice,
    sellPrice,
    minPrice,
    manufactureDate,
    expiryDate,
    toStoreId,
    toBranchId,
    userId,
    referenceType,
    referenceId,
    referenceNumber,
    notes,
    sourceBatchNumber,
  } = options;

  const qty = Math.abs(Number(quantity) || 0);
  if (!medicationId || !batchNumber || qty <= 0 || !toStoreId) {
    const error = new Error('medicationId, batchNumber, positive quantity, and toStoreId are required');
    error.status = 400;
    throw error;
  }

  const transactionDate = new Date().toISOString().slice(0, 10);
  let storeLocation = null;
  let branchId = toBranchId || null;

  const [storeRows] = await connection.execute(
    'SELECT storeName, branchId, location FROM drug_stores WHERE storeId = ?',
    [toStoreId]
  );
  if (storeRows.length) {
    storeLocation = storeRows[0].storeName || storeRows[0].location || null;
    branchId = branchId || storeRows[0].branchId || null;
  }

  const [existingBatches] = await connection.execute(
    'SELECT * FROM drug_inventory WHERE batchNumber = ? LIMIT 1 FOR UPDATE',
    [batchNumber]
  );

  let drugInventoryId;
  let quantityBefore = 0;
  let quantityAfter = qty;

  if (existingBatches.length) {
    const existing = existingBatches[0];
    if (Number(existing.medicationId) !== Number(medicationId)) {
      const error = new Error(`Batch number ${batchNumber} already exists for a different medication`);
      error.status = 400;
      throw error;
    }
    drugInventoryId = existing.drugInventoryId;
    quantityBefore = Number(existing.quantity) || 0;
    quantityAfter = quantityBefore + qty;

    await connection.execute(
      `UPDATE drug_inventory
       SET quantity = ?, storeId = ?, branchId = COALESCE(?, branchId), location = COALESCE(?, location),
           status = 'active', dateExhausted = NULL, updatedAt = NOW()
       WHERE drugInventoryId = ?`,
      [quantityAfter, toStoreId, branchId, storeLocation, drugInventoryId]
    );
  } else {
    const [result] = await connection.execute(
      `INSERT INTO drug_inventory
       (medicationId, branchId, batchNumber, quantity, originalQuantity, unitPrice, manufactureDate, expiryDate,
        minPrice, sellPrice, location, storeId, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        medicationId,
        branchId,
        batchNumber,
        qty,
        qty,
        unitPrice || 0,
        manufactureDate || null,
        expiryDate || null,
        minPrice || null,
        sellPrice || unitPrice || 0,
        storeLocation,
        toStoreId,
        notes || (sourceBatchNumber ? `Transferred from batch ${sourceBatchNumber}` : null),
      ]
    );
    drugInventoryId = result.insertId;
  }

  const resolvedUnitPrice = unitPrice || existingBatches[0]?.unitPrice || 0;
  await connection.execute(
    `INSERT INTO drug_inventory_transactions
     (drugInventoryId, transactionType, transactionDate, quantityChange, quantityBefore, quantityAfter, balanceAfter,
      unitPrice, totalValue, referenceType, referenceId, referenceNumber, performedBy, notes)
     VALUES (?, 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      drugInventoryId,
      transactionDate,
      qty,
      quantityBefore,
      quantityAfter,
      quantityAfter,
      resolvedUnitPrice,
      qty * resolvedUnitPrice,
      referenceType || null,
      referenceId || null,
      referenceNumber || null,
      userId || null,
      notes || null,
    ]
  );

  return { drugInventoryId, batchNumber, quantityBefore, quantityAfter, quantityReceived: qty };
}

function buildTransferBatchNumber(sourceBatchNumber, transferNumber) {
  const suffix = String(transferNumber || '').replace(/[^A-Za-z0-9]/g, '').slice(-12);
  const base = String(sourceBatchNumber || 'BATCH').slice(0, 80);
  return `${base}-T${suffix}`.slice(0, 100);
}

module.exports = {
  generateDocumentNumber,
  lockInventoryBatch,
  getStoreMatchLabels,
  buildStoreInventoryFilter,
  buildBranchStoreInventoryFilter,
  storeInventoryFilterParams,
  branchInventoryFilterParams,
  findFifoBatchForStore,
  deductInventoryBatch,
  receiveInventoryAtStore,
  buildTransferBatchNumber,
};
