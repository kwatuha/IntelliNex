// Appointment management routes
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { notifyAppointmentScheduled, notifyAppointmentUpdated } = require('../lib/patientSms');
const { getUserBranchContext, resolveBranchForRequest, resolveFacilityScope, patientBelongsToScope } = require('../lib/branchContext');

function formatSqlDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(value);
    return s.slice(0, 10);
}

function isValidYmd(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

async function getRoleNameByUserId(userId) {
    if (!userId) return null;
    try {
        const [rows] = await pool.execute(
            `SELECT r.roleName
             FROM users u
             LEFT JOIN roles r ON u.roleId = r.roleId
             WHERE u.userId = ? AND u.voided = 0 AND u.isActive = 1`,
            [userId]
        );
        return rows[0]?.roleName ?? null;
    } catch {
        return null;
    }
}

function isAdminRole(roleName) {
    const rn = String(roleName || '').toLowerCase();
    return rn === 'admin' || rn.includes('admin');
}

/**
 * Resolve daily booking limit for a facility/date.
 * Specific date override wins over default (limitDate IS NULL).
 */
async function resolveDailyLimit(branchId, dateYmd) {
    if (!branchId || !isValidYmd(dateYmd)) return null;
    try {
        const [rows] = await pool.execute(
            `SELECT limitId, branchId, limitDate, maxAppointments, setByUserId, notes
             FROM appointment_daily_limits
             WHERE branchId = ?
               AND (limitDate = ? OR limitDate IS NULL)
             ORDER BY (limitDate IS NULL) ASC
             LIMIT 1`,
            [branchId, dateYmd]
        );
        if (!rows[0]) return null;
        return {
            limitId: rows[0].limitId,
            branchId: Number(rows[0].branchId),
            limitDate: rows[0].limitDate ? formatSqlDate(rows[0].limitDate) : null,
            maxAppointments: Number(rows[0].maxAppointments),
            source: rows[0].limitDate ? 'date' : 'default',
            notes: rows[0].notes || null,
        };
    } catch (err) {
        if (err?.code === 'ER_NO_SUCH_TABLE') return null;
        throw err;
    }
}

async function countBookedAppointments(branchId, dateYmd) {
    const [rows] = await pool.execute(
        `SELECT COUNT(*) AS booked
         FROM appointments a
         LEFT JOIN patients p ON a.patientId = p.patientId
         WHERE a.appointmentDate = ?
           AND a.status NOT IN ('cancelled', 'no_show')
           AND COALESCE(a.branchId, p.registeredBranchId) = ?`,
        [dateYmd, branchId]
    );
    return Number(rows[0]?.booked || 0);
}

/** Normalize TIME / HH:mm / HH:mm:ss to HH:mm for comparison. */
function formatSqlTimeHm(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        const h = String(value.getHours()).padStart(2, '0');
        const m = String(value.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Same patient + same service (department) + same calendar day,
 * excluding cancelled / no_show. Optional excludeAppointmentId for updates.
 * Time is not required to match — same-day repeat bookings for one service
 * are the usual accidental duplicates (e.g. 10:23 and 10:24).
 */
async function findDuplicateAppointment({
    patientId,
    appointmentDate,
    appointmentTime,
    department,
    excludeAppointmentId = null,
}) {
    if (!patientId || !appointmentDate) return null;
    const dateYmd = formatSqlDate(appointmentDate);
    if (!dateYmd) return null;

    const dept =
        department == null || department === '' || department === 'none'
            ? null
            : String(department).trim();

    const params = [patientId, dateYmd, dept];
    let excludeSql = '';
    if (excludeAppointmentId != null) {
        excludeSql = ' AND a.appointmentId <> ?';
        params.push(excludeAppointmentId);
    }

    const [rows] = await pool.execute(
        `SELECT a.appointmentId, a.patientId, a.appointmentDate, a.appointmentTime,
                a.department, a.status, a.doctorId
         FROM appointments a
         WHERE a.patientId = ?
           AND a.appointmentDate = ?
           AND (a.department <=> ?)
           AND a.status NOT IN ('cancelled', 'no_show')
           ${excludeSql}
         ORDER BY a.appointmentTime ASC, a.appointmentId ASC
         LIMIT 1`,
        params
    );
    return rows[0] || null;
}

function duplicateAppointmentResponse(existing) {
    const dateYmd = formatSqlDate(existing.appointmentDate);
    const timeHm = formatSqlTimeHm(existing.appointmentTime);
    const serviceLabel = existing.department || 'this service';
    const timePart = timeHm ? ` (already at ${timeHm})` : '';
    return {
        code: 'DUPLICATE_APPOINTMENT',
        message: `This patient already has an appointment for ${serviceLabel} on ${dateYmd}${timePart}. Continue anyway?`,
        existingAppointment: {
            appointmentId: existing.appointmentId,
            patientId: existing.patientId,
            appointmentDate: dateYmd,
            appointmentTime: timeHm,
            department: existing.department || null,
            status: existing.status,
            doctorId: existing.doctorId ?? null,
        },
    };
}

async function assertUserCanManageBranch(userId, branchId) {
    const context = await getUserBranchContext(pool, userId);
    const roleName = await getRoleNameByUserId(userId);
    if (context.canAccessAllBranches || isAdminRole(roleName)) return true;
    return (context.branches || []).some((b) => Number(b.branchId) === Number(branchId));
}

/** Optional JWT user id (global auth middleware is not always enabled). */
function getUserId(req) {
    if (req.user?.id != null) return req.user.id;
    if (req.user?.userId != null) return req.user.userId;
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = decoded?.user ?? decoded;
        return user?.id ?? user?.userId ?? null;
    } catch {
        return null;
    }
}

/**
 * Provider calendar: facilities with booked patient counts by day.
 * GET /api/appointments/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/calendar', async (req, res) => {
    try {
        const userId = getUserId(req);
        const context = await getUserBranchContext(pool, userId);
        const roleName = await getRoleNameByUserId(userId);
        const rn = String(roleName || '').toLowerCase();
        const isNurseLike =
            rn === 'nurse' || rn.includes('triage') || rn.includes('reception');
        const isProviderBoard =
            !isNurseLike &&
            (context.canAccessAllBranches ||
                isAdminRole(roleName) ||
                rn === 'doctor' ||
                rn.includes('telemedicine') ||
                rn.includes('clinical_officer') ||
                rn.includes('medical_officer') ||
                rn.includes('clinician') ||
                !userId);

        let accessible = (context.branches || []).filter((b) => b?.branchId);
        // Provider / admin board: all active facilities so clinics with bookings are visible
        if (isProviderBoard) {
            const [allBranches] = await pool.execute(
                `SELECT branchId, branchCode, branchName, isMainBranch
                 FROM branches
                 WHERE isActive = 1
                 ORDER BY isMainBranch DESC, branchName ASC`
            );
            accessible = allBranches.map((row) => ({
                branchId: row.branchId,
                branchCode: row.branchCode,
                branchName: row.branchName,
                isMainBranch: Boolean(row.isMainBranch),
            }));
        }
        const branchIds = accessible.map((b) => Number(b.branchId)).filter(Boolean);

        let from = formatSqlDate(req.query.from);
        let to = formatSqlDate(req.query.to);
        if (!isValidYmd(from) || !isValidYmd(to)) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            from = formatSqlDate(start);
            to = formatSqlDate(end);
        }
        if (from > to) {
            return res.status(400).json({ message: '`from` must be on or before `to`' });
        }

        if (!branchIds.length) {
            return res.status(200).json({ from, to, facilities: [], dayTotals: [] });
        }

        const placeholders = branchIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
            `SELECT
                COALESCE(a.branchId, p.registeredBranchId) AS branchId,
                b.branchCode,
                b.branchName,
                DATE_FORMAT(a.appointmentDate, '%Y-%m-%d') AS appointmentDate,
                COUNT(*) AS appointmentCount,
                COUNT(DISTINCT a.patientId) AS patientCount
             FROM appointments a
             LEFT JOIN patients p ON a.patientId = p.patientId
             LEFT JOIN branches b ON b.branchId = COALESCE(a.branchId, p.registeredBranchId)
             WHERE a.appointmentDate BETWEEN ? AND ?
               AND a.status NOT IN ('cancelled', 'no_show')
               AND COALESCE(a.branchId, p.registeredBranchId) IN (${placeholders})
             GROUP BY
                COALESCE(a.branchId, p.registeredBranchId),
                b.branchCode,
                b.branchName,
                DATE_FORMAT(a.appointmentDate, '%Y-%m-%d')
             ORDER BY b.branchName ASC, appointmentDate ASC`,
            [from, to, ...branchIds]
        );

        const byBranch = new Map();
        const dayTotalsMap = new Map();

        for (const row of rows) {
            const bid = Number(row.branchId);
            if (!bid) continue;
            const date = formatSqlDate(row.appointmentDate);
            const appointmentCount = Number(row.appointmentCount) || 0;
            const patientCount = Number(row.patientCount) || 0;

            if (!byBranch.has(bid)) {
                byBranch.set(bid, {
                    branchId: bid,
                    branchCode: row.branchCode || null,
                    branchName: row.branchName || `Facility #${bid}`,
                    days: [],
                    totalAppointments: 0,
                    totalPatients: 0,
                });
            }
            const facility = byBranch.get(bid);
            facility.days.push({ date, appointmentCount, patientCount });
            facility.totalAppointments += appointmentCount;
            facility.totalPatients += patientCount;

            dayTotalsMap.set(date, (dayTotalsMap.get(date) || 0) + appointmentCount);
        }

        // Include accessible facilities with zero bookings in range (stable clinic list)
        for (const branch of accessible) {
            const bid = Number(branch.branchId);
            if (!byBranch.has(bid)) {
                byBranch.set(bid, {
                    branchId: bid,
                    branchCode: branch.branchCode || null,
                    branchName: branch.branchName || `Facility #${bid}`,
                    days: [],
                    totalAppointments: 0,
                    totalPatients: 0,
                });
            }
        }

        const facilities = Array.from(byBranch.values()).sort((a, b) =>
            String(a.branchName).localeCompare(String(b.branchName))
        );
        const dayTotals = Array.from(dayTotalsMap.entries())
            .map(([date, appointmentCount]) => ({ date, appointmentCount }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Attach booking limits (default + date overrides) for accessible facilities
        let limits = [];
        try {
            const [limitRows] = await pool.execute(
                `SELECT limitId, branchId, limitDate, maxAppointments, notes
                 FROM appointment_daily_limits
                 WHERE branchId IN (${placeholders})
                   AND (limitDate IS NULL OR (limitDate BETWEEN ? AND ?))`,
                [...branchIds, from, to]
            );
            limits = limitRows.map((row) => ({
                limitId: row.limitId,
                branchId: Number(row.branchId),
                limitDate: row.limitDate ? formatSqlDate(row.limitDate) : null,
                maxAppointments: Number(row.maxAppointments),
                source: row.limitDate ? 'date' : 'default',
                notes: row.notes || null,
            }));
        } catch (err) {
            if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
        }

        const facilityScoped =
            Boolean(userId) &&
            isNurseLike &&
            !context.canAccessAllBranches &&
            !isAdminRole(roleName) &&
            branchIds.length === 1;

        res.status(200).json({
            from,
            to,
            facilities,
            dayTotals,
            limits,
            facilityScoped,
            canManageLimits: Boolean(userId),
            view: facilityScoped ? 'facility' : 'provider',
        });
    } catch (error) {
        console.error('Error fetching appointment calendar:', error);
        res.status(500).json({ message: 'Error fetching appointment calendar', error: error.message });
    }
});

/**
 * GET /api/appointments/limits?branchId=&date=
 * Returns resolved limit + booked count for a facility/day.
 */
router.get('/limits', async (req, res) => {
    try {
        const userId = getUserId(req);
        const branchId = Number(req.query.branchId) || null;
        const date = formatSqlDate(req.query.date) || formatSqlDate(new Date());
        if (!branchId) {
            return res.status(400).json({ message: 'branchId is required' });
        }
        if (!(await assertUserCanManageBranch(userId, branchId))) {
            return res.status(403).json({ message: 'Not allowed for this facility' });
        }
        const limit = await resolveDailyLimit(branchId, date);
        const booked = await countBookedAppointments(branchId, date);
        const max = limit?.maxAppointments ?? null;
        res.status(200).json({
            branchId,
            date,
            limit,
            booked,
            remaining: max == null ? null : Math.max(0, max - booked),
        });
    } catch (error) {
        console.error('Error fetching appointment limits:', error);
        res.status(500).json({ message: 'Error fetching appointment limits', error: error.message });
    }
});

/**
 * PUT /api/appointments/limits
 * Body: { branchId, maxAppointments, date? }
 * Omit date (or null) to set the facility default daily limit.
 */
router.put('/limits', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const branchId = Number(req.body?.branchId) || null;
        const maxAppointments = Number(req.body?.maxAppointments);
        const rawDate = req.body?.date;
        const limitDate = rawDate === null || rawDate === undefined || rawDate === '' || rawDate === 'default'
            ? null
            : formatSqlDate(rawDate);

        if (!branchId) {
            return res.status(400).json({ message: 'branchId is required' });
        }
        if (!Number.isFinite(maxAppointments) || maxAppointments < 1 || maxAppointments > 10000) {
            return res.status(400).json({ message: 'maxAppointments must be between 1 and 10000' });
        }
        if (limitDate != null && !isValidYmd(limitDate)) {
            return res.status(400).json({ message: 'date must be YYYY-MM-DD or omitted for default' });
        }
        if (!(await assertUserCanManageBranch(userId, branchId))) {
            return res.status(403).json({ message: 'Not allowed to set limits for this facility' });
        }

        // MySQL UNIQUE (branchId, limitDate) treats NULLs as distinct — upsert carefully
        if (limitDate == null) {
            const [existing] = await pool.execute(
                `SELECT limitId FROM appointment_daily_limits
                 WHERE branchId = ? AND limitDate IS NULL LIMIT 1`,
                [branchId]
            );
            if (existing[0]) {
                await pool.execute(
                    `UPDATE appointment_daily_limits
                     SET maxAppointments = ?, setByUserId = ?, updatedAt = NOW()
                     WHERE limitId = ?`,
                    [maxAppointments, userId, existing[0].limitId]
                );
            } else {
                await pool.execute(
                    `INSERT INTO appointment_daily_limits
                      (branchId, limitDate, maxAppointments, setByUserId)
                     VALUES (?, NULL, ?, ?)`,
                    [branchId, maxAppointments, userId]
                );
            }
        } else {
            await pool.execute(
                `INSERT INTO appointment_daily_limits
                  (branchId, limitDate, maxAppointments, setByUserId)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   maxAppointments = VALUES(maxAppointments),
                   setByUserId = VALUES(setByUserId),
                   updatedAt = NOW()`,
                [branchId, limitDate, maxAppointments, userId]
            );
        }

        const limit = await resolveDailyLimit(branchId, limitDate || formatSqlDate(new Date()));
        res.status(200).json({ ok: true, limit });
    } catch (error) {
        if (error?.code === 'ER_NO_SUCH_TABLE') {
            return res.status(503).json({
                message: 'Migration required: run npm run migrate:appointment-limits in api/',
            });
        }
        console.error('Error saving appointment limit:', error);
        res.status(500).json({ message: 'Error saving appointment limit', error: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const { date, status, doctorId, patientId, branchId } = req.query;
        const scope = await resolveFacilityScope(pool, req);
        let query = `
            SELECT a.*, 
                   p.firstName as patientFirstName, p.lastName as patientLastName,
                   p.patientNumber as patientNumber,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName,
                   COALESCE(a.branchId, p.registeredBranchId) AS resolvedBranchId,
                   b.branchCode, b.branchName
            FROM appointments a
            LEFT JOIN patients p ON a.patientId = p.patientId
            LEFT JOIN users u ON a.doctorId = u.userId
            LEFT JOIN branches b ON b.branchId = COALESCE(a.branchId, p.registeredBranchId)
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ` AND a.appointmentDate = ?`;
            params.push(date);
        }
        if (status) {
            query += ` AND a.status = ?`;
            params.push(status);
        }
        if (doctorId) {
            query += ` AND a.doctorId = ?`;
            params.push(doctorId);
        }
        if (patientId) {
            query += ` AND a.patientId = ?`;
            params.push(patientId);
        }

        // Doctor inbox: bookings assigned to this doctor OR left unassigned (any sending facility)
        const forDoctorId = req.query.forDoctorId != null ? Number(req.query.forDoctorId) : null;
        if (forDoctorId) {
            const callerIsDoctor = scope.userId && Number(scope.userId) === forDoctorId;
            if (!callerIsDoctor && !scope.canAccessAllBranches) {
                return res.status(403).json({
                    message: 'You can only view the booking inbox for your own doctor profile.',
                });
            }
            query += ` AND (a.doctorId = ? OR a.doctorId IS NULL)`;
            params.push(forDoctorId);
            // Doctors need cross-facility visibility of patients booked for them
            if (branchId) {
                if (!scope.canAccessAllBranches && !callerIsDoctor && !(await assertUserCanManageBranch(scope.userId, Number(branchId)))) {
                    return res.status(403).json({ message: 'Not allowed for this facility' });
                }
                query += ` AND COALESCE(a.branchId, p.registeredBranchId) = ?`;
                params.push(Number(branchId));
            }
            // skip default facility lock below
        } else if (branchId) {
            if (!scope.canAccessAllBranches && !(await assertUserCanManageBranch(scope.userId, Number(branchId)))) {
                // Providers (doctors/clinicians) may inspect bookings from sending facilities
                const rn = String(scope.roleName || '').toLowerCase();
                const isProviderViewer =
                    isAdminRole(scope.roleName) ||
                    rn === 'doctor' ||
                    rn.includes('telemedicine') ||
                    rn.includes('clinical_officer') ||
                    rn.includes('medical_officer') ||
                    rn.includes('clinician');
                if (!isProviderViewer) {
                    return res.status(403).json({ message: 'Not allowed for this facility' });
                }
            }
            query += ` AND COALESCE(a.branchId, p.registeredBranchId) = ?`;
            params.push(Number(branchId));
        } else if (!forDoctorId && !scope.canAccessAllBranches) {
            const ids = scope.currentBranchId ? [scope.currentBranchId] : scope.branchIds;
            if (!ids.length) {
                return res.status(200).json([]);
            }
            if (ids.length === 1) {
                query += ` AND COALESCE(a.branchId, p.registeredBranchId) = ?`;
                params.push(ids[0]);
            } else {
                const ph = ids.map(() => '?').join(',');
                query += ` AND COALESCE(a.branchId, p.registeredBranchId) IN (${ph})`;
                params.push(...ids);
            }
        }

        query += ` ORDER BY a.appointmentDate ASC, a.appointmentTime ASC`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ message: 'Error fetching appointments', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT a.*, 
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM appointments a
             LEFT JOIN patients p ON a.patientId = p.patientId
             LEFT JOIN users u ON a.doctorId = u.userId
             WHERE a.appointmentId = ?`,
            [req.params.id]
        );
        
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Appointment not found' });
        }
    } catch (error) {
        console.error('Error fetching appointment:', error);
        res.status(500).json({ message: 'Error fetching appointment', error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const appointmentData = req.body;
        const userId = getUserId(req);

        // Ensure all values are properly set (convert undefined to null)
        const patientId = appointmentData.patientId;
        const doctorId = appointmentData.doctorId !== undefined ? appointmentData.doctorId : null;
        const appointmentDate = appointmentData.appointmentDate;
        const appointmentTime = appointmentData.appointmentTime;
        const department = appointmentData.department !== undefined ? appointmentData.department : null;
        const reason = appointmentData.reason !== undefined ? appointmentData.reason : null;
        const status = appointmentData.status || 'scheduled';
        const notes = appointmentData.notes !== undefined ? appointmentData.notes : null;
        const createdBy = userId || null;
        const scope = await resolveFacilityScope(pool, req, { userId, body: appointmentData });
        const branch = await resolveBranchForRequest(pool, req, { body: appointmentData, userId });
        let branchId = appointmentData.branchId != null
            ? Number(appointmentData.branchId) || null
            : (branch?.branchId || null);

        if (!scope.canAccessAllBranches) {
            branchId = scope.currentBranchId || scope.branchIds[0] || branchId;
            if (!branchId || !(await assertUserCanManageBranch(userId, branchId))) {
                return res.status(403).json({
                    message: 'You can only book appointments for your assigned facility.',
                });
            }
        }

        if (patientId) {
            const [patientRows] = await pool.execute(
                `SELECT patientId, registeredBranchId, firstName, lastName
                 FROM patients WHERE patientId = ? AND voided = 0 LIMIT 1`,
                [patientId]
            );
            if (!patientRows[0]) {
                return res.status(400).json({ message: 'Patient not found' });
            }
            if (!patientBelongsToScope(scope, patientRows[0].registeredBranchId)) {
                return res.status(403).json({
                    message:
                        'This patient belongs to another facility. Register or select a patient from your facility.',
                });
            }
            // Keep booking facility aligned with the patient's home facility for facility profiles
            if (!scope.canAccessAllBranches && patientRows[0].registeredBranchId) {
                branchId = Number(patientRows[0].registeredBranchId) || branchId;
            }
        }

        // Enforce facility daily booking limit when configured
        const dateYmd = formatSqlDate(appointmentDate);
        if (branchId && dateYmd && status !== 'cancelled' && status !== 'no_show') {
            const limit = await resolveDailyLimit(branchId, dateYmd);
            if (limit?.maxAppointments != null) {
                const booked = await countBookedAppointments(branchId, dateYmd);
                if (booked >= limit.maxAppointments) {
                    return res.status(409).json({
                        code: 'DAILY_LIMIT_REACHED',
                        message: `Daily booking limit reached for this facility (${booked}/${limit.maxAppointments}).`,
                        currentCount: booked,
                        maxAppointments: limit.maxAppointments,
                        branchId,
                        date: dateYmd,
                    });
                }
            }
        }

        // Soft-block: same patient + service + date/time (override with force: true)
        const force = appointmentData.force === true || appointmentData.force === 'true';
        if (!force && status !== 'cancelled' && status !== 'no_show') {
            const duplicate = await findDuplicateAppointment({
                patientId,
                appointmentDate,
                appointmentTime,
                department,
            });
            if (duplicate) {
                return res.status(409).json(duplicateAppointmentResponse(duplicate));
            }
        }

        let result;
        try {
            ;[result] = await pool.execute(
                `INSERT INTO appointments 
                (patientId, doctorId, appointmentDate, appointmentTime, department, reason, status, notes, createdBy, branchId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    patientId,
                    doctorId,
                    appointmentDate,
                    appointmentTime,
                    department,
                    reason,
                    status,
                    notes,
                    createdBy,
                    branchId
                ]
            );
        } catch (insertErr) {
            // Older DBs without appointments.branchId
            if (insertErr?.code !== 'ER_BAD_FIELD_ERROR') throw insertErr;
            ;[result] = await pool.execute(
                `INSERT INTO appointments 
                (patientId, doctorId, appointmentDate, appointmentTime, department, reason, status, notes, createdBy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    patientId,
                    doctorId,
                    appointmentDate,
                    appointmentTime,
                    department,
                    reason,
                    status,
                    notes,
                    createdBy
                ]
            );
        }

        const [newAppointment] = await pool.execute(
            `SELECT a.*,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM appointments a
             LEFT JOIN users u ON a.doctorId = u.userId
             WHERE a.appointmentId = ?`,
            [result.insertId]
        );

        if (patientId) {
            const docName = [newAppointment[0]?.doctorFirstName, newAppointment[0]?.doctorLastName]
                .filter(Boolean)
                .join(' ');
            notifyAppointmentScheduled(patientId, {
                appointmentDate,
                appointmentTime,
                department,
                doctorName: docName || null,
            });
        }

        res.status(201).json(newAppointment[0]);
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({ message: 'Error creating appointment', error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const body = req.body || {};
        const force = body.force === true || body.force === 'true';
        const appointmentId = req.params.id;

        const [existingRows] = await pool.execute(
            'SELECT * FROM appointments WHERE appointmentId = ? LIMIT 1',
            [appointmentId]
        );
        if (!existingRows[0]) {
            return res.status(404).json({ message: 'Appointment not found' });
        }
        const current = existingRows[0];

        const nextPatientId =
            body.patientId !== undefined ? body.patientId : current.patientId;
        const nextDate =
            body.appointmentDate !== undefined ? body.appointmentDate : current.appointmentDate;
        const nextTime =
            body.appointmentTime !== undefined ? body.appointmentTime : current.appointmentTime;
        const nextDepartment =
            body.department !== undefined ? body.department : current.department;
        const nextStatus = body.status !== undefined ? body.status : current.status;

        if (!force && nextStatus !== 'cancelled' && nextStatus !== 'no_show') {
            const duplicate = await findDuplicateAppointment({
                patientId: nextPatientId,
                appointmentDate: nextDate,
                appointmentTime: nextTime,
                department: nextDepartment,
                excludeAppointmentId: appointmentId,
            });
            if (duplicate) {
                return res.status(409).json(duplicateAppointmentResponse(duplicate));
            }
        }

        const updates = [];
        const values = [];
        const skipKeys = new Set(['appointmentId', 'force']);

        Object.keys(body).forEach((key) => {
            if (body[key] !== undefined && !skipKeys.has(key)) {
                updates.push(`${key} = ?`);
                values.push(body[key]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(appointmentId);

        await pool.execute(
            `UPDATE appointments SET ${updates.join(', ')}, updatedAt = NOW() WHERE appointmentId = ?`,
            values
        );

        const [updated] = await pool.execute(
            'SELECT * FROM appointments WHERE appointmentId = ?',
            [appointmentId]
        );

        if (updated[0]?.patientId) {
            if (
                body.status !== undefined ||
                body.appointmentDate !== undefined ||
                body.appointmentTime !== undefined
            ) {
                notifyAppointmentUpdated(updated[0].patientId, {
                    status: updated[0].status,
                    appointmentDate: updated[0].appointmentDate,
                    appointmentTime: updated[0].appointmentTime,
                });
            }
        }

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({ message: 'Error updating appointment', error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const [result] = await pool.execute(
            'DELETE FROM appointments WHERE appointmentId = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Appointment not found' });
        }

        res.status(200).json({ message: 'Appointment deleted successfully' });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ message: 'Error deleting appointment', error: error.message });
    }
});

module.exports = router;

