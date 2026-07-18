/**
 * IntelliNex Field APK release storage (MySQL).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../config/db');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'mobile-app');

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_app_releases (
      releaseId INT NOT NULL AUTO_INCREMENT,
      version VARCHAR(64) NOT NULL,
      releaseNotes TEXT NULL,
      originalFileName VARCHAR(255) NOT NULL,
      storedFileName VARCHAR(255) NOT NULL,
      mimeType VARCHAR(120) NULL,
      fileSize BIGINT NULL,
      uploadedByUserId INT NULL,
      voided TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (releaseId),
      INDEX idx_mobile_app_releases_active (voided, createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_app_release_acknowledgements (
      userId INT NOT NULL,
      releaseId INT NOT NULL,
      acknowledgedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (userId, releaseId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_app_usage_events (
      eventId INT NOT NULL AUTO_INCREMENT,
      userId INT NULL,
      releaseId INT NULL,
      eventType VARCHAR(40) NOT NULL,
      appVersion VARCHAR(64) NULL,
      releaseVersion VARCHAR(64) NULL,
      userAgent VARCHAR(512) NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (eventId),
      INDEX idx_mobile_app_usage_user (userId, createdAt),
      INDEX idx_mobile_app_usage_type (eventType, createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablesReady = true;
}

function rowToRelease(row) {
  if (!row) return null;
  return {
    id: row.releaseId,
    version: row.version,
    releaseNotes: row.releaseNotes ?? null,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType ?? null,
    fileSize: row.fileSize != null ? Number(row.fileSize) : null,
    uploadedByUserId: row.uploadedByUserId ?? null,
    createdAt: row.createdAt,
  };
}

async function getCurrentReleaseRow() {
  await ensureTables();
  const [rows] = await pool.execute(
    `SELECT releaseId, version, releaseNotes, originalFileName, storedFileName,
            mimeType, fileSize, uploadedByUserId, createdAt
     FROM mobile_app_releases
     WHERE voided = 0
     ORDER BY createdAt DESC, releaseId DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function userHasAcknowledgedRelease(userId, releaseId) {
  if (!userId || !releaseId) return false;
  await ensureTables();
  const [rows] = await pool.execute(
    `SELECT 1 AS ok FROM mobile_app_release_acknowledgements
     WHERE userId = ? AND releaseId = ? LIMIT 1`,
    [userId, releaseId]
  );
  return rows.length > 0;
}

async function acknowledgeRelease(userId, releaseId) {
  const uid = Number(userId);
  const rid = Number(releaseId);
  if (!Number.isFinite(uid) || !Number.isFinite(rid)) {
    throw new Error('Invalid user or release id.');
  }
  await ensureTables();
  await pool.execute(
    `INSERT INTO mobile_app_release_acknowledgements (userId, releaseId, acknowledgedAt)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE acknowledgedAt = NOW()`,
    [uid, rid]
  );
  return { ok: true };
}

async function voidPreviousReleases() {
  await ensureTables();
  const [prev] = await pool.execute(
    `SELECT releaseId, storedFileName FROM mobile_app_releases WHERE voided = 0 ORDER BY createdAt DESC`
  );
  for (const old of prev) {
    await pool.execute(`UPDATE mobile_app_releases SET voided = 1 WHERE releaseId = ?`, [old.releaseId]);
    const oldPath = path.join(UPLOAD_DIR, old.storedFileName || '');
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        /* ignore */
      }
    }
  }
}

