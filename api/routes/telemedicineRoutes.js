const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const { notifyTelemedicineScheduled } = require('../lib/patientSms');
const { isDailyConfigured, createDailyRoom } = require('../lib/dailyVideo');
const { getUserBranchContext, resolveBranchForRequest } = require('../lib/branchContext');

const DEFAULT_VIDEO_PROVIDER = 'daily';

function getUserId(req) {
  const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';
  if (req.user?.id != null) return req.user.id;
  if (req.user?.userId != null) return req.user.userId;

  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = decoded?.user ?? decoded;
    return user?.id ?? user?.userId ?? null;
  } catch {
    return null;
  }
}

async function getRoleNameByUserId(userId) {
  if (!userId) return null;
  const [rows] = await pool.execute(
    `SELECT r.roleName
     FROM users u
     LEFT JOIN roles r ON u.roleId = r.roleId
     WHERE u.userId = ? AND u.voided = 0 AND u.isActive = 1`,
    [userId]
  );
  return rows[0]?.roleName ?? null;
}

function calculateAgeYears(dob, referenceDate = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;

  const refYear = referenceDate.getFullYear();
  const dobYear = d.getFullYear();
  let age = refYear - dobYear;

  const refMonth = referenceDate.getMonth();
  const dobMonth = d.getMonth();

  const refDay = referenceDate.getDate();
  const dobDay = d.getDate();

  if (refMonth < dobMonth || (refMonth === dobMonth && refDay < dobDay)) {
    age -= 1;
  }

  return age;
}

function requireDoctorOrAdminRole(roleName) {
  if (!roleName) return false;
  const rn = roleName.toLowerCase();
  return (
    rn === 'admin' ||
    rn === 'doctor' ||
    rn.includes('admin') ||
    // Telemedicine-focused experience pack (role configuration)
    rn.includes('telemedicine_clinician') ||
    rn.includes('telemedicine clinician')
  );
}

/** Staff who may see facility-wide telemedicine lists and join links for active visits (e.g. nurses). */
function mayViewFacilityTelemedicineBoard(roleName) {
  if (!roleName) return false;
  const rn = roleName.toLowerCase();
  return (
    rn.includes('admin') ||
    rn.includes('nurse') ||
    rn.includes('doctor') ||
    rn.includes('midwife') ||
    rn.includes('clinical') ||
    rn.includes('triage') ||
    rn.includes('clinician') ||
    rn.includes('telemedicine')
  );
}

function mayObserverJoinTelemedicine(roleName) {
  if (!roleName) return false;
  const rn = roleName.toLowerCase();
  return (
    rn.includes('nurse') ||
    rn.includes('midwife') ||
    rn.includes('clinical officer') ||
    rn.includes('clinician') ||
    rn.includes('doctor') ||
    rn.includes('admin') ||
    rn.includes('triage') ||
    rn.includes('telemedicine')
  );
}

/**
 * Parse numeric Zoom meeting id from a join URL (Meeting SDK needs /j/###########).
 * Vanity URLs without a numeric path may not work.
 */
function extractZoomMeetingNumberFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const s = url.trim();
  const j = s.match(/\/j\/(\d{9,15})/i);
  if (j) return j[1];
  const wc = s.match(/\/wc\/(\d{9,15})/i);
  if (wc) return wc[1];
  const m = s.match(/\/meetings\/(\d{9,15})/i);
  if (m) return m[1];
  return null;
}

function parseZoomPwdFromJoinUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.searchParams.get('pwd') || null;
  } catch {
    return null;
  }
}

/** Meeting SDK JWT (HMAC-SHA256) — same claims as Zoom auth sample (see meetingsdk-auth-endpoint-sample). */
function generateZoomMeetingSdkJwt(sdkKey, sdkSecret, meetingNumber, role) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 2;
  const payload = {
    appKey: sdkKey,
    sdkKey: sdkKey,
    mn: String(meetingNumber),
    role: Number(role),
    iat,
    exp,
    tokenExp: exp,
  };
  return jwt.sign(payload, sdkSecret, { algorithm: 'HS256' });
}

/**
 * Credentials for Meeting SDK JWT signing.
 * Zoom’s UI often shows **Client ID** + **Client Secret** (same values used in JWT `appKey` / `sdkKey` + HMAC secret).
 * Official sample `.env` uses `ZOOM_MEETING_SDK_SECRET` or `CLIENT_SECRET` — we accept common aliases.
 * @see https://developers.zoom.us/docs/meeting-sdk/get-credentials/
 */
function getZoomMeetingSdkCredentialsFromEnv() {
  const sdkKey =
    process.env.ZOOM_MEETING_SDK_KEY ||
    process.env.ZOOM_CLIENT_ID ||
    process.env.ZOOM_MEETING_SDK_CLIENT_ID ||
    '';
  const sdkSecret =
    process.env.ZOOM_MEETING_SDK_SECRET ||
    process.env.ZOOM_CLIENT_SECRET ||
    '';
  return { sdkKey, sdkSecret };
}

/** Pass `connection` when inside a transaction so audit rows commit with the session insert. */
async function addAudit(sessionId, eventType, actorUserId, details, executor = pool) {
  await executor.execute(
    `INSERT INTO telemedicine_session_audit (sessionId, eventType, actorUserId, details)
     VALUES (?, ?, ?, ?)`,
    [sessionId, eventType, actorUserId || null, details || null]
  );
}

/** Avoid indefinite wait when the pool is exhausted (queueLimit may still apply at pool level). */
const POOL_ACQUIRE_TIMEOUT_MS = Number(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS || 15000);

async function acquirePoolConnection() {
  const connPromise = pool.getConnection();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          Object.assign(new Error('Could not acquire database connection in time'), {
            code: 'POOL_ACQUIRE_TIMEOUT',
          })
        ),
      POOL_ACQUIRE_TIMEOUT_MS
    )
  );
  try {
    return await Promise.race([connPromise, timeoutPromise]);
  } catch (e) {
    if (e && e.code === 'POOL_ACQUIRE_TIMEOUT') {
      connPromise
        .then((c) => {
          try {
            c.release();
          } catch (relErr) {
            console.error('Telemedicine: release after acquire timeout failed:', relErr);
          }
        })
        .catch(() => {});
    }
    throw e;
  }
}

function normalizeMeetingUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}

function validateMeetingUrlForProvider(provider, url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'Meeting link must be a valid URL.';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Meeting link must start with http:// or https://.';
  }
  const host = parsed.hostname.toLowerCase();
  if (provider === 'google_meet' && host !== 'meet.google.com') {
    return 'Google Meet sessions must use a meet.google.com link, for example https://meet.google.com/wjv-vhbt-diw.';
  }
  if (provider === 'zoom_manual' && !host.includes('zoom.')) {
    return 'Zoom sessions must use a Zoom join link.';
  }
  if (provider === 'daily' && !host.includes('daily.co')) {
    return 'Daily.co sessions must use a *.daily.co room link.';
  }
  return null;
}

/** Same normalization for Zoom, Meet, Teams, Daily, or any pasted HTTPS join URL */
const TELEMEDICINE_VIDEO_PROVIDERS = new Set([
  'daily',
  'zoom_manual',
  'google_meet',
  'microsoft_teams',
  'other_link',
]);

async function ensureDailyJoinUrl({ existingUrl, sessionUuid }) {
  const current = normalizeMeetingUrl(existingUrl);
  if (current) return current;
  if (!isDailyConfigured()) {
    const err = new Error(
      'Daily.co is not configured. Set DAILY_API_KEY on the API server, or paste a Daily room URL.'
    );
    err.code = 'DAILY_NOT_CONFIGURED';
    throw err;
  }
  const room = await createDailyRoom({ sessionUuid });
  return room.url;
}

