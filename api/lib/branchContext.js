const pool = require('../config/db');

function normalizeBranch(row) {
  if (!row) return null;
  return {
    branchId: row.branchId,
    branchCode: row.branchCode,
    branchName: row.branchName,
    isMainBranch: Boolean(row.isMainBranch),
    isDefault: Boolean(row.isDefault),
    canAccessAllBranches: Boolean(row.canAccessAllBranches),
  };
}

async function safeQuery(executor, sql, params = []) {
  try {
    const [rows] = await executor.execute(sql, params);
    return rows;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') {
      return [];
    }
    throw error;
  }
}

async function getMainBranch(executor = pool) {
  const rows = await safeQuery(
    executor,
    `SELECT branchId, branchCode, branchName, isMainBranch
     FROM branches
     WHERE isActive = 1
     ORDER BY isMainBranch DESC, branchId ASC
     LIMIT 1`
  );
  return normalizeBranch(rows[0]);
}

async function getAllActiveBranches(executor = pool) {
  const rows = await safeQuery(
    executor,
    `SELECT branchId, branchCode, branchName, isMainBranch
     FROM branches
     WHERE isActive = 1
     ORDER BY isMainBranch DESC, branchName ASC`
  );
  return rows.map(normalizeBranch).filter(Boolean);
}

async function getUserBranchContext(executor = pool, userId) {
  if (!userId) {
    const mainBranch = await getMainBranch(executor);
    return {
      branches: mainBranch ? [mainBranch] : [],
      defaultBranch: mainBranch,
      currentBranch: mainBranch,
      canAccessAllBranches: false,
    };
  }

  const [mainBranch, assignments] = await Promise.all([
    getMainBranch(executor),
    safeQuery(
      executor,
      `SELECT uba.assignmentId, uba.userId, uba.branchId, uba.isDefault, uba.canAccessAllBranches,
              b.branchCode, b.branchName, b.isMainBranch
       FROM user_branch_assignments uba
       LEFT JOIN branches b ON uba.branchId = b.branchId
       WHERE uba.userId = ? AND uba.isActive = 1 AND (b.branchId IS NULL OR b.isActive = 1)
       ORDER BY uba.isDefault DESC, b.isMainBranch DESC, b.branchName ASC`,
      [userId]
    ),
  ]);

  const canAccessAllBranches = assignments.some((row) => Boolean(row.canAccessAllBranches));
  const branches = canAccessAllBranches
    ? await getAllActiveBranches(executor)
    : assignments.map(normalizeBranch).filter((branch) => branch?.branchId);
  const defaultAssignment = assignments.find((row) => row.isDefault && row.branchId);
  const defaultBranch = normalizeBranch(defaultAssignment) || branches[0] || mainBranch;

  return {
    branches: branches.length ? branches : (mainBranch ? [mainBranch] : []),
    defaultBranch,
    currentBranch: defaultBranch,
    canAccessAllBranches,
  };
}

function getRequestedBranchId(req, body = {}) {
  return (
    body.currentBranchId ||
    body.branchId ||
    req?.headers?.['x-branch-id'] ||
    req?.query?.currentBranchId ||
    req?.query?.branchId ||
    null
  );
}

async function resolveBranchForRequest(executor = pool, req = {}, options = {}) {
  const requestedBranchId = Number(options.branchId || getRequestedBranchId(req, options.body || {})) || null;
  const userId = options.userId || req?.user?.id || req?.user?.userId || null;
  const context = await getUserBranchContext(executor, userId);
  const branches = context.branches || [];

  if (requestedBranchId) {
    const allowed = context.canAccessAllBranches || branches.some((branch) => Number(branch.branchId) === requestedBranchId);
    if (allowed || !userId) {
      const rows = await safeQuery(
        executor,
        `SELECT branchId, branchCode, branchName, isMainBranch
         FROM branches
         WHERE branchId = ? AND isActive = 1
         LIMIT 1`,
        [requestedBranchId]
      );
      if (rows[0]) return normalizeBranch(rows[0]);
    }
  }

  return context.currentBranch || await getMainBranch(executor);
}

