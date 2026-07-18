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

module.exports = {
  getMainBranch,
  getRequestedBranchId,
  getUserBranchContext,
  resolveBranchForRequest,
  resolveReferralOrigin,
};
