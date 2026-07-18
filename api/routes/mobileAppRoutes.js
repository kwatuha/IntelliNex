/**
 * IntelliNex Field mobile APK release API — mounted at /api/mobile-app
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  UPLOAD_DIR,
  ensureTables,
  getCurrentReleaseRow,
  rowToRelease,
  userHasAcknowledgedRelease,
  acknowledgeRelease,
  registerReleaseRecord,
  voidPreviousReleases,
  getApkAbsolutePath,
  logUsageEvent,
  getUsageReport,
} = require('../lib/mobileAppRelease');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';
const MAX_APK_BYTES = 120 * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.apk';
    cb(null, `intellinex-field-${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_APK_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const ok =
      ext === '.apk' ||
      mime === 'application/vnd.android.package-archive' ||
      mime === 'application/octet-stream';
    if (!ok) return cb(new Error('Only Android APK files are allowed.'));
    cb(null, true);
  },
});

function attachUser(req, _res, next) {
  if (req.user) return next();
  const authHeader = req.header('Authorization');
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryToken = req.query.access_token ? String(req.query.access_token) : null;
  const token = headerToken || queryToken;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user || decoded;
  } catch {
    /* leave unauthenticated */
  }
  return next();
}

function userIdFromReq(req) {
  const u = req.user;
  if (!u) return null;
  const id = Number(u.id ?? u.userId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isAdminUser(user) {
  if (!user) return false;
  const rn = String(user.roleName || user.role || '').toLowerCase();
  return rn === 'admin' || rn.includes('admin');
}

function requireAuth(req, res, next) {
  if (!userIdFromReq(req)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Administrator access is required to manage the Field app release.' });
  }
  return next();
}

router.use(async (_req, _res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    next(err);
  }
});

router.use(attachUser);

/** GET /api/mobile-app/release */
router.get('/release', async (req, res) => {
  try {
    const row = await getCurrentReleaseRow();
    if (!row) {
      return res.json({ available: false, release: null, isNewForUser: false });
    }
    const userId = userIdFromReq(req);
    const release = rowToRelease(row);
    let isNewForUser = false;
    if (userId) {
      const seen = await userHasAcknowledgedRelease(userId, release.id);
      isNewForUser = !seen;
    }
    return res.json({ available: true, release, isNewForUser });
  } catch (err) {
    console.error('mobile-app release get:', err);
    return res.status(500).json({ error: err.message || 'Failed to load Field app release.' });
  }
});

/** POST /api/mobile-app/release/dismiss */
router.post('/release/dismiss', requireAuth, async (req, res) => {
  try {
    const userId = userIdFromReq(req);
    const row = await getCurrentReleaseRow();
    if (!row) return res.json({ ok: true, dismissed: false });
    await acknowledgeRelease(userId, row.releaseId);
    await logUsageEvent({
      userId,
      eventType: 'release_viewed',
      releaseId: row.releaseId,
      releaseVersion: row.version,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ ok: true, dismissed: true, releaseId: row.releaseId });
  } catch (err) {
    console.error('mobile-app release dismiss:', err);
    return res.status(500).json({ error: err.message || 'Failed to dismiss notification.' });
  }
});

/** GET /api/mobile-app/download — Bearer or ?access_token= */
router.get('/download', requireAuth, async (req, res) => {
  try {
    const row = await getCurrentReleaseRow();
    if (!row) {
      return res.status(404).json({ error: 'No Field app release is available yet.' });
    }
    const userId = userIdFromReq(req);
    await logUsageEvent({
      userId,
      eventType: 'apk_download',
      releaseId: row.releaseId,
      releaseVersion: row.version,
      userAgent: req.headers['user-agent'],
    });
    const fp = getApkAbsolutePath(row.storedFileName);
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ error: 'APK file is missing on the server. Contact an administrator.' });
    }
    const downloadName = row.originalFileName || 'intellinex-field.apk';
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    return res.download(fp, downloadName);
  } catch (err) {
    console.error('mobile-app download:', err);
    return res.status(500).json({ error: err.message || 'Failed to download Field app.' });
  }
});

/** POST /api/mobile-app/upload — admin multipart */
router.post(
  '/upload',
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
      return next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No APK file uploaded.' });
      }
      const version = String(req.body.version || '').trim();
      if (!version) {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Version label is required (e.g. 1.0.0).' });
      }

      await voidPreviousReleases();
      const release = await registerReleaseRecord({
        version,
        releaseNotes: String(req.body.releaseNotes || req.body.release_notes || '').trim() || null,
        originalFileName: req.file.originalname,
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype || 'application/vnd.android.package-archive',
        fileSize: req.file.size,
        uploadedByUserId: userIdFromReq(req),
      });
      return res.status(201).json({ ok: true, release });
    } catch (err) {
      console.error('mobile-app upload:', err);
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
      return res.status(500).json({ error: err.message || 'Failed to publish Field app release.' });
    }
  }
);

/** POST /api/mobile-app/usage/report — Field app login/sync telemetry */
router.post('/usage/report', requireAuth, async (req, res) => {
  try {
    const rawType = String(req.body.eventType || '').trim();
    const eventType = rawType === 'app_sync' ? 'app_sync' : 'app_login';
    const appVersion = req.body.appVersion != null ? String(req.body.appVersion) : null;
    const current = await getCurrentReleaseRow();
    await logUsageEvent({
      userId: userIdFromReq(req),
      eventType,
      appVersion,
      releaseId: current?.releaseId ?? null,
      releaseVersion: current?.version ?? null,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('mobile-app usage report:', err);
    return res.status(500).json({ error: err.message || 'Failed to record usage.' });
  }
});

/** GET /api/mobile-app/usage — admin adoption report */
router.get('/usage', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const report = await getUsageReport();
    return res.json(report);
  } catch (err) {
    console.error('mobile-app usage report get:', err);
    return res.status(500).json({ error: err.message || 'Failed to load Field app usage.' });
  }
});

module.exports = router;