/** Defaults for a clinician (Personal Meeting link, etc.) — optional table until migration 42. */
async function fetchUserTelemedicineDefaults(conn, userId) {
  if (userId == null || userId === '') return null;
  try {
    const [rows] = await conn.execute(
      `SELECT defaultZoomJoinUrl, defaultZoomPassword FROM user_telemedicine_settings WHERE userId = ?`,
      [userId]
    );
    return rows[0] || null;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

/** True if user has a non-empty saved join URL (required to INSERT a new telemedicine session; reuse/join exempt). */
async function userHasSavedZoomDefaults(executor, userId) {
  if (userId == null || userId === '') return false;
  try {
    const [rows] = await executor.execute(
      `SELECT defaultZoomJoinUrl FROM user_telemedicine_settings WHERE userId = ? LIMIT 1`,
      [Number(userId)]
    );
    const u = rows[0]?.defaultZoomJoinUrl;
    return !!(u && String(u).trim() !== '');
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

/** GET /api/telemedicine/my-defaults — logged-in user's saved Zoom defaults */
router.get('/my-defaults', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [rows] = await pool.execute(
      `SELECT defaultZoomJoinUrl, defaultZoomPassword, updatedAt FROM user_telemedicine_settings WHERE userId = ?`,
      [userId]
    );
    const row = rows[0];
    return res.status(200).json({
      defaultZoomJoinUrl: row?.defaultZoomJoinUrl ?? null,
      defaultZoomPassword: row?.defaultZoomPassword ?? null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(200).json({ defaultZoomJoinUrl: null, defaultZoomPassword: null, updatedAt: null });
    }
    console.error('Telemedicine my-defaults GET error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/** PUT /api/telemedicine/my-defaults — save defaults for logged-in user */
router.put('/my-defaults', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { defaultZoomJoinUrl, defaultZoomPassword } = req.body || {};
    const url =
      defaultZoomJoinUrl !== undefined && defaultZoomJoinUrl !== null && String(defaultZoomJoinUrl).trim() !== ''
        ? normalizeMeetingUrl(String(defaultZoomJoinUrl))
        : null;
    const pass =
      defaultZoomPassword !== undefined && defaultZoomPassword !== null && String(defaultZoomPassword).trim() !== ''
        ? String(defaultZoomPassword).trim()
        : null;

    await pool.execute(
      `INSERT INTO user_telemedicine_settings (userId, defaultZoomJoinUrl, defaultZoomPassword)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         defaultZoomJoinUrl = VALUES(defaultZoomJoinUrl),
         defaultZoomPassword = VALUES(defaultZoomPassword),
         updatedAt = CURRENT_TIMESTAMP`,
      [userId, url, pass]
    );

    const [rows] = await pool.execute(
      `SELECT defaultZoomJoinUrl, defaultZoomPassword, updatedAt FROM user_telemedicine_settings WHERE userId = ?`,
      [userId]
    );
    return res.status(200).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Database migration required: run api/database/migrations/42_user_telemedicine_defaults.sql',
      });
    }
    console.error('Telemedicine my-defaults PUT error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/**
 * GET /api/telemedicine/analytics
 * Held sessions are sessions that reached startedAt, not merely sessions that
 * were created. The selected branch is resolved from X-Branch-Id and the
 * caller's branch assignments.
 *
 * Query:
 *   period=daily|weekly|monthly|custom
 *   from=YYYY-MM-DD&to=YYYY-MM-DD  (required when period=custom; optional override otherwise)
 *   scope=branch|network  (network = admin / canAccessAllBranches only)
 *   facilityIds=1,2,3     (optional subset within allowed facilities)
 *   includeNotStarted=0|1 (patient counts include booked-but-not-started when 1)
 *   gender=all|Male|Female|Other
 *   provider=zoom|google_meet|link|... (optional)
 */
router.get('/analytics', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    const parseYmd = (value) => {
      const s = String(value || '').slice(0, 10);
      return ymdRe.test(s) ? s : null;
    };

    const periodRaw = String(req.query.period || 'monthly').toLowerCase();
    const period = ['daily', 'weekly', 'monthly', 'custom'].includes(periodRaw)
      ? periodRaw
      : 'monthly';
    const daysByPeriod = { daily: 1, weekly: 7, monthly: 30 };
    let fromDate = parseYmd(req.query.from);
    let toDate = parseYmd(req.query.to);

    if (period === 'custom') {
      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'Custom period requires from and to (YYYY-MM-DD)' });
      }
    } else if (!fromDate || !toDate) {
      const days = daysByPeriod[period] || 30;
      const to = new Date();
      to.setHours(12, 0, 0, 0);
      const from = new Date(to);
      from.setDate(from.getDate() - (days - 1));
      toDate = to.toISOString().slice(0, 10);
      fromDate = from.toISOString().slice(0, 10);
    }

    if (fromDate > toDate) {
      const swap = fromDate;
      fromDate = toDate;
      toDate = swap;
    }

    // Cap range to 366 days
    {
      const fromMs = new Date(`${fromDate}T12:00:00`).getTime();
      const toMs = new Date(`${toDate}T12:00:00`).getTime();
      const spanDays = Math.floor((toMs - fromMs) / 86400000) + 1;
      if (spanDays > 366) {
        return res.status(400).json({ error: 'Date range cannot exceed 366 days' });
      }
    }

    const includeNotStarted = ['1', 'true', 'yes'].includes(
      String(req.query.includeNotStarted || '').toLowerCase()
    );
    const genderFilterRaw = String(req.query.gender || 'all');
    const genderFilter = ['Male', 'Female', 'Other'].includes(genderFilterRaw)
      ? genderFilterRaw
      : 'all';
    const providerFilter = String(req.query.provider || '').trim() || null;

    const branch = await resolveBranchForRequest(pool, req, { userId });
    const context = await getUserBranchContext(pool, userId);
    const roleName = await getRoleNameByUserId(userId);
    const rn = String(roleName || '').toLowerCase();
    const canNetwork =
      context.canAccessAllBranches || rn === 'admin' || rn.includes('admin');
    const wantNetwork = String(req.query.scope || '').toLowerCase() === 'network';
    const scope = wantNetwork && canNetwork ? 'network' : 'branch';

    const [activeBranches] = await pool.execute(
      `SELECT branchId, branchCode, branchName, isMainBranch
       FROM branches WHERE isActive = 1
       ORDER BY isMainBranch DESC, branchName ASC`
    );

    let allowedIds = [];
    if (scope === 'network') {
      allowedIds = activeBranches.map((b) => Number(b.branchId)).filter(Boolean);
    } else if (branch?.branchId) {
      allowedIds = [Number(branch.branchId)];
    }

    // Optional facility subset (admins on network, or multi-assigned users)
    const requestedFacilityIds = String(req.query.facilityIds || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    let branchIds = allowedIds;
    if (requestedFacilityIds.length) {
      const allowedSet = new Set(allowedIds);
      branchIds = requestedFacilityIds.filter((id) => allowedSet.has(id));
      if (!branchIds.length) {
        return res.status(403).json({ error: 'Not allowed for the selected facility filter' });
      }
    }

    const availableFacilities = (scope === 'network' ? activeBranches : activeBranches.filter((b) =>
      allowedIds.includes(Number(b.branchId))
    )).map((b) => ({
      branchId: Number(b.branchId),
      branchCode: b.branchCode || null,
      branchName: b.branchName,
      isMainBranch: Boolean(b.isMainBranch),
    }));

    if (!branchIds.length) {
      return res.status(200).json({
        period,
        from: fromDate,
        to: toDate,
        days: 0,
        scope,
        includeNotStarted,
        gender: genderFilter,
        provider: providerFilter,
        branch: null,
        availableFacilities,
        selectedFacilityIds: [],
        overview: {},
        summary: {},
        byGender: { Male: 0, Female: 0, Other: 0 },
        byFacility: [],
        timeSeries: [],
        byProvider: [],
        byClinician: [],
        message: 'Select a facility in the header to load telemedicine metrics.',
      });
    }

    const ph = branchIds.map(() => '?').join(',');
    const rangeParams = [...branchIds, fromDate, toDate];

    // Patient inclusion: held-only vs booked (created in range)
    const patientSessionPred = includeNotStarted
      ? 'ts.createdAt >= ? AND ts.createdAt < DATE_ADD(?, INTERVAL 1 DAY)'
      : 'ts.startedAt IS NOT NULL AND ts.startedAt >= ? AND ts.startedAt < DATE_ADD(?, INTERVAL 1 DAY)';

    const heldPred =
      'ts.startedAt IS NOT NULL AND ts.startedAt >= ? AND ts.startedAt < DATE_ADD(?, INTERVAL 1 DAY)';
    const createdPred =
      'ts.createdAt >= ? AND ts.createdAt < DATE_ADD(?, INTERVAL 1 DAY)';

    let providerSql = '';
    const providerParams = [];
    if (providerFilter) {
      providerSql = ' AND ts.provider = ?';
      providerParams.push(providerFilter);
    }

    let genderSql = '';
    const genderParams = [];
    if (genderFilter === 'Male') {
      genderSql = ` AND p.gender = 'Male'`;
    } else if (genderFilter === 'Female') {
      genderSql = ` AND p.gender = 'Female'`;
    } else if (genderFilter === 'Other') {
      genderSql = ` AND (p.gender = 'Other' OR p.gender IS NULL OR p.gender = '')`;
    }

    const [overviewRows] = await pool.execute(
      `SELECT
         COUNT(DISTINCT CASE WHEN startedAt >= CURDATE() THEN sessionId END) AS sessionsToday,
         COUNT(DISTINCT CASE WHEN startedAt >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN sessionId END) AS sessionsWeek,
         COUNT(DISTINCT CASE WHEN startedAt >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN sessionId END) AS sessionsMonth
       FROM telemedicine_sessions
       WHERE branchId IN (${ph}) AND startedAt IS NOT NULL`,
      branchIds
    );

    const [summaryRows] = await pool.execute(
      `SELECT
         COUNT(DISTINCT CASE WHEN ${heldPred.replace(/ts\./g, '')} THEN sessionId END) AS sessionsHeld,
         COUNT(DISTINCT CASE WHEN ${createdPred.replace(/ts\./g, '')} THEN sessionId END) AS sessionsBooked,
         COUNT(DISTINCT CASE WHEN ${heldPred.replace(/ts\./g, '')} THEN patientId END) AS uniquePatientsHeld,
         COUNT(DISTINCT CASE WHEN ${createdPred.replace(/ts\./g, '')} THEN patientId END) AS uniquePatientsBooked,
         COUNT(DISTINCT CASE WHEN status = 'ended' AND startedAt IS NOT NULL
           AND startedAt >= ? AND startedAt < DATE_ADD(?, INTERVAL 1 DAY) THEN sessionId END) AS completedSessions,
         COUNT(DISTINCT CASE WHEN status = 'in_progress' THEN sessionId END) AS activeSessions,
         COUNT(DISTINCT CASE WHEN startedAt IS NULL AND ${createdPred.replace(/ts\./g, '')} THEN sessionId END) AS notStartedSessions,
         ROUND(AVG(CASE
           WHEN startedAt IS NOT NULL AND endedAt IS NOT NULL
             AND startedAt >= ? AND startedAt < DATE_ADD(?, INTERVAL 1 DAY)
           THEN TIMESTAMPDIFF(MINUTE, startedAt, endedAt)
         END), 1) AS averageMinutes,
         COALESCE(SUM(CASE
           WHEN startedAt IS NOT NULL AND endedAt IS NOT NULL
             AND startedAt >= ? AND startedAt < DATE_ADD(?, INTERVAL 1 DAY)
           THEN TIMESTAMPDIFF(MINUTE, startedAt, endedAt)
           ELSE 0
         END), 0) AS totalMinutes
       FROM telemedicine_sessions
       WHERE branchId IN (${ph})${providerFilter ? ' AND provider = ?' : ''}`,
      [
        fromDate, toDate, // held for sessionsHeld
        fromDate, toDate, // booked for sessionsBooked
        fromDate, toDate, // uniquePatientsHeld
        fromDate, toDate, // uniquePatientsBooked
        fromDate, toDate, // completed
        fromDate, toDate, // notStarted
        fromDate, toDate, // avg
        fromDate, toDate, // total minutes
        ...branchIds,
        ...(providerFilter ? [providerFilter] : []),
      ]
    );

    // Gender breakdown (patients matching inclusion mode)
    const [genderRows] = await pool.execute(
      `SELECT
         COUNT(DISTINCT CASE WHEN p.gender = 'Male' THEN ts.patientId END) AS malePatients,
         COUNT(DISTINCT CASE WHEN p.gender = 'Female' THEN ts.patientId END) AS femalePatients,
         COUNT(DISTINCT CASE WHEN (p.gender = 'Other' OR p.gender IS NULL OR p.gender = '') THEN ts.patientId END) AS otherPatients
       FROM telemedicine_sessions ts
       LEFT JOIN patients p ON p.patientId = ts.patientId
       WHERE ts.branchId IN (${ph})
         AND ${patientSessionPred}${providerSql}`,
      [...branchIds, fromDate, toDate, ...providerParams]
    );

    // Filtered unique patients (gender filter applied)
    const [filteredPatientRows] = await pool.execute(
      `SELECT COUNT(DISTINCT ts.patientId) AS uniquePatients
       FROM telemedicine_sessions ts
       LEFT JOIN patients p ON p.patientId = ts.patientId
       WHERE ts.branchId IN (${ph})
         AND ${patientSessionPred}${providerSql}${genderSql}`,
      [...branchIds, fromDate, toDate, ...providerParams, ...genderParams]
    );

    const [facilityRows] = await pool.execute(
      `SELECT
         ts.branchId,
         b.branchCode,
         b.branchName,
         COUNT(DISTINCT CASE WHEN ${heldPred} THEN ts.sessionId END) AS sessionsHeld,
         COUNT(DISTINCT CASE WHEN ${createdPred} THEN ts.sessionId END) AS sessionsBooked,
         COUNT(DISTINCT CASE WHEN ${heldPred}${genderSql.replace(/p\./g, 'p.')} THEN ts.patientId END) AS uniquePatientsHeld,
         COUNT(DISTINCT CASE WHEN ${patientSessionPred}${genderSql} THEN ts.patientId END) AS uniquePatients,
         COUNT(DISTINCT CASE WHEN ${patientSessionPred} AND p.gender = 'Male' THEN ts.patientId END) AS malePatients,
         COUNT(DISTINCT CASE WHEN ${patientSessionPred} AND p.gender = 'Female' THEN ts.patientId END) AS femalePatients,
         COUNT(DISTINCT CASE WHEN ${patientSessionPred} AND (p.gender = 'Other' OR p.gender IS NULL OR p.gender = '') THEN ts.patientId END) AS otherPatients
       FROM telemedicine_sessions ts
       LEFT JOIN patients p ON p.patientId = ts.patientId
       LEFT JOIN branches b ON b.branchId = ts.branchId
       WHERE ts.branchId IN (${ph})${providerSql}
       GROUP BY ts.branchId, b.branchCode, b.branchName
       HAVING sessionsHeld > 0 OR sessionsBooked > 0
       ORDER BY uniquePatients DESC, sessionsHeld DESC, b.branchName ASC`,
      [
        // held sessionsHeld
        fromDate, toDate,
        // created sessionsBooked
        fromDate, toDate,
        // uniquePatientsHeld (+ optional gender — genderSql uses p. which is fine)
        fromDate, toDate, ...genderParams,
        // uniquePatients with patientSessionPred + gender
        fromDate, toDate, ...genderParams,
        // male
        fromDate, toDate,
        // female
        fromDate, toDate,
        // other
        fromDate, toDate,
        ...branchIds,
        ...providerParams,
      ]
    );

    // Time series: held sessions by day; also booked if includeNotStarted
    const [timeRowsHeld] = await pool.execute(
      `SELECT DATE(startedAt) AS date, COUNT(DISTINCT sessionId) AS sessionsHeld,
              COUNT(DISTINCT patientId) AS uniquePatients
       FROM telemedicine_sessions
       WHERE branchId IN (${ph})
         AND startedAt IS NOT NULL
         AND startedAt >= ? AND startedAt < DATE_ADD(?, INTERVAL 1 DAY)
         ${providerFilter ? 'AND provider = ?' : ''}
       GROUP BY DATE(startedAt)
       ORDER BY DATE(startedAt)`,
      [...branchIds, fromDate, toDate, ...(providerFilter ? [providerFilter] : [])]
    );

    const [timeRowsBooked] = includeNotStarted
      ? await pool.execute(
          `SELECT DATE(createdAt) AS date, COUNT(DISTINCT sessionId) AS sessionsBooked,
                  COUNT(DISTINCT patientId) AS uniquePatientsBooked
           FROM telemedicine_sessions
           WHERE branchId IN (${ph})
             AND createdAt >= ? AND createdAt < DATE_ADD(?, INTERVAL 1 DAY)
             ${providerFilter ? 'AND provider = ?' : ''}
           GROUP BY DATE(createdAt)
           ORDER BY DATE(createdAt)`,
          [...branchIds, fromDate, toDate, ...(providerFilter ? [providerFilter] : [])]
        )
      : [[]];

    const [providerRows] = await pool.execute(
      `SELECT provider, COUNT(DISTINCT sessionId) AS sessionsHeld
       FROM telemedicine_sessions
       WHERE branchId IN (${ph})
         AND startedAt IS NOT NULL
         AND startedAt >= ? AND startedAt < DATE_ADD(?, INTERVAL 1 DAY)
         ${providerFilter ? 'AND provider = ?' : ''}
       GROUP BY provider
       ORDER BY sessionsHeld DESC`,
      [...branchIds, fromDate, toDate, ...(providerFilter ? [providerFilter] : [])]
    );

    const [clinicianRows] = await pool.execute(
      `SELECT ts.doctorId,
              CONCAT_WS(' ', u.firstName, u.lastName) AS clinicianName,
              COUNT(DISTINCT CASE WHEN ${heldPred} THEN ts.sessionId END) AS sessionsHeld,
              COUNT(DISTINCT CASE WHEN ${patientSessionPred}${genderSql} THEN ts.patientId END) AS uniquePatients
       FROM telemedicine_sessions ts
       LEFT JOIN users u ON u.userId = ts.doctorId
       LEFT JOIN patients p ON p.patientId = ts.patientId
       WHERE ts.branchId IN (${ph})${providerSql}
       GROUP BY ts.doctorId, u.firstName, u.lastName
       HAVING sessionsHeld > 0 OR uniquePatients > 0
       ORDER BY sessionsHeld DESC
       LIMIT 15`,
      [
        fromDate, toDate,
        fromDate, toDate, ...genderParams,
        ...branchIds,
        ...providerParams,
      ]
    );

    const summary = summaryRows[0] || {};
    const held = Number(summary.sessionsHeld || 0);
    const booked = Number(summary.sessionsBooked || 0);
    const completed = Number(summary.completedSessions || 0);
    const uniquePatients = Number(
      filteredPatientRows[0]?.uniquePatients ??
        (includeNotStarted ? summary.uniquePatientsBooked : summary.uniquePatientsHeld) ??
        0
    );

    const heldIndex = new Map(
      timeRowsHeld.map((row) => [new Date(row.date).toISOString().slice(0, 10), row])
    );
    const bookedIndex = new Map(
      (timeRowsBooked || []).map((row) => [new Date(row.date).toISOString().slice(0, 10), row])
    );
    const timeSeries = [];
    {
      const cursor = new Date(`${fromDate}T12:00:00`);
      const end = new Date(`${toDate}T12:00:00`);
      while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        const heldRow = heldIndex.get(key);
        const bookedRow = bookedIndex.get(key);
        timeSeries.push({
          date: key,
          sessionsHeld: Number(heldRow?.sessionsHeld || 0),
          uniquePatients: Number(heldRow?.uniquePatients || 0),
          sessionsBooked: Number(bookedRow?.sessionsBooked || 0),
          uniquePatientsBooked: Number(bookedRow?.uniquePatientsBooked || 0),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const spanDays = timeSeries.length;

    return res.status(200).json({
      period,
      from: fromDate,
      to: toDate,
      days: spanDays,
      scope,
      includeNotStarted,
      gender: genderFilter,
      provider: providerFilter,
      canNetwork,
      branch: scope === 'network' && branchIds.length > 1
        ? {
            branchId: null,
            branchName: branchIds.length === allowedIds.length ? 'All facilities' : 'Selected facilities',
            isNetwork: true,
          }
        : branch || availableFacilities.find((f) => f.branchId === branchIds[0]) || null,
      availableFacilities,
      selectedFacilityIds: branchIds,
      overview: {
        sessionsToday: Number(overviewRows[0]?.sessionsToday || 0),
        sessionsWeek: Number(overviewRows[0]?.sessionsWeek || 0),
        sessionsMonth: Number(overviewRows[0]?.sessionsMonth || 0),
      },
      summary: {
        sessionsHeld: held,
        sessionsBooked: booked,
        uniquePatients,
        uniquePatientsHeld: Number(summary.uniquePatientsHeld || 0),
        uniquePatientsBooked: Number(summary.uniquePatientsBooked || 0),
        completedSessions: completed,
        activeSessions: Number(summary.activeSessions || 0),
        notStartedSessions: Number(summary.notStartedSessions || 0),
        averageMinutes: Number(summary.averageMinutes || 0),
        totalMinutes: Number(summary.totalMinutes || 0),
        completionRate: held ? Math.round((completed / held) * 1000) / 10 : 0,
      },
      byGender: {
        Male: Number(genderRows[0]?.malePatients || 0),
        Female: Number(genderRows[0]?.femalePatients || 0),
        Other: Number(genderRows[0]?.otherPatients || 0),
      },
      byFacility: facilityRows.map((row) => ({
        branchId: Number(row.branchId),
        branchCode: row.branchCode || null,
        branchName: row.branchName || `Facility #${row.branchId}`,
        sessionsHeld: Number(row.sessionsHeld || 0),
        sessionsBooked: Number(row.sessionsBooked || 0),
        uniquePatients: Number(row.uniquePatients || 0),
        uniquePatientsHeld: Number(row.uniquePatientsHeld || 0),
        malePatients: Number(row.malePatients || 0),
        femalePatients: Number(row.femalePatients || 0),
        otherPatients: Number(row.otherPatients || 0),
      })),
      timeSeries,
      byProvider: providerRows.map((row) => ({
        provider: row.provider,
        sessionsHeld: Number(row.sessionsHeld || 0),
      })),
      byClinician: clinicianRows.map((row) => ({
        doctorId: Number(row.doctorId),
        clinicianName: row.clinicianName || `Clinician #${row.doctorId}`,
        sessionsHeld: Number(row.sessionsHeld || 0),
        uniquePatients: Number(row.uniquePatients || 0),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        error: 'Database migration required: run api/database/migrations/67_telemedicine_metrics.sql',
      });
    }
    console.error('Telemedicine analytics error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/**
 * GET /api/telemedicine/queue
 * Active telemedicine queue for the caller's selected/assigned facility.
 */
router.get('/queue', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const branch = await resolveBranchForRequest(pool, req, { userId });
    if (!branch?.branchId) return res.status(200).json([]);

    const [rows] = await pool.execute(
      `SELECT q.queueId, COALESCE(q.branchId, p.registeredBranchId) AS branchId,
              q.patientId, q.doctorId, q.ticketNumber,
              q.servicePoint, q.priority, q.status, q.estimatedWaitTime,
              q.arrivalTime, q.calledTime, q.startTime, q.endTime,
              q.createdAt, q.updatedAt,
              p.firstName AS patientFirstName,
              p.lastName AS patientLastName,
              p.patientNumber,
              b.branchName
       FROM queue_entries q
       INNER JOIN patients p ON p.patientId = q.patientId
       LEFT JOIN branches b ON b.branchId = q.branchId
       WHERE q.servicePoint = 'telemedicine'
         AND q.status NOT IN ('completed', 'cancelled')
         AND COALESCE(q.branchId, p.registeredBranchId) = ?
         AND NOT EXISTS (
           SELECT 1
           FROM telemedicine_sessions activeSession
           WHERE activeSession.queueEntryId = q.queueId
             AND activeSession.status <> 'ended'
         )
       ORDER BY q.arrivalTime DESC, q.queueId DESC
       LIMIT 200`,
      [branch.branchId]
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error('Telemedicine queue error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/** Create session — default provider is Daily.co (auto room); Zoom still supported. */
router.post('/sessions', async (req, res) => {
  const {
    originType,
    appointmentId,
    admissionId,
    queueEntryId,
    patientId: bodyPatientId,
    doctorId,
    notes,
    zoomJoinUrl,
    zoomPassword,
    videoProvider,
    provider: providerBody,
    forceNew,
  } = req.body || {};

  let providerToStore = DEFAULT_VIDEO_PROVIDER;
  const rawProvider = videoProvider != null && String(videoProvider).trim() !== '' ? videoProvider : providerBody;
  if (rawProvider != null && String(rawProvider).trim() !== '') {
    const p = String(rawProvider).trim();
    if (!TELEMEDICINE_VIDEO_PROVIDERS.has(p)) {
      return res.status(400).json({
        error: `Invalid videoProvider. Allowed: ${[...TELEMEDICINE_VIDEO_PROVIDERS].join(', ')}`,
      });
    }
    providerToStore = p;
  }

  // Validate before acquiring a pool connection (avoids tying up connections on bad requests)
  if (!originType || !['appointment', 'inpatient', 'standalone', 'queue'].includes(originType)) {
    return res.status(400).json({ error: 'originType must be appointment, inpatient, standalone, or queue' });
  }
  if (!doctorId) {
    return res.status(400).json({ error: 'doctorId is required' });
  }
  if (originType !== 'queue' && !bodyPatientId) {
    return res.status(400).json({ error: 'patientId is required' });
  }
  if (originType === 'appointment' && !appointmentId) {
    return res.status(400).json({ error: 'appointmentId is required when originType=appointment' });
  }
  if (originType === 'inpatient' && !admissionId) {
    return res.status(400).json({ error: 'admissionId is required when originType=inpatient' });
  }

  let patientId = bodyPatientId;
  let resolvedQueueEntryId = null;
  let sourceBranchId = null;

  if (originType === 'queue') {
    const qid = queueEntryId != null && String(queueEntryId).trim() !== '' ? parseInt(queueEntryId, 10) : NaN;
    if (!Number.isFinite(qid)) {
      return res.status(400).json({ error: 'queueEntryId is required when originType=queue' });
    }
    try {
      const [qrows] = await pool.execute(
        `SELECT queueId, patientId, servicePoint, status, ticketNumber, branchId
         FROM queue_entries WHERE queueId = ?`,
        [qid]
      );
      if (!qrows || qrows.length === 0) {
        return res.status(404).json({ error: 'Queue entry not found' });
      }
      const q = qrows[0];
      if (String(q.servicePoint) !== 'telemedicine') {
        return res.status(400).json({
          error:
            'This queue entry is not for telemedicine. Add the patient to the Telemedicine queue first, then use this queue ID.',
        });
      }
      if (q.status === 'completed' || q.status === 'cancelled') {
        return res.status(400).json({ error: 'This queue entry is no longer active (completed or cancelled).' });
      }
      patientId = q.patientId;
      resolvedQueueEntryId = qid;
      sourceBranchId = q.branchId || null;
    } catch (qErr) {
      if (qErr.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({
          error: 'Database migration required: run api/database/migrations/43_telemedicine_queue_origin.sql',
        });
      }
      console.error('Telemedicine queue lookup error:', qErr);
      return res.status(500).json({ error: qErr.message || 'Could not load queue entry' });
    }
  }

  const userId = getUserId(req);
  const actor = userId || null;
  if (!sourceBranchId && originType === 'appointment' && appointmentId) {
    const [appointmentRows] = await pool.execute(
      `SELECT branchId FROM appointments WHERE appointmentId = ? LIMIT 1`,
      [appointmentId]
    );
    sourceBranchId = appointmentRows[0]?.branchId || null;
  }
  const resolvedBranch = await resolveBranchForRequest(pool, req, {
    body: req.body || {},
    userId,
    branchId: sourceBranchId,
  });
  const branchId = resolvedBranch?.branchId || sourceBranchId || null;

  const sessionUuid = crypto.randomUUID();
  let zUrl = normalizeMeetingUrl(zoomJoinUrl);
  let zPass = zoomPassword != null && String(zoomPassword).trim() !== '' ? String(zoomPassword).trim() : null;
  const initialUrlError = validateMeetingUrlForProvider(providerToStore, zUrl);
  if (initialUrlError) return res.status(400).json({ error: initialUrlError });
  if (providerToStore === 'google_meet' && !zUrl) {
    return res.status(400).json({ error: 'Paste a Google Meet link before starting a Google Meet telemedicine session.' });
  }

  // Daily: auto-create a room when no link was pasted
  if (providerToStore === 'daily' && !zUrl) {
    try {
      zUrl = await ensureDailyJoinUrl({ existingUrl: null, sessionUuid });
    } catch (dailyErr) {
      const status = dailyErr.code === 'DAILY_NOT_CONFIGURED' ? 503 : 502;
      return res.status(status).json({
        error: dailyErr.message || 'Failed to create Daily.co room',
        code: dailyErr.code || 'DAILY_CREATE_FAILED',
      });
    }
  }

  // Load "My Zoom defaults" only for Zoom — other platforms paste links or auto-create (Daily).
  // Try both doctorId (request) and logged-in user so defaults apply even if the client sent a mismatched id.
  if (!zUrl && providerToStore === 'zoom_manual') {
    const candidateUserIds = [];
    if (doctorId != null && String(doctorId).trim() !== '') {
      const d = Number(doctorId);
      if (Number.isFinite(d)) candidateUserIds.push(d);
    }
    if (userId != null && String(userId).trim() !== '') {
      const u = Number(userId);
      if (Number.isFinite(u) && !candidateUserIds.includes(u)) candidateUserIds.push(u);
    }
    for (const uid of candidateUserIds) {
      try {
        const defs = await fetchUserTelemedicineDefaults(pool, uid);
        if (defs?.defaultZoomJoinUrl) {
          zUrl = normalizeMeetingUrl(defs.defaultZoomJoinUrl);
          if (!zPass && defs.defaultZoomPassword) {
            zPass = String(defs.defaultZoomPassword).trim() || null;
          }
          break;
        }
      } catch (defErr) {
        if (defErr.code === 'ER_NO_SUCH_TABLE') {
          // optional migration
        } else {
          console.error('Telemedicine defaults fetch (pre-session):', defErr);
          return res.status(500).json({ error: defErr.message || 'Could not load Zoom defaults' });
        }
      }
    }
  }

  const pid = Number(patientId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return res.status(400).json({ error: 'Invalid patientId' });
  }

  const wantForceNew =
    forceNew === true ||
    forceNew === 1 ||
    String(forceNew || '').toLowerCase() === 'true';

  let connection;
  try {
    connection = await acquirePoolConnection();
    await connection.beginTransaction();

    // Serialize session creation per patient so concurrent "Start telemedicine" never opens two active rooms.
    const [patientLock] = await connection.execute(`SELECT patientId FROM patients WHERE patientId = ? FOR UPDATE`, [pid]);
    if (!patientLock || patientLock.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!wantForceNew) {
      const [existingRows] = await connection.execute(
        `SELECT sessionId, sessionUuid, provider, zoomJoinUrl, zoomPassword, status, doctorId
         FROM telemedicine_sessions
         WHERE patientId = ? AND status <> 'ended'
         ORDER BY createdAt DESC
         LIMIT 1
         FOR UPDATE`,
        [pid]
      );

      if (existingRows && existingRows.length > 0) {
        const ex = existingRows[0];
        let outUrl = ex.zoomJoinUrl;
        let outPass = ex.zoomPassword;
        const providerChanged = providerToStore !== (ex.provider || DEFAULT_VIDEO_PROVIDER);
        // If the clinician explicitly chooses another platform, switch the active visit instead of silently reopening Zoom.
        const existingEmpty = !ex.zoomJoinUrl || String(ex.zoomJoinUrl).trim() === '';
        if (providerChanged || (existingEmpty && zUrl)) {
          let nextUrl = providerChanged ? zUrl : outUrl || zUrl;
          if (providerToStore === 'daily' && !nextUrl) {
            try {
              nextUrl = await ensureDailyJoinUrl({ existingUrl: null, sessionUuid: ex.sessionUuid });
            } catch (dailyErr) {
              await connection.rollback();
              const status = dailyErr.code === 'DAILY_NOT_CONFIGURED' ? 503 : 502;
              return res.status(status).json({
                error: dailyErr.message || 'Failed to create Daily.co room',
                code: dailyErr.code || 'DAILY_CREATE_FAILED',
              });
            }
          }
          await connection.execute(
            `UPDATE telemedicine_sessions
             SET provider = ?, zoomJoinUrl = ?, zoomPassword = ?, updatedAt = NOW()
             WHERE sessionId = ?`,
            [
              providerChanged ? providerToStore : ex.provider,
              providerChanged ? nextUrl : outUrl || nextUrl,
              providerChanged ? zPass : outPass || zPass,
              ex.sessionId,
            ]
          );
          outUrl = providerChanged ? nextUrl : outUrl || nextUrl;
          outPass = providerChanged ? zPass : outPass || zPass;
          if (providerChanged) ex.provider = providerToStore;
        }

        await addAudit(
          ex.sessionId,
          'session_reused_join',
          actor,
          providerChanged
            ? `Switched active visit for patient ${pid} to ${providerToStore} (requesting doctorId=${doctorId}; primary doctorId=${ex.doctorId})`
            : `Joined existing active visit for patient ${pid} (requesting doctorId=${doctorId}; primary doctorId=${ex.doctorId})`,
          connection
        );
        if (branchId || resolvedQueueEntryId) {
          await connection.execute(
            `UPDATE telemedicine_sessions
             SET branchId = COALESCE(branchId, ?),
                 queueEntryId = COALESCE(queueEntryId, ?),
                 originType = CASE
                   WHEN ? IS NOT NULL AND originType = 'standalone' THEN 'queue'
                   ELSE originType
                 END
             WHERE sessionId = ?`,
            [branchId, resolvedQueueEntryId, resolvedQueueEntryId, ex.sessionId]
          );
        }
        if (resolvedQueueEntryId) {
          const queueStatus = ex.status === 'in_progress' || ex.status === 'recording_started'
            ? 'serving'
            : 'called';
          await connection.execute(
            `UPDATE queue_entries
             SET status = ?,
                 calledTime = COALESCE(calledTime, NOW()),
                 startTime = CASE WHEN ? = 'serving' THEN COALESCE(startTime, NOW()) ELSE startTime END,
                 updatedAt = NOW()
             WHERE queueId = ?`,
            [queueStatus, queueStatus, resolvedQueueEntryId]
          );
        }
        await connection.commit();

        if (outUrl && pid) {
          notifyTelemedicineScheduled(pid, {
            joinUrl: outUrl,
            sessionUuid: ex.sessionUuid,
          });
        }

        return res.status(200).json({
          sessionId: ex.sessionId,
          sessionUuid: ex.sessionUuid,
          provider: ex.provider,
          zoomJoinUrl: outUrl,
          status: ex.status,
          reusedExistingSession: true,
          providerSwitched: providerChanged,
          primaryDoctorId: ex.doctorId,
        });
      }
    }

    // New Zoom visits need defaults. Daily auto-creates a room; Meet requires a pasted link.
    if (!userId) {
      await connection.rollback();
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const canStartNewVisit =
      providerToStore !== 'zoom_manual' ||
      !!zUrl ||
      (await userHasSavedZoomDefaults(connection, userId));
    if (!canStartNewVisit) {
      await connection.rollback();
      return res.status(403).json({
        error:
          'Save your meeting defaults under Telemedicine → My Zoom defaults before starting a new Zoom visit, choose Daily.co (default), or paste a meeting link.',
        code: 'TELEMEDICINE_ZOOM_DEFAULTS_REQUIRED',
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO telemedicine_sessions
       (sessionUuid, originType, appointmentId, admissionId, queueEntryId, branchId, provider, roomName, roomUrl, zoomJoinUrl, zoomPassword,
        patientId, doctorId, status, recordingPolicyEnabled, notes, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'created', 0, ?, ?)`,
      [
        sessionUuid,
        originType,
        appointmentId || null,
        admissionId || null,
        resolvedQueueEntryId,
        branchId,
        providerToStore,
        zUrl,
        zPass,
        pid,
        doctorId,
        notes || null,
        actor,
      ]
    );

    const sessionId = result.insertId;
    const auditHint = zUrl ? `${providerToStore} with join URL` : `${providerToStore} (link pending)`;
    await addAudit(sessionId, 'session_created', actor, auditHint, connection);
    if (resolvedQueueEntryId) {
      await connection.execute(
        `UPDATE queue_entries
         SET status = 'called', calledTime = COALESCE(calledTime, NOW()), updatedAt = NOW()
         WHERE queueId = ?`,
        [resolvedQueueEntryId]
      );
    }

    await connection.commit();

    if (pid) {
      notifyTelemedicineScheduled(pid, {
        joinUrl: zUrl || null,
        sessionUuid,
      });
    }

    return res.status(201).json({
      sessionId,
      sessionUuid,
      provider: providerToStore,
      zoomJoinUrl: zUrl,
      status: 'created',
      reusedExistingSession: false,
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.error('Telemedicine session rollback error:', rbErr);
      }
    }
    if (err.code === 'POOL_ACQUIRE_TIMEOUT') {
      console.error('Telemedicine session create: pool acquire timeout');
      return res.status(503).json({
        error: 'Database is busy. Please try again in a few seconds.',
        code: 'POOL_ACQUIRE_TIMEOUT',
      });
    }
    if (err.code === 'ER_BAD_FIELD_ERROR' && String(err.sqlMessage || err.message || '').includes('queueEntryId')) {
      return res.status(503).json({
        error: 'Database migration required: run api/database/migrations/43_telemedicine_queue_origin.sql',
      });
    }
    if (
      err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' ||
      (err.code === 'WARN_DATA_TRUNCATED' && String(err.sqlMessage || '').includes('provider'))
    ) {
      return res.status(503).json({
        error: 'Database migration required: run api/database/migrations/49_telemedicine_video_providers.sql',
      });
    }
    console.error('Telemedicine session create error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  } finally {
    if (connection) connection.release();
  }
});

/** Update pasted meeting join link + optional password/provider (doctor/admin on own session). */
router.patch('/sessions/:sessionId/link', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = getUserId(req);
    const { zoomJoinUrl, zoomPassword, videoProvider, provider: providerBody } = req.body || {};

    const [rows] = await pool.execute(
      `SELECT sessionId, doctorId, provider, patientId, sessionUuid FROM telemedicine_sessions WHERE sessionId = ?`,
      [sessionId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const s = rows[0];

    const roleName = await getRoleNameByUserId(userId);
    const rn = (roleName || '').toLowerCase();
    const isAdmin = rn === 'admin' || rn.includes('admin');
    if (!userId || (!isAdmin && Number(s.doctorId) !== Number(userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rawProvider = videoProvider != null && String(videoProvider).trim() !== '' ? videoProvider : providerBody;
    let providerToStore;
    if (rawProvider != null && String(rawProvider).trim() !== '') {
      const p = String(rawProvider).trim();
      if (!TELEMEDICINE_VIDEO_PROVIDERS.has(p)) {
        return res.status(400).json({
          error: `Invalid videoProvider. Allowed: ${[...TELEMEDICINE_VIDEO_PROVIDERS].join(', ')}`,
        });
      }
      providerToStore = p;
    }

    const effectiveProvider = providerToStore || s.provider || DEFAULT_VIDEO_PROVIDER;
    const zUrl = zoomJoinUrl !== undefined ? normalizeMeetingUrl(zoomJoinUrl) : undefined;
    const urlError = validateMeetingUrlForProvider(effectiveProvider, zUrl);
    if (urlError) return res.status(400).json({ error: urlError });
    const zPass =
      zoomPassword !== undefined
        ? zoomPassword != null && String(zoomPassword).trim() !== ''
          ? String(zoomPassword).trim()
          : null
        : undefined;

    const updates = [];
    const params = [];
    if (providerToStore !== undefined) {
      updates.push('provider = ?');
      params.push(providerToStore);
    }
    if (zUrl !== undefined) {
      updates.push('zoomJoinUrl = ?');
      params.push(zUrl);
    }
    if (zPass !== undefined) {
      updates.push('zoomPassword = ?');
      params.push(zPass);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Provide provider, zoomJoinUrl, and/or zoomPassword' });
    }
    updates.push('updatedAt = NOW()');
    params.push(sessionId);

    await pool.execute(`UPDATE telemedicine_sessions SET ${updates.join(', ')} WHERE sessionId = ?`, params);
    await addAudit(sessionId, 'meeting_link_updated', userId, providerToStore || s.provider || null);

    const [out] = await pool.execute(
      `SELECT sessionId, provider, zoomJoinUrl, zoomPassword, status FROM telemedicine_sessions WHERE sessionId = ?`,
      [sessionId]
    );

    if (zUrl && s.patientId) {
      notifyTelemedicineScheduled(s.patientId, {
        joinUrl: zUrl,
        sessionUuid: s.sessionUuid,
      });
    }

    return res.status(200).json(out[0]);
  } catch (err) {
    console.error('Telemedicine link update error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/**
 * GET /api/telemedicine/sessions — list sessions for current user (doctor: own sessions; admin: all)
 */
router.get('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const roleName = await getRoleNameByUserId(userId);
    const rn = (roleName || '').toLowerCase();
    const isAdmin = rn === 'admin' || rn.includes('admin');
    const scopeFacility = String(req.query.scope || '') === 'facility';

    let where = '1=1';
    const params = [];
    if (scopeFacility) {
      const branch = await resolveBranchForRequest(pool, req, { userId });
      where = `(
        ts.branchId = ?
        OR ts.doctorId = ?
        OR ts.createdBy = ?
        OR EXISTS (
          SELECT 1 FROM telemedicine_session_audit userAudit
          WHERE userAudit.sessionId = ts.sessionId AND userAudit.actorUserId = ?
        )
      )`;
      params.push(branch?.branchId || 0, userId, userId, userId);
    } else if (!isAdmin) {
      where = 'ts.doctorId = ?';
      params.push(userId);
    }

    const statusGroup = String(req.query.statusGroup || '').toLowerCase();
    if (statusGroup === 'active') {
      where += ` AND ts.status <> 'ended'`;
    } else if (statusGroup === 'ended') {
      where += ` AND ts.status = 'ended'`;
    } else if (statusGroup === 'pending') {
      where += ` AND ts.status <> 'ended' AND ts.startedAt IS NULL`;
    } else if (statusGroup === 'in_progress') {
      where += ` AND ts.status IN ('in_progress', 'recording_started')`;
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM telemedicine_sessions ts WHERE ${where}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.execute(
      `SELECT ts.sessionId,
              ts.sessionUuid,
              ts.originType,
              ts.status,
              ts.provider,
              ts.patientId,
              ts.doctorId,
              ts.appointmentId,
              ts.admissionId,
              ts.queueEntryId,
              ts.branchId,
              ts.zoomJoinUrl,
              ts.startedAt,
              ts.endedAt,
              COALESCE(ts.endedAt, ts.startedAt, ts.createdAt) AS activityAt,
              ts.createdAt,
              ts.updatedAt,
              p.firstName AS patientFirstName,
              p.lastName AS patientLastName,
              p.patientNumber,
              u.firstName AS doctorFirstName,
              u.lastName AS doctorLastName,
              b.branchName
       FROM telemedicine_sessions ts
       INNER JOIN patients p ON ts.patientId = p.patientId
       INNER JOIN users u ON ts.doctorId = u.userId
       LEFT JOIN branches b ON ts.branchId = b.branchId
       WHERE ${where}
       ORDER BY COALESCE(ts.endedAt, ts.startedAt, ts.createdAt) DESC, ts.sessionId DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.status(200).json({ sessions: rows, page, limit, total });
  } catch (err) {
    console.error('Telemedicine list error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = getUserId(req);

    const [rows] = await pool.execute(
      `SELECT ts.*,
              p.dateOfBirth,
              p.nextOfKinName,
              p.nextOfKinPhone,
              p.nextOfKinRelationship,
              p.firstName as patientFirstName,
              p.lastName as patientLastName,
              u.firstName as doctorFirstName,
              u.lastName as doctorLastName
       FROM telemedicine_sessions ts
       INNER JOIN patients p ON ts.patientId = p.patientId
       INNER JOIN users u ON ts.doctorId = u.userId
       WHERE ts.sessionId = ?`,
      [sessionId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const s = rows[0];

    const roleName = await getRoleNameByUserId(userId);
    const rn = (roleName || '').toLowerCase();
    const isDoctorOwner = userId && Number(s.doctorId) === Number(userId);
    const isAdminUser = rn === 'admin' || rn.includes('admin');
    if (userId && (isAdminUser || isDoctorOwner || mayObserverJoinTelemedicine(roleName))) {
      return res.status(200).json(s);
    }

    return res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    console.error('Telemedicine session fetch error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/**
 * Consent for teleconsultation (and legacy recording flags kept for audit).
 * No external recording API in zoom_manual mode.
 */
router.post('/sessions/:sessionId/consent', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { sessionId } = req.params;
    const actorUserId = getUserId(req);

    const {
      patientConsentGranted,
      guardianConsentGranted,
      guardianName,
      guardianPhone,
      guardianRelationship,
    } = req.body || {};

    if (patientConsentGranted !== true && patientConsentGranted !== false) {
      await connection.rollback();
      return res.status(400).json({ error: 'patientConsentGranted is required (boolean)' });
    }

    const [sessionRows] = await connection.execute(
      `SELECT ts.*, p.dateOfBirth
       FROM telemedicine_sessions ts
       INNER JOIN patients p ON ts.patientId = p.patientId
       WHERE ts.sessionId = ? FOR UPDATE`,
      [sessionId]
    );

    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionRows[0];
    const ageYears = calculateAgeYears(session.dateOfBirth, new Date());

    if (ageYears === null) {
      await connection.rollback();
      return res.status(400).json({ error: 'Patient dateOfBirth is missing/invalid; cannot determine minor requirement' });
    }

    const guardianConsentRequired = ageYears < 18;

    if (guardianConsentRequired) {
      if (guardianConsentGranted !== true) {
        await connection.rollback();
        return res.status(400).json({ error: 'Guardian consent is required for minors under 18' });
      }
      if (!guardianName || !guardianRelationship) {
        await connection.rollback();
        return res.status(400).json({ error: 'Guardian name and relationship are required for minor consent' });
      }
    }

    if (patientConsentGranted !== true) {
      await connection.execute(
        `UPDATE telemedicine_sessions
         SET patientConsentGranted = ?, patientConsentAt = ?,
             patientConsentBy = ?,
             guardianConsentGranted = 0,
             guardianConsentAt = NULL,
             guardianConsentBy = NULL,
             recordingConsentSatisfiedAt = NULL,
             updatedAt = NOW(),
             status = CASE
               WHEN status IN ('in_progress','recording_started') THEN status
               ELSE 'waiting_for_consent'
             END
         WHERE sessionId = ?`,
        [0, new Date(), actorUserId || null, sessionId]
      );

      await addAudit(sessionId, 'patient_consent_recorded', actorUserId, 'Consent denied; teleconsult consent cleared');
      await connection.commit();
      return res.status(200).json({ ok: true, guardianConsentRequired, recordingConsentSatisfiedAt: null });
    }

    const now = new Date();
    const newRecordingConsentSatisfiedAt =
      patientConsentGranted === true && (!guardianConsentRequired || guardianConsentGranted === true) ? now : null;

    await connection.execute(
      `UPDATE telemedicine_sessions
       SET ageAtConsentYears = ?,
           minorRequired = ?,
           patientConsentGranted = 1,
           patientConsentAt = ?,
           patientConsentBy = ?,
           guardianConsentRequired = ?,
           guardianConsentGranted = ?,
           guardianConsentAt = ?,
           guardianConsentBy = ?,
           guardianName = ?,
           guardianPhone = ?,
           guardianRelationship = ?,
           recordingConsentSatisfiedAt = ?,
           updatedAt = NOW(),
           status = CASE
             WHEN status = 'created' THEN 'waiting_for_consent'
             ELSE status
           END
       WHERE sessionId = ?`,
      [
        ageYears,
        guardianConsentRequired ? 1 : 0,
        now,
        actorUserId || null,
        guardianConsentRequired ? 1 : 0,
        guardianConsentRequired ? 1 : 0,
        guardianConsentRequired ? now : null,
        guardianConsentRequired ? actorUserId || null : null,
        guardianConsentRequired ? guardianName || null : null,
        guardianConsentRequired ? guardianPhone || null : null,
        guardianConsentRequired ? guardianRelationship || null : null,
        newRecordingConsentSatisfiedAt,
        sessionId,
      ]
    );

    await addAudit(
      sessionId,
      guardianConsentRequired ? 'guardian_consent_recorded' : 'patient_consent_recorded',
      actorUserId,
      `guardianRequired=${guardianConsentRequired}; mode=zoom_manual`
    );

    await connection.commit();
    return res.status(200).json({
      ok: true,
      guardianConsentRequired,
      recordingConsentSatisfiedAt: newRecordingConsentSatisfiedAt,
      startedRecordingNow: false,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Telemedicine consent error:', err);
    return res.status(400).json({ error: err.message || 'Consent failed' });
  } finally {
    connection.release();
  }
});

router.post('/sessions/:sessionId/start', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { sessionId } = req.params;
    const actorUserId = getUserId(req);

    const [rows] = await connection.execute(
      `SELECT ts.sessionId, ts.status, ts.recordingConsentSatisfiedAt, ts.provider,
              ts.patientId, ts.branchId, ts.queueEntryId, ts.startedAt
       FROM telemedicine_sessions ts
       WHERE ts.sessionId = ? FOR UPDATE`,
      [sessionId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Session not found' });
    }
    const s = rows[0];

    if (s.status === 'ended') {
      await connection.rollback();
      return res.status(400).json({ error: 'Session is already ended' });
    }

    if (s.startedAt || s.status === 'in_progress') {
      await connection.commit();
      return res.status(200).json({ ok: true, alreadyStarted: true, startedRecordingNow: false });
    }

    if (!s.recordingConsentSatisfiedAt) {
      await connection.rollback();
      return res.status(400).json({ error: 'Teleconsult consent must be recorded before starting the session' });
    }

    await connection.execute(
      `UPDATE telemedicine_sessions
       SET status = 'in_progress', startedAt = COALESCE(startedAt, NOW()), updatedAt = NOW()
       WHERE sessionId = ?`,
      [sessionId]
    );
    await addAudit(sessionId, 'teleconsult_started', actorUserId, s.provider || DEFAULT_VIDEO_PROVIDER);

    // Keep the telemedicine queue synchronized with the session lifecycle.
    try {
      const patientId = s.patientId;
      let linkedQueueId = s.queueEntryId;
      if (!linkedQueueId) {
        const [existingTm] = await connection.execute(
          `SELECT queueId FROM queue_entries
           WHERE patientId = ? AND servicePoint = 'telemedicine'
             AND DATE(arrivalTime) = CURDATE()
             AND status NOT IN ('completed', 'cancelled')
           ORDER BY arrivalTime DESC, queueId DESC
           LIMIT 1`,
          [patientId]
        );
        linkedQueueId = existingTm[0]?.queueId || null;
      }

      if (linkedQueueId) {
        await connection.execute(
          `UPDATE queue_entries
           SET status = 'serving',
               calledTime = COALESCE(calledTime, NOW()),
               startTime = COALESCE(startTime, NOW()),
               updatedAt = NOW()
           WHERE queueId = ?`,
          [linkedQueueId]
        );
        await connection.execute(
          `UPDATE telemedicine_sessions
           SET queueEntryId = COALESCE(queueEntryId, ?),
               branchId = COALESCE(branchId, ?),
               originType = CASE WHEN originType = 'standalone' THEN 'queue' ELSE originType END
           WHERE sessionId = ?`,
          [linkedQueueId, s.branchId, sessionId]
        );
      } else {
        const [tmCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "telemedicine"'
        );
        const ticketNum = (tmCount[0]?.count || 0) + 1;
        const ticket = `TM-${String(ticketNum).padStart(3, '0')}`;
        const [queueResult] = await connection.execute(
          `INSERT INTO queue_entries
             (branchId, patientId, ticketNumber, servicePoint, priority, status,
              calledTime, startTime, notes, createdBy)
           VALUES (?, ?, ?, 'telemedicine', 'normal', 'serving', NOW(), NOW(), ?, ?)`,
          [s.branchId, patientId, ticket, `Telemedicine session #${sessionId}`, actorUserId || null]
        );
        await connection.execute(
          `UPDATE telemedicine_sessions SET queueEntryId = ? WHERE sessionId = ?`,
          [queueResult.insertId, sessionId]
        );
      }
    } catch (tmQErr) {
      console.error('[TELEMEDICINE QUEUE]', tmQErr);
    }

    await connection.commit();
    return res.status(200).json({ ok: true, startedRecordingNow: false });
  } catch (err) {
    await connection.rollback();
    console.error('Telemedicine start error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  } finally {
    connection.release();
  }
});

router.post('/sessions/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const actorUserId = getUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [rows] = await pool.execute(
      `SELECT doctorId, status, queueEntryId FROM telemedicine_sessions WHERE sessionId = ?`,
      [sessionId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const row = rows[0];
    if (String(row.status) === 'ended') {
      return res.status(400).json({ error: 'Session already ended' });
    }

    const roleName = await getRoleNameByUserId(actorUserId);
    const isOwner = Number(row.doctorId) === Number(actorUserId);
    const rn = (roleName || '').toLowerCase();
    const isAdmin = rn === 'admin' || rn.includes('admin');
    const canFacility = mayViewFacilityTelemedicineBoard(roleName);
    if (!isAdmin && !isOwner && !canFacility) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.execute(
      `UPDATE telemedicine_sessions
       SET status = 'ended', endedAt = COALESCE(endedAt, NOW()), updatedAt = NOW()
       WHERE sessionId = ?`,
      [sessionId]
    );
    await pool.execute(
      `INSERT INTO telemedicine_session_audit (sessionId, eventType, actorUserId, details)
       VALUES (?, 'call_ended', ?, NULL)`,
      [sessionId, actorUserId]
    );
    if (row.queueEntryId) {
      await pool.execute(
        `UPDATE queue_entries
         SET status = 'completed', endTime = COALESCE(endTime, NOW()), updatedAt = NOW()
         WHERE queueId = ? AND servicePoint = 'telemedicine'`,
        [row.queueEntryId]
      );
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telemedicine end error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

router.get('/sessions/:sessionId/recording/download', async (req, res) => {
  return res.status(501).json({
    error: 'Cloud recording is not integrated in Zoom link mode. Record locally in Zoom if your policy allows.',
  });
});

/**
 * Whether Daily.co API key is set (for auto room create + in-page embed).
 */
router.get('/daily-status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(200).json({ configured: isDailyConfigured() });
  } catch (err) {
    console.error('daily-status error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/**
 * Ensure a Daily room URL exists on a session (create via Daily API if missing).
 */
router.post('/sessions/:sessionId/ensure-daily-room', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { sessionId } = req.params;

    const [rows] = await pool.execute(
      `SELECT sessionId, sessionUuid, doctorId, provider, zoomJoinUrl, status, patientId
       FROM telemedicine_sessions WHERE sessionId = ?`,
      [sessionId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    const s = rows[0];

    const roleName = await getRoleNameByUserId(userId);
    const rn = (roleName || '').toLowerCase();
    const isAdmin = rn === 'admin' || rn.includes('admin');
    if (!isAdmin && Number(s.doctorId) !== Number(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (String(s.status) === 'ended') {
      return res.status(400).json({ error: 'Session already ended' });
    }

    let url = normalizeMeetingUrl(s.zoomJoinUrl);
    let created = false;
    if (!url) {
      url = await ensureDailyJoinUrl({ existingUrl: null, sessionUuid: s.sessionUuid });
      created = true;
      await pool.execute(
        `UPDATE telemedicine_sessions
         SET provider = 'daily', zoomJoinUrl = ?, updatedAt = NOW()
         WHERE sessionId = ?`,
        [url, sessionId]
      );
      await addAudit(sessionId, 'daily_room_created', userId, url);
      if (s.patientId) {
        notifyTelemedicineScheduled(s.patientId, {
          joinUrl: url,
          sessionUuid: s.sessionUuid,
        });
      }
    } else if ((s.provider || '') !== 'daily') {
      await pool.execute(
        `UPDATE telemedicine_sessions SET provider = 'daily', updatedAt = NOW() WHERE sessionId = ?`,
        [sessionId]
      );
    }

    return res.status(200).json({
      sessionId: Number(sessionId),
      provider: 'daily',
      zoomJoinUrl: url,
      created,
    });
  } catch (err) {
    console.error('ensure-daily-room error:', err);
    const status = err.code === 'DAILY_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({
      error: err.message || 'Failed to ensure Daily room',
      code: err.code || 'DAILY_CREATE_FAILED',
    });
  }
});

/**
 * Whether Zoom Meeting SDK env vars are set (for embedded video in HMIS).
 * Requires a logged-in user so unauthenticated clients cannot probe deployment config.
 */
router.get('/zoom-meeting-sdk-status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { sdkKey, sdkSecret } = getZoomMeetingSdkCredentialsFromEnv();
    return res.status(200).json({ configured: !!(sdkKey && sdkSecret) });
  } catch (err) {
    console.error('zoom-meeting-sdk-status error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/**
 * Returns a short-lived JWT signature for Zoom Meeting SDK (Component View) join.
 * Set credentials from a Zoom Marketplace "Meeting SDK" app (Client ID + Client Secret, or ZOOM_MEETING_SDK_* aliases).
 */
router.post('/sessions/:sessionId/zoom-sdk-signature', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const rawRole = req.body?.role;
    const role = rawRole != null && rawRole !== '' ? Number(rawRole) : 1;
    if (role !== 0 && role !== 1) {
      return res.status(400).json({ error: 'role must be 0 (participant) or 1 (host)' });
    }

    const { sdkKey, sdkSecret } = getZoomMeetingSdkCredentialsFromEnv();
    if (!sdkKey || !sdkSecret) {
      return res.status(503).json({
        error:
          'Meeting SDK is not configured. Set ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET (or ZOOM_MEETING_SDK_KEY + ZOOM_MEETING_SDK_SECRET) on the API server.',
        configured: false,
      });
    }

    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [sessionQuery, roleName] = await Promise.all([
      pool.execute(
        `SELECT ts.zoomJoinUrl, ts.zoomPassword, ts.doctorId, ts.provider, ts.status
         FROM telemedicine_sessions ts
         WHERE ts.sessionId = ?`,
        [sessionId],
      ),
      getRoleNameByUserId(userId),
    ]);
    const [rows] = sessionQuery;
    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const s = rows[0];
    const rn = (roleName || '').toLowerCase();
    const isDoctorOwner = Number(s.doctorId) === Number(userId);
    const isAdminUser = rn === 'admin' || rn.includes('admin');
    const isObserver =
      !isDoctorOwner &&
      !isAdminUser &&
      mayObserverJoinTelemedicine(roleName);

    if (isObserver) {
      if (s.status === 'ended') {
        return res.status(400).json({ error: 'Session has ended; join link is no longer distributed.' });
      }
    } else if (!isDoctorOwner && !isAdminUser) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if ((s.provider || 'zoom_manual') !== 'zoom_manual') {
      return res.status(400).json({ error: 'Embedded in-page video is currently available only for Zoom sessions. Use the saved meeting link for this provider.' });
    }

    if (!s.zoomJoinUrl) {
      return res.status(400).json({ error: 'No Zoom join URL saved yet. Paste the meeting link on the session page.' });
    }

    const meetingNumber = extractZoomMeetingNumberFromUrl(s.zoomJoinUrl);
    if (!meetingNumber) {
      return res.status(400).json({
        error:
          'Could not read a meeting number from the Zoom link. Use a standard URL like https://zoom.us/j/12345678901 (or your region’s us02web.zoom.us/j/…).',
      });
    }

    const pwdFromUrl = parseZoomPwdFromJoinUrl(s.zoomJoinUrl);
    const password =
      s.zoomPassword != null && String(s.zoomPassword).trim() !== ''
        ? String(s.zoomPassword).trim()
        : pwdFromUrl || '';

    const signature = generateZoomMeetingSdkJwt(sdkKey, sdkSecret, meetingNumber, role);

    return res.status(200).json({
      signature,
      meetingNumber: String(meetingNumber),
      password,
      /** Public Meeting SDK client id — some SDK builds expect this on join alongside signature. */
      sdkKey,
    });
  } catch (err) {
    console.error('zoom-sdk-signature error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

/** Doctor join: returns stored meeting URL (no vendor token — user opens normal video provider link). */
router.get('/sessions/:sessionId/join-url', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const roleName = await getRoleNameByUserId(userId);

    const [rows] = await pool.execute(
      `SELECT ts.zoomJoinUrl, ts.zoomPassword, ts.doctorId, ts.provider, ts.status
       FROM telemedicine_sessions ts
       WHERE ts.sessionId = ?`,
      [sessionId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const s = rows[0];
    const rn = (roleName || '').toLowerCase();
    const isDoctorOwner = Number(s.doctorId) === Number(userId);
    const isAdminUser = rn === 'admin' || rn.includes('admin');
    const isObserver =
      !isDoctorOwner &&
      !isAdminUser &&
      mayObserverJoinTelemedicine(roleName);

    if (isObserver) {
      if (s.status === 'ended') {
        return res.status(400).json({ error: 'Session has ended; join link is no longer distributed.' });
      }
    } else if (!isDoctorOwner && !isAdminUser) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!s.zoomJoinUrl) {
      return res.status(400).json({ error: 'No meeting link saved yet. Paste the meeting link on the session page.' });
    }

    return res.status(200).json({
      joinUrl: s.zoomJoinUrl,
      zoomPassword: s.zoomPassword || null,
      provider: s.provider || DEFAULT_VIDEO_PROVIDER,
    });
  } catch (err) {
    console.error('Telemedicine join-url error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