async function registerReleaseRecord({
  version,
  releaseNotes = null,
  originalFileName,
  storedFileName,
  mimeType = 'application/vnd.android.package-archive',
  fileSize,
  uploadedByUserId = null,
}) {
  await ensureTables();
  const versionLabel = String(version || '').trim().slice(0, 64);
  if (!versionLabel) throw new Error('Version label is required (e.g. 1.0.0).');
  if (!storedFileName) throw new Error('storedFileName is required.');

  const notes =
    releaseNotes != null && String(releaseNotes).trim()
      ? String(releaseNotes).trim().slice(0, 4000)
      : null;

  const [result] = await pool.execute(
    `INSERT INTO mobile_app_releases
       (version, releaseNotes, originalFileName, storedFileName, mimeType, fileSize, uploadedByUserId)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      versionLabel,
      notes,
      originalFileName || `intellinex-field-${versionLabel}.apk`,
      storedFileName,
      mimeType,
      fileSize,
      uploadedByUserId,
    ]
  );

  const [rows] = await pool.execute(
    `SELECT releaseId, version, releaseNotes, originalFileName, storedFileName,
            mimeType, fileSize, uploadedByUserId, createdAt
     FROM mobile_app_releases WHERE releaseId = ?`,
    [result.insertId]
  );
  return rowToRelease(rows[0]);
}

async function publishReleaseFromFile({
  sourceApkPath,
  version,
  releaseNotes = null,
  originalFileName = null,
  uploadedByUserId = null,
}) {
  const src = path.resolve(sourceApkPath);
  if (!fs.existsSync(src)) throw new Error(`APK not found: ${src}`);

  const stat = fs.statSync(src);
  const ext = path.extname(src).toLowerCase() || '.apk';
  const storedFileName = `intellinex-field-${crypto.randomBytes(12).toString('hex')}${ext}`;
  const destPath = path.join(UPLOAD_DIR, storedFileName);

  await voidPreviousReleases();
  fs.copyFileSync(src, destPath);

  return registerReleaseRecord({
    version,
    releaseNotes,
    originalFileName: originalFileName || path.basename(src) || `intellinex-field-${version}.apk`,
    storedFileName,
    fileSize: stat.size,
    uploadedByUserId,
  });
}

function getApkAbsolutePath(storedFileName) {
  return path.join(UPLOAD_DIR, storedFileName || '');
}

const ALLOWED_EVENT_TYPES = new Set(['apk_download', 'release_viewed', 'app_login', 'app_sync']);

async function logUsageEvent({
  userId,
  eventType,
  releaseId = null,
  releaseVersion = null,
  appVersion = null,
  userAgent = null,
}) {
  const uid = userId != null ? Number(userId) : null;
  const type = String(eventType || '').trim();
  if (!ALLOWED_EVENT_TYPES.has(type)) return;
  await ensureTables();
  const rid = releaseId != null ? Number(releaseId) : null;
  await pool.execute(
    `INSERT INTO mobile_app_usage_events
       (userId, releaseId, eventType, appVersion, releaseVersion, userAgent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Number.isFinite(uid) ? uid : null,
      Number.isFinite(rid) ? rid : null,
      type,
      appVersion != null ? String(appVersion).trim().slice(0, 64) || null : null,
      releaseVersion != null ? String(releaseVersion).trim().slice(0, 64) || null : null,
      userAgent != null ? String(userAgent).trim().slice(0, 512) || null : null,
    ]
  );
}

/**
 * Aggregated Field app adoption report for admins (MySQL).
 * Mirrors Machakos GET /mobile-app/usage response shape.
 */