async function resolveReferralOrigin(executor = pool, req = {}, data = {}, sourceRow = {}) {
  let originStore = null;
  const originStoreId = Number(data.originStoreId || data.storeId) || null;

  if (originStoreId) {
    const rows = await safeQuery(
      executor,
      `SELECT ds.storeId, ds.storeName, ds.location, ds.branchId, b.branchName, b.branchCode, b.isMainBranch
       FROM drug_stores ds
       INNER JOIN branches b ON ds.branchId = b.branchId
       WHERE ds.storeId = ? AND ds.isActive = 1 AND b.isActive = 1
       LIMIT 1`,
      [originStoreId]
    );
    originStore = rows[0] || null;
  }

  const branch =
    (originStore ? normalizeBranch(originStore) : null) ||
    await resolveBranchForRequest(executor, req, {
      body: data,
      userId: data.referredBy,
      branchId: data.branchId || data.currentBranchId || sourceRow.branchId,
    });
  const originLocationLabel =
    data.originLocationLabel ||
    (originStore
      ? [originStore.branchName, originStore.storeName || originStore.location].filter(Boolean).join(' - ')
      : branch?.branchName || null);

  return {
    branchId: branch?.branchId || null,
    originStoreId: originStore?.storeId || originStoreId || null,
    originLocationLabel,
  };
}

/**
 * Optional JWT user id (global auth middleware is not always enabled).
 */
function getRequestUserId(req) {
  if (req?.user?.id != null) return req.user.id;
  if (req?.user?.userId != null) return req.user.userId;
  const authHeader = req?.header?.('Authorization') || req?.headers?.authorization;
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) return null;
  const token = String(authHeader).split(' ')[1];
  if (!token) return null;
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = decoded?.user ?? decoded;
    return user?.id ?? user?.userId ?? null;
  } catch {
    return null;
  }
}

async function getRoleNameByUserId(executor, userId) {
  if (!userId) return null;
  const rows = await safeQuery(
    executor,
    `SELECT r.roleName
     FROM users u
     LEFT JOIN roles r ON u.roleId = r.roleId
     WHERE u.userId = ? AND u.voided = 0 AND u.isActive = 1`,
    [userId]
  );
  return rows[0]?.roleName ?? null;
}

function isAdminRoleName(roleName) {
  const rn = String(roleName || '').toLowerCase();
  return rn === 'admin' || rn.includes('admin');
}

/**
 * Facility profile scope for list/create enforcement.
 */
async function resolveFacilityScope(executor = pool, req = {}, options = {}) {
  const userId = options.userId != null ? options.userId : getRequestUserId(req);
  const context = await getUserBranchContext(executor, userId);
  const roleName = await getRoleNameByUserId(executor, userId);
  const canAccessAllBranches =
    Boolean(context.canAccessAllBranches) || isAdminRoleName(roleName);
  const current = await resolveBranchForRequest(executor, req, {
    userId,
    body: options.body || {},
    branchId: options.branchId,
  });
  const branchIds = (context.branches || [])
    .map((b) => Number(b.branchId))
    .filter(Boolean);
  const currentBranchId = Number(current?.branchId) || null;

  return {
    userId,
    roleName,
    canAccessAllBranches,
    currentBranchId,
    branchIds: canAccessAllBranches
      ? branchIds
      : branchIds.length
        ? branchIds
        : currentBranchId
          ? [currentBranchId]
          : [],
    currentBranch: current,
    context,
  };
}

function buildPatientFacilityFilter(scope, column = 'registeredBranchId') {
  if (!scope || scope.canAccessAllBranches) {
    return { clause: '', params: [] };
  }
  const ids = scope.currentBranchId
    ? [scope.currentBranchId]
    : (scope.branchIds || []).filter(Boolean);
  if (!ids.length) {
    return { clause: ' AND 1=0', params: [] };
  }
  if (ids.length === 1) {
    return { clause: ` AND ${column} = ?`, params: [ids[0]] };
  }
  const ph = ids.map(() => '?').join(',');
  return { clause: ` AND ${column} IN (${ph})`, params: ids };
}

function patientBelongsToScope(scope, registeredBranchId) {
  if (!scope || scope.canAccessAllBranches) return true;
  const rid = Number(registeredBranchId);
  if (!Number.isFinite(rid) || rid <= 0) return false;
  if (scope.currentBranchId) return rid === Number(scope.currentBranchId);
  return (scope.branchIds || []).some((id) => Number(id) === rid);
}

module.exports = {
  getMainBranch,
  getRequestedBranchId,
  getUserBranchContext,
  resolveBranchForRequest,
  resolveReferralOrigin,
  getRequestUserId,
  resolveFacilityScope,
  buildPatientFacilityFilter,
  patientBelongsToScope,
  isAdminRoleName,
};
