const pool = require('../config/db');
const {
  buildStoreInventoryFilter,
  buildBranchStoreInventoryFilter,
  storeInventoryFilterParams,
  branchInventoryFilterParams,
} = require('./drugMovement');

const PHARMACY_STAFF_ROLES = ['admin', 'pharmacist', 'pharmacy', 'system administrator'];

async function queueOptionalEmail(notification) {
  if (!process.env.SMTP_HOST) {
    return false;
  }
  // Email delivery can be wired to SMTP when configured.
  console.info('[pharmacy-notification] email queued:', notification.title);
  return true;
}

async function createPharmacyNotification(executor, data) {
  const {
    notificationType,
    title,
    message,
    priority = 'medium',
    targetUserId = null,
    targetRole = null,
    targetChemistId = null,
    storeId = null,
    medicationId = null,
    referenceType = null,
    referenceId = null,
  } = data;

  if (!notificationType || !title || !message) return null;

  const [existing] = await executor.execute(
    `SELECT notificationId FROM pharmacy_notifications
     WHERE notificationType = ?
       AND status = 'pending'
       AND referenceType <=> ?
       AND referenceId <=> ?
       AND targetUserId <=> ?
       AND targetRole <=> ?
       AND targetChemistId <=> ?
     LIMIT 1`,
    [
      notificationType,
      referenceType,
      referenceId,
      targetUserId,
      targetRole,
      targetChemistId,
    ]
  );
  if (existing.length) {
    return existing[0].notificationId;
  }

  const [result] = await executor.execute(
    `INSERT INTO pharmacy_notifications (
      notificationType, title, message, priority, targetUserId, targetRole, targetChemistId,
      storeId, medicationId, referenceType, referenceId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      notificationType,
      title,
      message,
      priority,
      targetUserId,
      targetRole,
      targetChemistId,
      storeId,
      medicationId,
      referenceType,
      referenceId,
    ]
  );

  const notificationId = result.insertId;
  const emailQueued = await queueOptionalEmail({ notificationId, title, message });
  if (emailQueued) {
    await executor.execute(
      'UPDATE pharmacy_notifications SET emailSentAt = NOW() WHERE notificationId = ?',
      [notificationId]
    );
  }
  return notificationId;
}

async function notifyPharmacyStaff(executor, data) {
  const created = [];
  for (const role of PHARMACY_STAFF_ROLES) {
    const id = await createPharmacyNotification(executor, {
      ...data,
      targetRole: role,
      targetUserId: null,
      targetChemistId: null,
    });
    if (id) created.push(id);
  }
  return created;
}

async function notifyChemistUsers(executor, chemistId, data) {
  return createPharmacyNotification(executor, {
    ...data,
    targetChemistId: chemistId,
    targetRole: 'chemist',
    targetUserId: null,
  });
}

async function getStoreStockQuantity(executor, storeId, medicationId, options = {}) {
  const { scope = 'branch' } = options;
  const storeFilter = scope === 'branch'
    ? buildBranchStoreInventoryFilter('di', '?')
    : buildStoreInventoryFilter('di', '?');
  const filterParams = scope === 'branch' ? branchInventoryFilterParams(storeId) : storeInventoryFilterParams(storeId);
  const [rows] = await executor.execute(
    `SELECT COALESCE(SUM(di.quantity), 0) AS totalQuantity
     FROM drug_inventory di
     WHERE ${storeFilter}
       AND di.medicationId = ?
       AND di.status = 'active'
       AND di.quantity > 0
       AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())`,
    [...filterParams, medicationId]
  );
  return Number(rows[0]?.totalQuantity) || 0;
}

async function checkStoreReorderLevels(executor, options = {}) {
  const { storeId = null, medicationId = null } = options;
  const params = [];
  let query = `
    SELECT rl.reorderLevelId, rl.storeId, rl.medicationId, rl.reorderLevel, rl.reorderQuantity,
           ds.storeName, m.name AS medicationName
    FROM drug_store_reorder_levels rl
    INNER JOIN drug_stores ds ON rl.storeId = ds.storeId
    INNER JOIN medications m ON rl.medicationId = m.medicationId
    WHERE rl.isActive = 1 AND ds.isActive = 1
  `;
  if (storeId) {
    query += ' AND rl.storeId = ?';
    params.push(storeId);
  }
  if (medicationId) {
    query += ' AND rl.medicationId = ?';
    params.push(medicationId);
  }

  const [levels] = await executor.execute(query, params);
  const alerts = [];

  for (const level of levels) {
    const totalQuantity = await getStoreStockQuantity(executor, level.storeId, level.medicationId);
    if (totalQuantity > level.reorderLevel) continue;

    const title = `Low stock: ${level.medicationName}`;
    const message = `${level.medicationName} at ${level.storeName} is below reorder level (${totalQuantity} remaining, reorder at ${level.reorderLevel}).`;
    await notifyPharmacyStaff(executor, {
      notificationType: 'low_store_stock',
      title,
      message,
      priority: totalQuantity <= 0 ? 'high' : 'medium',
      storeId: level.storeId,
      medicationId: level.medicationId,
      referenceType: 'reorder_level',
      referenceId: level.reorderLevelId,
    });
    alerts.push({
      storeId: level.storeId,
      storeName: level.storeName,
      medicationId: level.medicationId,
      medicationName: level.medicationName,
      currentQuantity: totalQuantity,
      reorderLevel: level.reorderLevel,
      reorderQuantity: level.reorderQuantity,
    });
  }

  return alerts;
}

module.exports = {
  PHARMACY_STAFF_ROLES,
  createPharmacyNotification,
  notifyPharmacyStaff,
  notifyChemistUsers,
  checkStoreReorderLevels,
  getStoreStockQuantity,
};