async function getUsageReport() {
  await ensureTables();
  const current = await getCurrentReleaseRow();
  const currentVersion = current?.version || null;

  const [summaryRows] = await pool.execute(`
    SELECT
      SUM(eventType = 'apk_download') AS totalDownloads,
      COUNT(DISTINCT CASE WHEN eventType = 'apk_download' THEN userId END) AS uniqueDownloaders,
      COUNT(DISTINCT CASE WHEN eventType IN ('app_login', 'app_sync') THEN userId END) AS uniqueAppUsers
    FROM mobile_app_usage_events
  `);
  const summaryRow = summaryRows[0] || {};

  const [versionRows] = await pool.execute(`
    SELECT
      COALESCE(releaseVersion, appVersion, 'unknown') AS version_label,
      SUM(eventType = 'apk_download') AS download_count,
      COUNT(DISTINCT CASE WHEN eventType = 'apk_download' THEN userId END) AS downloader_count,
      SUM(eventType IN ('app_login', 'app_sync')) AS app_activity_count,
      COUNT(DISTINCT CASE WHEN eventType IN ('app_login', 'app_sync') THEN userId END) AS app_user_count
    FROM mobile_app_usage_events
    GROUP BY COALESCE(releaseVersion, appVersion, 'unknown')
    ORDER BY download_count DESC, app_activity_count DESC, version_label ASC
  `);

  const [userRows] = await pool.execute(`
    SELECT
      p.userId,
      u.username,
      u.email,
      TRIM(CONCAT(COALESCE(u.firstName, ''), ' ', COALESCE(u.lastName, ''))) AS fullName,
      r.roleName,
      p.lastDownloadAt,
      ld.lastDownloadVersion,
      p.downloadCount,
      p.lastAppActivityAt,
      la.lastAppVersion,
      p.appActivityCount,
      p.lastReleaseViewAt
    FROM (
      SELECT
        userId,
        MAX(CASE WHEN eventType = 'apk_download' THEN createdAt END) AS lastDownloadAt,
        SUM(eventType = 'apk_download') AS downloadCount,
        MAX(CASE WHEN eventType IN ('app_login', 'app_sync') THEN createdAt END) AS lastAppActivityAt,
        SUM(eventType IN ('app_login', 'app_sync')) AS appActivityCount,
        MAX(CASE WHEN eventType = 'release_viewed' THEN createdAt END) AS lastReleaseViewAt
      FROM mobile_app_usage_events
      WHERE userId IS NOT NULL
      GROUP BY userId
    ) p
    INNER JOIN users u ON u.userId = p.userId AND COALESCE(u.voided, 0) = 0
    LEFT JOIN roles r ON r.roleId = u.roleId
    LEFT JOIN (
      SELECT e.userId, e.releaseVersion AS lastDownloadVersion
      FROM mobile_app_usage_events e
      INNER JOIN (
        SELECT userId, MAX(createdAt) AS mx
        FROM mobile_app_usage_events
        WHERE eventType = 'apk_download' AND releaseVersion IS NOT NULL
        GROUP BY userId
      ) t ON t.userId = e.userId AND t.mx = e.createdAt AND e.eventType = 'apk_download'
        AND e.releaseVersion IS NOT NULL
      GROUP BY e.userId, e.releaseVersion
    ) ld ON ld.userId = p.userId
    LEFT JOIN (
      SELECT e.userId, e.appVersion AS lastAppVersion
      FROM mobile_app_usage_events e
      INNER JOIN (
        SELECT userId, MAX(createdAt) AS mx
        FROM mobile_app_usage_events
        WHERE eventType IN ('app_login', 'app_sync') AND appVersion IS NOT NULL
        GROUP BY userId
      ) t ON t.userId = e.userId AND t.mx = e.createdAt
        AND e.eventType IN ('app_login', 'app_sync') AND e.appVersion IS NOT NULL
      GROUP BY e.userId, e.appVersion
    ) la ON la.userId = p.userId
    ORDER BY COALESCE(p.lastAppActivityAt, p.lastDownloadAt) DESC, u.username ASC
    LIMIT 1000
  `);

  const users = (userRows || []).map((row) => ({
    userId: row.userId,
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    roleName: row.roleName,
    lastDownloadAt: row.lastDownloadAt,
    lastDownloadVersion: row.lastDownloadVersion,
    downloadCount: Number(row.downloadCount || 0),
    lastAppActivityAt: row.lastAppActivityAt,
    lastAppVersion: row.lastAppVersion,
    appActivityCount: Number(row.appActivityCount || 0),
    lastReleaseViewAt: row.lastReleaseViewAt,
    onLatestAppVersion:
      currentVersion && row.lastAppVersion
        ? String(row.lastAppVersion) === String(currentVersion)
        : null,
    onLatestDownloadVersion:
      currentVersion && row.lastDownloadVersion
        ? String(row.lastDownloadVersion) === String(currentVersion)
        : null,
  }));

  let onLatestAppVersion = 0;
  let onOlderAppVersion = 0;
  for (const u of users) {
    if (!u.lastAppVersion) continue;
    if (u.onLatestAppVersion) onLatestAppVersion += 1;
    else onOlderAppVersion += 1;
  }

  const [eventRows] = await pool.execute(`
    SELECT
      e.eventId AS id,
      e.userId,
      u.username,
      e.eventType,
      e.appVersion,
      e.releaseVersion,
      e.createdAt
    FROM mobile_app_usage_events e
    LEFT JOIN users u ON u.userId = e.userId
    ORDER BY e.createdAt DESC
    LIMIT 300
  `);

  return {
    currentRelease: current ? rowToRelease(current) : null,
    summary: {
      totalDownloads: Number(summaryRow.totalDownloads || 0),
      uniqueDownloaders: Number(summaryRow.uniqueDownloaders || 0),
      uniqueAppUsers: Number(summaryRow.uniqueAppUsers || 0),
      onLatestAppVersion,
      onOlderAppVersion,
    },
    versionBreakdown: (versionRows || []).map((row) => ({
      version_label: row.version_label,
      download_count: Number(row.download_count || 0),
      downloader_count: Number(row.downloader_count || 0),
      app_activity_count: Number(row.app_activity_count || 0),
      app_user_count: Number(row.app_user_count || 0),
    })),
    users,
    recentEvents: (eventRows || []).map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      eventType: row.eventType,
      appVersion: row.appVersion,
      releaseVersion: row.releaseVersion,
      createdAt: row.createdAt,
    })),
  };
}

module.exports = {
  UPLOAD_DIR,
  ensureTables,
  rowToRelease,
  getCurrentReleaseRow,
  userHasAcknowledgedRelease,
  acknowledgeRelease,
  voidPreviousReleases,
  registerReleaseRecord,
  publishReleaseFromFile,
  getApkAbsolutePath,
  logUsageEvent,
  getUsageReport,
};
