const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');

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
  return rn === 'admin' || rn === 'doctor' || rn.includes('admin');
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
    rn.includes('clinical')
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
    rn.includes('admin')
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
  return null;
}

/** Same normalization for Zoom, Meet, Teams, or any pasted HTTPS join URL */
const TELEMEDICINE_VIDEO_PROVIDERS = new Set([
  'zoom_manual',
  'google_meet',
  'microsoft_teams',
  'other_link',
  'daily',
]);

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

/** Create session (zoom_manual: no external API; optional link can be pasted later). */
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

  let providerToStore = 'zoom_manual';
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

  if (originType === 'queue') {
    const qid = queueEntryId != null && String(queueEntryId).trim() !== '' ? parseInt(queueEntryId, 10) : NaN;
    if (!Number.isFinite(qid)) {
      return res.status(400).json({ error: 'queueEntryId is required when originType=queue' });
    }
    try {
      const [qrows] = await pool.execute(
        `SELECT queueId, patientId, servicePoint, status, ticketNumber
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

  const sessionUuid = crypto.randomUUID();
  let zUrl = normalizeMeetingUrl(zoomJoinUrl);
  let zPass = zoomPassword != null && String(zoomPassword).trim() !== '' ? String(zoomPassword).trim() : null;
  const initialUrlError = validateMeetingUrlForProvider(providerToStore, zUrl);
  if (initialUrlError) return res.status(400).json({ error: initialUrlError });
  if (providerToStore === 'google_meet' && !zUrl) {
    return res.status(400).json({ error: 'Paste a Google Meet link before starting a Google Meet telemedicine session.' });
  }

  // Load "My Zoom defaults" only for Zoom — other platforms paste links on the session screen.
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
        const providerChanged = providerToStore !== (ex.provider || 'zoom_manual');
        // If the clinician explicitly chooses another platform, switch the active visit instead of silently reopening Zoom.
        const existingEmpty = !ex.zoomJoinUrl || String(ex.zoomJoinUrl).trim() === '';
        if (providerChanged || (existingEmpty && zUrl)) {
          await connection.execute(
            `UPDATE telemedicine_sessions
             SET provider = ?, zoomJoinUrl = ?, zoomPassword = ?, updatedAt = NOW()
             WHERE sessionId = ?`,
            [
              providerChanged ? providerToStore : ex.provider,
              providerChanged ? zUrl : outUrl || zUrl,
              providerChanged ? zPass : outPass || zPass,
              ex.sessionId,
            ]
          );
          outUrl = providerChanged ? zUrl : outUrl || zUrl;
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
        await connection.commit();

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

    // New Zoom visits need defaults for predictable reuse. Non-Zoom providers can be created with a pasted link or link pending.
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
          'Save your meeting defaults under Telemedicine → My Zoom defaults before starting a new Zoom visit, or choose Google Meet and paste a Meet link.',
        code: 'TELEMEDICINE_ZOOM_DEFAULTS_REQUIRED',
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO telemedicine_sessions
       (sessionUuid, originType, appointmentId, admissionId, queueEntryId, provider, roomName, roomUrl, zoomJoinUrl, zoomPassword,
        patientId, doctorId, status, recordingPolicyEnabled, notes, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'created', 0, ?, ?)`,
      [
        sessionUuid,
        originType,
        appointmentId || null,
        admissionId || null,
        resolvedQueueEntryId,
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

    await connection.commit();

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
      `SELECT sessionId, doctorId, provider FROM telemedicine_sessions WHERE sessionId = ?`,
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

    const effectiveProvider = providerToStore || s.provider || 'zoom_manual';
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
    if (scopeFacility && mayViewFacilityTelemedicineBoard(roleName)) {
      // Facility board: nurses, doctors, admins see all sessions (paginated)
      where = '1=1';
    } else if (!isAdmin) {
      where = 'ts.doctorId = ?';
      params.push(userId);
    }

    const statusGroup = String(req.query.statusGroup || '').toLowerCase();
    if (statusGroup === 'active') {
      where += ` AND ts.status <> 'ended'`;
    } else if (statusGroup === 'ended') {
      where += ` AND ts.status = 'ended'`;
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
              ts.zoomJoinUrl,
              ts.createdAt,
              ts.updatedAt,
              p.firstName AS patientFirstName,
              p.lastName AS patientLastName,
              p.patientNumber,
              u.firstName AS doctorFirstName,
              u.lastName AS doctorLastName
       FROM telemedicine_sessions ts
       INNER JOIN patients p ON ts.patientId = p.patientId
       INNER JOIN users u ON ts.doctorId = u.userId
       WHERE ${where}
       ORDER BY ts.createdAt DESC
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
      `SELECT ts.sessionId, ts.status, ts.recordingConsentSatisfiedAt, ts.provider, ts.patientId
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

    if (!s.recordingConsentSatisfiedAt) {
      await connection.rollback();
      return res.status(400).json({ error: 'Teleconsult consent must be recorded before starting the session' });
    }

    await connection.execute(
      `UPDATE telemedicine_sessions
       SET status = 'in_progress', updatedAt = NOW()
       WHERE sessionId = ?`,
      [sessionId]
    );
    await addAudit(sessionId, 'teleconsult_started', actorUserId, s.provider || 'zoom_manual');

    // Telemedicine queue: patient ready / in virtual visit (dedupe same day)
    try {
      const patientId = s.patientId;
      const [existingTm] = await connection.execute(
        `SELECT queueId FROM queue_entries
         WHERE patientId = ? AND servicePoint = 'telemedicine'
         AND DATE(arrivalTime) = CURDATE()
         AND status NOT IN ('completed', 'cancelled')`,
        [patientId]
      );
      if (existingTm.length === 0) {
        const [tmCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "telemedicine"'
        );
        const ticketNum = (tmCount[0]?.count || 0) + 1;
        const ticket = `TM-${String(ticketNum).padStart(3, '0')}`;
        await connection.execute(
          `INSERT INTO queue_entries (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
           VALUES (?, ?, 'telemedicine', 'normal', 'waiting', ?, ?)`,
          [patientId, ticket, `Telemedicine session #${sessionId}`, actorUserId || null]
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
      `SELECT doctorId, status FROM telemedicine_sessions WHERE sessionId = ?`,
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
       SET status = 'ended', updatedAt = NOW()
       WHERE sessionId = ?`,
      [sessionId]
    );
    await pool.execute(
      `INSERT INTO telemedicine_session_audit (sessionId, eventType, actorUserId, details)
       VALUES (?, 'call_ended', ?, NULL)`,
      [sessionId, actorUserId]
    );
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
      provider: s.provider || 'zoom_manual',
    });
  } catch (err) {
    console.error('Telemedicine join-url error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

module.exports = router;
