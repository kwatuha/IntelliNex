// Inpatient routes - Full CRUD operations
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../config/db');
const { resolveChargeRate } = require('../lib/chargeRateResolver');
const { notifyPatientAdmitted, notifyPatientDischarged } = require('../lib/patientSms');

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';

function buildAdmissionBillLineRef(source, payload = {}) {
    if (source === 'invoice') {
        const invoiceId = payload.invoiceId ?? 'x';
        const itemId = payload.itemId ?? 'x';
        return `invoice:${invoiceId}:item:${itemId}`;
    }
    if (source === 'bed') {
        return `bed:${payload.admissionId ?? 'x'}:${payload.date ?? 'x'}:${payload.quantity ?? 1}`;
    }
    if (source === 'consultant') {
        return `consultant:${payload.admissionId ?? 'x'}:${payload.date ?? 'x'}:${payload.quantity ?? 1}`;
    }
    return `${source || 'other'}:${payload.admissionId ?? 'x'}:${payload.date ?? 'x'}:${payload.description ?? 'x'}`;
}

function toDateOnly(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/**
 * Get current user id from req.user (when auth middleware is on) or from JWT in Authorization header.
 * When auth is disabled, the frontend still sends the token; we decode it here to apply nurse filtering.
 */
function getUserId(req) {
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
    } catch (err) {
        return null;
    }
}

/**
 * If the current user is a Nurse, return their assigned ward IDs; otherwise return null (no restriction).
 */
async function getNurseAssignedWardIds(pool, userId) {
    if (!userId) return null;
    const [userRows] = await pool.execute(
        'SELECT r.roleName FROM users u INNER JOIN roles r ON r.roleId = u.roleId WHERE u.userId = ?',
        [userId]
    );
    if (userRows.length === 0) return null;
    const roleName = (userRows[0].roleName || '').toLowerCase();
    if (!roleName.includes('nurse') || roleName.includes('doctor')) return null;
    const [wardRows] = await pool.execute(
        'SELECT wardId FROM nurse_ward_assignments WHERE nurseUserId = ? AND isActive = 1',
        [userId]
    );
    const wardIds = wardRows.map(r => r.wardId);
    if (wardIds.length === 0) return []; // nurse with no assignments sees no admissions
    return wardIds;
}

async function isBillAdjustmentApprover(pool, userId) {
    if (!userId) return false;
    const [rows] = await pool.execute(
        'SELECT r.roleName FROM users u INNER JOIN roles r ON r.roleId = u.roleId WHERE u.userId = ?',
        [userId]
    );
    if (rows.length === 0) return false;
    const roleName = (rows[0].roleName || '').toLowerCase();
    return (
        roleName.includes('admin') ||
        roleName.includes('finance') ||
        roleName.includes('billing') ||
        roleName.includes('account') ||
        roleName.includes('cashier') ||
        roleName.includes('manager')
    );
}

/**
 * @route GET /api/inpatient/admissions
 * @description Get all admissions. Nurses only see admissions in their assigned wards.
 */
router.get('/admissions', async (req, res) => {
    try {
        const { status, wardId, page = 1, limit = 50, search, patientId } = req.query;
        const offset = (page - 1) * limit;
        const userId = getUserId(req);

        let query = `
            SELECT a.*,
                   pt.firstName, pt.lastName, pt.patientNumber,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName,
                   w.wardName, w.wardType,
                   b.bedNumber, b.bedType
            FROM admissions a
            LEFT JOIN patients pt ON a.patientId = pt.patientId
            LEFT JOIN users u ON a.admittingDoctorId = u.userId
            LEFT JOIN beds b ON a.bedId = b.bedId
            LEFT JOIN wards w ON b.wardId = w.wardId
            WHERE 1=1
        `;
        const params = [];

        const nurseWardIds = await getNurseAssignedWardIds(pool, userId);
        if (Array.isArray(nurseWardIds) && nurseWardIds.length === 0) {
            res.status(200).json([]);
            return;
        }
        if (Array.isArray(nurseWardIds) && nurseWardIds.length > 0) {
            query += ` AND w.wardId IN (${nurseWardIds.map(() => '?').join(',')})`;
            params.push(...nurseWardIds);
        }

        if (status) {
            query += ` AND a.status = ?`;
            params.push(status);
        }

        if (wardId) {
            query += ` AND w.wardId = ?`;
            params.push(wardId);
        }

        if (patientId) {
            query += ` AND a.patientId = ?`;
            params.push(patientId);
        }

        if (search) {
            query += ` AND (a.admissionNumber LIKE ? OR pt.firstName LIKE ? OR pt.lastName LIKE ? OR pt.patientNumber LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY a.admissionDate DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [admissions] = await pool.execute(query, params);

        // Get diagnoses for each admission
        for (const admission of admissions) {
            const [diagnoses] = await pool.execute(
                'SELECT * FROM admission_diagnoses WHERE admissionId = ? ORDER BY diagnosisType, diagnosisId',
                [admission.admissionId]
            );
            admission.diagnoses = diagnoses;
        }

        res.status(200).json(admissions);
    } catch (error) {
        console.error('Error fetching admissions:', error);
        res.status(500).json({ message: 'Error fetching admissions', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/admissions/:id
 * @description Get a single admission
 */
router.get('/admissions/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [admissions] = await pool.execute(
            `SELECT a.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    w.wardName, w.wardType, w.wardId,
                    b.bedNumber, b.bedType, b.bedId
             FROM admissions a
             LEFT JOIN patients pt ON a.patientId = pt.patientId
             LEFT JOIN users u ON a.admittingDoctorId = u.userId
             LEFT JOIN beds b ON a.bedId = b.bedId
             LEFT JOIN wards w ON b.wardId = w.wardId
             WHERE a.admissionId = ?`,
            [id]
        );

        if (admissions.length === 0) {
            return res.status(404).json({ message: 'Admission not found' });
        }

        const admission = admissions[0];

        // Get diagnoses
        const [diagnoses] = await pool.execute(
            'SELECT * FROM admission_diagnoses WHERE admissionId = ? ORDER BY diagnosisType, diagnosisId',
            [id]
        );
        admission.diagnoses = diagnoses;

        res.status(200).json(admission);
    } catch (error) {
        console.error('Error fetching admission:', error);
        res.status(500).json({ message: 'Error fetching admission', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/admissions
 * @description Create a new admission
 */
router.post('/admissions', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { patientId, bedId, admissionDate, admittingDoctorId, admissionDiagnosis, admissionReason, expectedDischargeDate, notes, diagnoses, depositAmount } = req.body;
        const userId = getUserId(req);
        const parsedDepositAmount = depositAmount != null && depositAmount !== ''
            ? parseFloat(depositAmount)
            : 0;
        const needsDeposit = Number.isFinite(parsedDepositAmount) && parsedDepositAmount > 0;
        let depositInvoiceId = null;

        // Generate admission number
        const [count] = await connection.execute('SELECT COUNT(*) as count FROM admissions');
        const admissionNumber = `IP-${String(count[0].count + 1).padStart(6, '0')}`;

        // If deposit is required, create deposit invoice to track payment status.
        if (needsDeposit) {
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const datePrefix = `INV-${today}-`;
            const [maxResult] = await connection.execute(
                `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                 FROM invoices
                 WHERE invoiceNumber LIKE CONCAT(?, '%')`,
                [datePrefix]
            );
            let nextNum = (maxResult[0]?.maxNum || 0) + 1;
            let invoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;

            // Avoid duplicate invoice numbers in concurrent admissions
            let attempts = 0;
            while (attempts < 100) {
                const [existingInv] = await connection.execute(
                    'SELECT invoiceId FROM invoices WHERE invoiceNumber = ?',
                    [invoiceNumber]
                );
                if (existingInv.length === 0) break;
                nextNum++;
                invoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;
                attempts++;
            }

            const [invResult] = await connection.execute(
                `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, totalAmount, balance, status, notes, createdBy)
                 VALUES (?, ?, CURDATE(), ?, ?, 'pending', ?, ?)`,
                [
                    invoiceNumber,
                    patientId,
                    parsedDepositAmount,
                    parsedDepositAmount,
                    `Admission deposit - ${admissionNumber}`,
                    userId || null
                ]
            );
            depositInvoiceId = invResult.insertId;

            await connection.execute(
                `INSERT INTO invoice_items (invoiceId, description, quantity, unitPrice, totalPrice)
                 VALUES (?, ?, 1, ?, ?)`,
                [
                    depositInvoiceId,
                    `Admission deposit (${admissionNumber})`,
                    parsedDepositAmount,
                    parsedDepositAmount
                ]
            );
        }

        // Insert admission
        const [result] = await connection.execute(
            `INSERT INTO admissions (admissionNumber, patientId, bedId, admissionDate, admittingDoctorId, admissionDiagnosis, admissionReason, expectedDischargeDate, depositAmount, depositInvoiceId, depositRequired, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted')`,
            [
                admissionNumber,
                patientId,
                bedId,
                admissionDate || new Date(),
                admittingDoctorId,
                admissionDiagnosis || null,
                admissionReason || null,
                expectedDischargeDate || null,
                needsDeposit ? parsedDepositAmount : null,
                depositInvoiceId,
                needsDeposit ? 1 : 0,
                notes || null
            ]
        );

        const admissionId = result.insertId;

        // Insert diagnoses if provided
        if (diagnoses && Array.isArray(diagnoses) && diagnoses.length > 0) {
            for (const diagnosis of diagnoses) {
                await connection.execute(
                    `INSERT INTO admission_diagnoses (admissionId, diagnosisCode, diagnosisDescription, diagnosisType)
                     VALUES (?, ?, ?, ?)`,
                    [admissionId, diagnosis.diagnosisCode || null, diagnosis.diagnosisDescription, diagnosis.diagnosisType || 'primary']
                );
            }
        }

        // Update bed status to occupied
        await connection.execute(
            'UPDATE beds SET status = ? WHERE bedId = ?',
            ['occupied', bedId]
        );

        // Queue patient at cashier for deposit payment (same pattern as triage/lab/pharmacy)
        if (needsDeposit && depositInvoiceId) {
            try {
                const [existingCashier] = await connection.execute(
                    `SELECT queueId FROM queue_entries
                     WHERE patientId = ? AND servicePoint = 'cashier'
                       AND status IN ('waiting', 'called', 'serving')`,
                    [patientId]
                );
                if (existingCashier.length === 0) {
                    const [cashierCount] = await connection.execute(
                        'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "cashier"'
                    );
                    const ticketNum = (cashierCount[0]?.count || 0) + 1;
                    const cashierTicketNumber = `C-${String(ticketNum).padStart(3, '0')}`;
                    await connection.execute(
                        `INSERT INTO queue_entries
                         (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                         VALUES (?, ?, 'cashier', 'normal', 'waiting', ?, ?)`,
                        [
                            patientId,
                            cashierTicketNumber,
                            `Admission deposit payment - ${admissionNumber} (invoice pending)`,
                            userId || null
                        ]
                    );
                }
            } catch (queueErr) {
                console.error('[ADMISSION] Failed to add cashier queue for deposit:', queueErr.message);
                // Do not fail admission if queue insert fails
            }
        }

        await connection.commit();

        // Fetch created admission
        const [newAdmission] = await connection.execute(
            `SELECT a.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    w.wardName, w.wardType,
                    b.bedNumber, b.bedType
             FROM admissions a
             LEFT JOIN patients pt ON a.patientId = pt.patientId
             LEFT JOIN users u ON a.admittingDoctorId = u.userId
             LEFT JOIN beds b ON a.bedId = b.bedId
             LEFT JOIN wards w ON b.wardId = w.wardId
             WHERE a.admissionId = ?`,
            [admissionId]
        );

        if (newAdmission[0]?.patientId) {
            notifyPatientAdmitted(newAdmission[0].patientId, {
                wardName: newAdmission[0].wardName,
                bedNumber: newAdmission[0].bedNumber,
                admissionNumber: newAdmission[0].admissionNumber,
            });
        }

        res.status(201).json(newAdmission[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating admission:', error);
        res.status(500).json({ message: 'Error creating admission', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/inpatient/admissions/:id
 * @description Update an admission
 */
router.put('/admissions/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { bedId, admissionDiagnosis, admissionReason, expectedDischargeDate, dischargeDate, notes, status, diagnoses, transferReason, depositAmount } = req.body;
        const userId = getUserId(req);

        // Check if admission exists
        const [existing] = await connection.execute(
            'SELECT bedId, status, admittingDoctorId, patientId, admissionNumber FROM admissions WHERE admissionId = ?',
            [id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Admission not found' });
        }

        const oldBedId = existing[0].bedId;
        const oldStatus = existing[0].status;

        // Build update query
        const updates = [];
        const values = [];

        if (bedId !== undefined && bedId !== oldBedId) {
            updates.push('bedId = ?');
            values.push(bedId);
        }

        if (admissionDiagnosis !== undefined) {
            updates.push('admissionDiagnosis = ?');
            values.push(admissionDiagnosis || null);
        }

        if (admissionReason !== undefined) {
            updates.push('admissionReason = ?');
            values.push(admissionReason || null);
        }

        if (expectedDischargeDate !== undefined) {
            updates.push('expectedDischargeDate = ?');
            values.push(expectedDischargeDate || null);
        }

        if (depositAmount !== undefined) {
            const parsedDeposit = depositAmount != null && depositAmount !== '' ? parseFloat(depositAmount) : null;
            updates.push('depositAmount = ?');
            values.push(Number.isFinite(parsedDeposit) ? parsedDeposit : null);
            updates.push('depositRequired = ?');
            values.push(Number.isFinite(parsedDeposit) && parsedDeposit > 0 ? 1 : 0);
        }

        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes || null);
        }

        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }

        // When discharging, set dischargeDate (use provided or now)
        if (status === 'discharged') {
            const d = dischargeDate ? new Date(dischargeDate) : new Date();
            const dischargeDateVal = d.toISOString().slice(0, 19).replace('T', ' ');
            updates.push('dischargeDate = ?');
            values.push(dischargeDateVal);
        }

        if (updates.length > 0) {
            updates.push('updatedAt = NOW()');
            values.push(id);
            await connection.execute(
                `UPDATE admissions SET ${updates.join(', ')} WHERE admissionId = ?`,
                values
            );
        }

        // When status becomes discharged: free the current bed
        if (status === 'discharged' && oldStatus === 'admitted') {
            await connection.execute(
                'UPDATE beds SET status = ? WHERE bedId = ?',
                ['available', oldBedId]
            );
        }

        // Update bed statuses if bed changed (transfer)
        if (bedId !== undefined && bedId !== oldBedId) {
            // Free old bed
            await connection.execute(
                'UPDATE beds SET status = ? WHERE bedId = ?',
                ['available', oldBedId]
            );
            // Occupy new bed
            await connection.execute(
                'UPDATE beds SET status = ? WHERE bedId = ?',
                ['occupied', bedId]
            );
            // Record ward transfer if table exists and we have a user
            try {
                const [oldBedRows] = await connection.execute('SELECT wardId FROM beds WHERE bedId = ?', [oldBedId]);
                const [newBedRows] = await connection.execute('SELECT wardId FROM beds WHERE bedId = ?', [bedId]);
                const fromWardId = oldBedRows[0]?.wardId;
                const toWardId = newBedRows[0]?.wardId;
                const transferredBy = userId ?? existing[0].admittingDoctorId;
                if (fromWardId != null && toWardId != null && transferredBy != null) {
                    await connection.execute(
                        `INSERT INTO ward_transfers (admissionId, fromWardId, toWardId, fromBedId, toBedId, transferDate, transferReason, transferredBy)
                         VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
                        [id, fromWardId, toWardId, oldBedId, bedId, transferReason || null, transferredBy]
                    );
                }
            } catch (err) {
                console.warn('ward_transfers insert skipped:', err.message);
            }
        }

        // Update diagnoses if provided
        if (diagnoses !== undefined) {
            // Delete existing diagnoses
            await connection.execute(
                'DELETE FROM admission_diagnoses WHERE admissionId = ?',
                [id]
            );

            // Insert new diagnoses
            if (Array.isArray(diagnoses) && diagnoses.length > 0) {
                for (const diagnosis of diagnoses) {
                    await connection.execute(
                        `INSERT INTO admission_diagnoses (admissionId, diagnosisCode, diagnosisDescription, diagnosisType)
                         VALUES (?, ?, ?, ?)`,
                        [id, diagnosis.diagnosisCode || null, diagnosis.diagnosisDescription, diagnosis.diagnosisType || 'primary']
                    );
                }
            }
        }

        await connection.commit();

        // Fetch updated admission
        const [updated] = await connection.execute(
            `SELECT a.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    w.wardName, w.wardType,
                    b.bedNumber, b.bedType
             FROM admissions a
             LEFT JOIN patients pt ON a.patientId = pt.patientId
             LEFT JOIN users u ON a.admittingDoctorId = u.userId
             LEFT JOIN beds b ON a.bedId = b.bedId
             LEFT JOIN wards w ON b.wardId = w.wardId
             WHERE a.admissionId = ?`,
            [id]
        );

        if (
            status === 'discharged' &&
            oldStatus !== 'discharged' &&
            (updated[0]?.patientId || existing[0].patientId)
        ) {
            notifyPatientDischarged(updated[0]?.patientId || existing[0].patientId, {
                admissionNumber: updated[0]?.admissionNumber || existing[0].admissionNumber,
                wardName: updated[0]?.wardName,
            });
        }

        res.status(200).json(updated[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error updating admission:', error);
        res.status(500).json({ message: 'Error updating admission', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route DELETE /api/inpatient/admissions/:id
 * @description Delete (cancel) an admission
 */
router.delete('/admissions/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Get admission details
        const [admission] = await connection.execute(
            'SELECT bedId, status FROM admissions WHERE admissionId = ?',
            [id]
        );

        if (admission.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Admission not found' });
        }

        // Update admission status to cancelled
        await connection.execute(
            'UPDATE admissions SET status = ?, updatedAt = NOW() WHERE admissionId = ?',
            ['cancelled', id]
        );

        // Free the bed if admission was active
        if (admission[0].status === 'admitted') {
            await connection.execute(
                'UPDATE beds SET status = ? WHERE bedId = ?',
                ['available', admission[0].bedId]
            );
        }

        await connection.commit();

        res.status(200).json({ message: 'Admission cancelled successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error cancelling admission:', error);
        res.status(500).json({ message: 'Error cancelling admission', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route GET /api/inpatient/beds
 * @description Get all beds
 */
router.get('/beds', async (req, res) => {
    try {
        const { wardId, status, page = 1, limit = 100 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT b.*,
                   w.wardName, w.wardType,
                   a.admissionId, a.admissionNumber, a.admissionDate,
                   pt.firstName, pt.lastName, pt.patientNumber
            FROM beds b
            LEFT JOIN wards w ON b.wardId = w.wardId
            LEFT JOIN admissions a ON b.bedId = a.bedId AND a.status = 'admitted'
            LEFT JOIN patients pt ON a.patientId = pt.patientId
            WHERE b.isActive = 1
        `;
        const params = [];

        if (wardId) {
            query += ` AND b.wardId = ?`;
            params.push(wardId);
        }

        if (status) {
            query += ` AND b.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY w.wardName, b.bedNumber LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [beds] = await pool.execute(query, params);

        res.status(200).json(beds);
    } catch (error) {
        console.error('Error fetching beds:', error);
        res.status(500).json({ message: 'Error fetching beds', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/beds/:id
 * @description Get a single bed
 */
router.get('/beds/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [beds] = await pool.execute(
            `SELECT b.*,
                   w.wardName, w.wardType,
                   a.admissionId, a.admissionNumber, a.admissionDate,
                   pt.firstName, pt.lastName, pt.patientNumber
            FROM beds b
            LEFT JOIN wards w ON b.wardId = w.wardId
            LEFT JOIN admissions a ON b.bedId = a.bedId AND a.status = 'admitted'
            LEFT JOIN patients pt ON a.patientId = pt.patientId
            WHERE b.bedId = ? AND b.isActive = 1`,
            [id]
        );

        if (beds.length === 0) {
            return res.status(404).json({ message: 'Bed not found' });
        }

        res.status(200).json(beds[0]);
    } catch (error) {
        console.error('Error fetching bed:', error);
        res.status(500).json({ message: 'Error fetching bed', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/beds
 * @description Create a new bed
 */
router.post('/beds', async (req, res) => {
    try {
        const { bedNumber, wardId, bedType, status, notes } = req.body;

        if (!bedNumber) {
            return res.status(400).json({ message: 'Bed number is required' });
        }

        // Check if ward exists (if provided)
        if (wardId) {
            const [wardCheck] = await pool.execute(
                'SELECT wardId FROM wards WHERE wardId = ? AND isActive = 1',
                [wardId]
            );
            if (wardCheck.length === 0) {
                return res.status(400).json({ message: 'Ward not found' });
            }
        }

        // Check if bed number already exists in the same ward (if ward is provided)
        if (wardId) {
            const [existingBed] = await pool.execute(
                'SELECT bedId FROM beds WHERE bedNumber = ? AND wardId = ? AND isActive = 1',
                [bedNumber, wardId]
            );
            if (existingBed.length > 0) {
                return res.status(400).json({ message: 'Bed number already exists in this ward' });
            }
        }

        const [result] = await pool.execute(
            `INSERT INTO beds (bedNumber, wardId, bedType, status, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [
                bedNumber,
                wardId || null,
                bedType || 'general',
                status || 'available',
                notes || null
            ]
        );

        // Fetch created bed
        const [newBed] = await pool.execute(
            `SELECT b.*,
                   w.wardName, w.wardType,
                   a.admissionId, a.admissionNumber, a.admissionDate,
                   pt.firstName, pt.lastName, pt.patientNumber
            FROM beds b
            LEFT JOIN wards w ON b.wardId = w.wardId
            LEFT JOIN admissions a ON b.bedId = a.bedId AND a.status = 'admitted'
            LEFT JOIN patients pt ON a.patientId = pt.patientId
            WHERE b.bedId = ?`,
            [result.insertId]
        );

        res.status(201).json(newBed[0]);
    } catch (error) {
        console.error('Error creating bed:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Bed number already exists' });
        }
        res.status(500).json({ message: 'Error creating bed', error: error.message });
    }
});

/**
 * @route PUT /api/inpatient/beds/:id
 * @description Update a bed
 */
router.put('/beds/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { bedNumber, wardId, bedType, status, notes } = req.body;

        // Check if bed exists
        const [existing] = await pool.execute(
            'SELECT bedId, status FROM beds WHERE bedId = ? AND isActive = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Bed not found' });
        }

        // Check if bed is occupied and trying to change status to available
        if (existing[0].status === 'occupied' && status === 'available') {
            // Check if there's an active admission
            const [admission] = await pool.execute(
                'SELECT admissionId FROM admissions WHERE bedId = ? AND status = ?',
                [id, 'admitted']
            );
            if (admission.length > 0) {
                return res.status(400).json({ message: 'Cannot set bed to available while it has an active admission' });
            }
        }

        // Build update query
        const updates = [];
        const values = [];

        if (bedNumber !== undefined) {
            updates.push('bedNumber = ?');
            values.push(bedNumber);
        }

        if (wardId !== undefined) {
            updates.push('wardId = ?');
            values.push(wardId);
        }

        if (bedType !== undefined) {
            updates.push('bedType = ?');
            values.push(bedType);
        }

        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }

        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        updates.push('updatedAt = NOW()');
        values.push(id);

        await pool.execute(
            `UPDATE beds SET ${updates.join(', ')} WHERE bedId = ?`,
            values
        );

        // Fetch updated bed
        const [updated] = await pool.execute(
            `SELECT b.*,
                   w.wardName, w.wardType,
                   a.admissionId, a.admissionNumber, a.admissionDate,
                   pt.firstName, pt.lastName, pt.patientNumber
            FROM beds b
            LEFT JOIN wards w ON b.wardId = w.wardId
            LEFT JOIN admissions a ON b.bedId = a.bedId AND a.status = 'admitted'
            LEFT JOIN patients pt ON a.patientId = pt.patientId
            WHERE b.bedId = ?`,
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating bed:', error);
        res.status(500).json({ message: 'Error updating bed', error: error.message });
    }
});

/**
 * @route DELETE /api/inpatient/beds/:id
 * @description Delete (soft delete) a bed
 */
router.delete('/beds/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if bed exists
        const [existing] = await pool.execute(
            'SELECT bedId, status FROM beds WHERE bedId = ? AND isActive = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Bed not found' });
        }

        // Check if bed is occupied
        if (existing[0].status === 'occupied') {
            const [admission] = await pool.execute(
                'SELECT admissionId FROM admissions WHERE bedId = ? AND status = ?',
                [id, 'admitted']
            );
            if (admission.length > 0) {
                return res.status(400).json({ message: 'Cannot delete bed while it has an active admission' });
            }
        }

        // Soft delete the bed
        await pool.execute(
            'UPDATE beds SET isActive = 0, updatedAt = NOW() WHERE bedId = ?',
            [id]
        );

        res.status(200).json({ message: 'Bed deleted successfully', bedId: id });
    } catch (error) {
        console.error('Error deleting bed:', error);
        res.status(500).json({ message: 'Error deleting bed', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/wards
 * @description Get all wards with patient counts
 */
router.get('/wards', async (req, res) => {
    try {
        const { wardType, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT w.*,
                   COUNT(DISTINCT CASE WHEN a.status = 'admitted' THEN a.admissionId END) as admittedPatients,
                   COUNT(DISTINCT b.bedId) as totalBeds,
                   COUNT(DISTINCT CASE WHEN b.status = 'occupied' THEN b.bedId END) as occupiedBeds,
                   COUNT(DISTINCT CASE WHEN b.status = 'available' THEN b.bedId END) as availableBeds
            FROM wards w
            LEFT JOIN beds b ON w.wardId = b.wardId AND b.isActive = 1
            LEFT JOIN admissions a ON b.bedId = a.bedId
            WHERE w.isActive = 1
        `;
        const params = [];

        if (wardType) {
            query += ` AND w.wardType = ?`;
            params.push(wardType);
        }

        query += ` GROUP BY w.wardId ORDER BY w.wardName LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);

        // Ensure unique wards by wardId (in case GROUP BY yields duplicates in some MySQL configs)
        const seen = new Set();
        const wards = rows.filter((w) => {
            if (seen.has(w.wardId)) return false;
            seen.add(w.wardId);
            return true;
        });

        res.status(200).json(wards);
    } catch (error) {
        console.error('Error fetching wards:', error);
        res.status(500).json({ message: 'Error fetching wards', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/wards/:id
 * @description Get a single ward
 */
router.get('/wards/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [wards] = await pool.execute(
            'SELECT * FROM wards WHERE wardId = ? AND isActive = 1',
            [id]
        );

        if (wards.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        res.status(200).json(wards[0]);
    } catch (error) {
        console.error('Error fetching ward:', error);
        res.status(500).json({ message: 'Error fetching ward', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/wards
 * @description Create a new ward
 */
router.post('/wards', async (req, res) => {
    try {
        let { wardCode, wardName, wardType, capacity, location, description } = req.body;

        if (!wardName || !capacity) {
            return res.status(400).json({ message: 'Ward name and capacity are required' });
        }

        // Auto-generate ward code if blank
        if (!wardCode || wardCode.trim() === '') {
            // Generate ward code based on ward name and type
            // Format: First 3 letters of ward name + first letter of type + sequential number
            const namePrefix = wardName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
            const typePrefix = wardType ? wardType.substring(0, 1).toUpperCase() : 'G';

            // Find the next available number for this prefix
            const [existingCodes] = await pool.execute(
                `SELECT wardCode FROM wards
                 WHERE wardCode LIKE ? AND wardCode REGEXP '^[A-Z]{3}[A-Z]-[0-9]+$'
                 ORDER BY CAST(SUBSTRING(wardCode, LOCATE('-', wardCode) + 1) AS UNSIGNED) DESC
                 LIMIT 1`,
                [`${namePrefix}${typePrefix}-%`]
            );

            let nextNum = 1;
            if (existingCodes.length > 0) {
                const lastCode = existingCodes[0].wardCode;
                const lastNum = parseInt(lastCode.split('-')[1]) || 0;
                nextNum = lastNum + 1;
            }

            wardCode = `${namePrefix}${typePrefix}-${String(nextNum).padStart(3, '0')}`;
        }

        // Check if generated code already exists (safety check)
        const [duplicateCheck] = await pool.execute(
            'SELECT wardId FROM wards WHERE wardCode = ? AND isActive = 1',
            [wardCode]
        );
        if (duplicateCheck.length > 0) {
            // If duplicate found, append a suffix
            let suffix = 1;
            let finalCode = wardCode;
            while (true) {
                const [check] = await pool.execute(
                    'SELECT wardId FROM wards WHERE wardCode = ? AND isActive = 1',
                    [finalCode]
                );
                if (check.length === 0) break;
                finalCode = `${wardCode}-${suffix}`;
                suffix++;
                if (suffix > 999) {
                    return res.status(500).json({ message: 'Failed to generate unique ward code' });
                }
            }
            wardCode = finalCode;
        }

        const [result] = await pool.execute(
            `INSERT INTO wards (wardCode, wardName, wardType, capacity, location, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                wardCode,
                wardName,
                wardType || null,
                capacity,
                location || null,
                description || null
            ]
        );

        const [newWard] = await pool.execute(
            'SELECT * FROM wards WHERE wardId = ?',
            [result.insertId]
        );

        res.status(201).json(newWard[0]);
    } catch (error) {
        console.error('Error creating ward:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Ward code already exists' });
        }
        res.status(500).json({ message: 'Error creating ward', error: error.message });
    }
});

/**
 * @route PUT /api/inpatient/wards/:id
 * @description Update a ward
 */
router.put('/wards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { wardCode, wardName, wardType, capacity, location, description } = req.body;

        // Check if ward exists
        const [existing] = await pool.execute(
            'SELECT wardId, wardCode FROM wards WHERE wardId = ? AND isActive = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        // Auto-generate ward code if blank or being cleared
        let finalWardCode = wardCode;
        const currentWard = existing[0];

        if (wardCode === undefined || wardCode === null || wardCode === '' || (typeof wardCode === 'string' && wardCode.trim() === '')) {
            // Only generate if currently null/empty
            if (!currentWard.wardCode || currentWard.wardCode.trim() === '') {
                // Get current ward name and type (use updated values if provided)
                const [currentWardData] = await pool.execute(
                    'SELECT wardName, wardType FROM wards WHERE wardId = ?',
                    [id]
                );
                const wardNameValue = wardName !== undefined ? wardName : currentWardData[0].wardName;
                const wardTypeValue = wardType !== undefined ? wardType : currentWardData[0].wardType;

                // Generate ward code based on ward name and type
                const namePrefix = wardNameValue.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
                const typePrefix = wardTypeValue ? wardTypeValue.substring(0, 1).toUpperCase() : 'G';

                // Find the next available number for this prefix
                const [existingCodes] = await pool.execute(
                    `SELECT wardCode FROM wards
                     WHERE wardCode LIKE ? AND wardCode REGEXP '^[A-Z]{3}[A-Z]-[0-9]+$'
                     ORDER BY CAST(SUBSTRING(wardCode, LOCATE('-', wardCode) + 1) AS UNSIGNED) DESC
                     LIMIT 1`,
                    [`${namePrefix}${typePrefix}-%`]
                );

                let nextNum = 1;
                if (existingCodes.length > 0) {
                    const lastCode = existingCodes[0].wardCode;
                    const lastNum = parseInt(lastCode.split('-')[1]) || 0;
                    nextNum = lastNum + 1;
                }

                finalWardCode = `${namePrefix}${typePrefix}-${String(nextNum).padStart(3, '0')}`;

                // Check if generated code already exists (safety check)
                const [duplicateCheck] = await pool.execute(
                    'SELECT wardId FROM wards WHERE wardCode = ? AND wardId != ? AND isActive = 1',
                    [finalWardCode, id]
                );
                if (duplicateCheck.length > 0) {
                    // If duplicate found, append a suffix
                    let suffix = 1;
                    let tempCode = finalWardCode;
                    while (true) {
                        const [check] = await pool.execute(
                            'SELECT wardId FROM wards WHERE wardCode = ? AND wardId != ? AND isActive = 1',
                            [tempCode, id]
                        );
                        if (check.length === 0) break;
                        tempCode = `${finalWardCode}-${suffix}`;
                        suffix++;
                        if (suffix > 999) {
                            return res.status(500).json({ message: 'Failed to generate unique ward code' });
                        }
                    }
                    finalWardCode = tempCode;
                }
            } else {
                // Keep existing code if not being changed
                finalWardCode = currentWard.wardCode;
            }
        } else {
            // If wardCode is being updated, check if it already exists in another ward
            const currentWardCode = currentWard.wardCode;
            // Only check for duplicates if the code is actually changing
            if (wardCode !== currentWardCode) {
                const [duplicateCheck] = await pool.execute(
                    'SELECT wardId FROM wards WHERE wardCode = ? AND wardId != ? AND isActive = 1',
                    [wardCode, id]
                );
                if (duplicateCheck.length > 0) {
                    return res.status(400).json({ message: 'Ward code already exists' });
                }
            }
        }

        // Build update query
        const updates = [];
        const values = [];

        if (wardCode !== undefined) {
            updates.push('wardCode = ?');
            values.push(finalWardCode || null);
        }

        if (wardName !== undefined) {
            updates.push('wardName = ?');
            values.push(wardName);
        }

        if (wardType !== undefined) {
            updates.push('wardType = ?');
            values.push(wardType || null);
        }

        if (capacity !== undefined) {
            updates.push('capacity = ?');
            values.push(capacity);
        }

        if (location !== undefined) {
            updates.push('location = ?');
            values.push(location || null);
        }

        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        updates.push('updatedAt = NOW()');
        values.push(id);

        await pool.execute(
            `UPDATE wards SET ${updates.join(', ')} WHERE wardId = ?`,
            values
        );

        // Fetch updated ward
        const [updated] = await pool.execute(
            'SELECT * FROM wards WHERE wardId = ?',
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating ward:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Ward code already exists' });
        }
        res.status(500).json({ message: 'Error updating ward', error: error.message });
    }
});

/**
 * @route DELETE /api/inpatient/wards/:id
 * @description Delete (soft delete) a ward
 */
router.delete('/wards/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if ward exists
        const [existing] = await pool.execute(
            'SELECT wardId FROM wards WHERE wardId = ? AND isActive = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        // Check if ward has active beds
        const [beds] = await pool.execute(
            'SELECT COUNT(*) as count FROM beds WHERE wardId = ? AND isActive = 1',
            [id]
        );

        if (beds[0].count > 0) {
            return res.status(400).json({ message: 'Cannot delete ward that has active beds' });
        }

        // Soft delete the ward
        await pool.execute(
            'UPDATE wards SET isActive = 0, updatedAt = NOW() WHERE wardId = ?',
            [id]
        );

        res.status(200).json({ message: 'Ward deleted successfully', wardId: id });
    } catch (error) {
        console.error('Error deleting ward:', error);
        res.status(500).json({ message: 'Error deleting ward', error: error.message });
    }
});

// ============================================
// INPATIENT MANAGEMENT ROUTES
// ============================================

/**
 * @route GET /api/inpatient/admissions/:id/overview
 * @description Get comprehensive overview of an admission (reviews, nursing, vitals, procedures, labs)
 */
router.get('/admissions/:id/overview', async (req, res) => {
    try {
        const { id } = req.params;

        // Get admission details
        const [admissions] = await pool.execute(
            `SELECT a.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    w.wardName, w.wardType, w.wardId,
                    b.bedNumber, b.bedType, b.bedId
             FROM admissions a
             LEFT JOIN patients pt ON a.patientId = pt.patientId
             LEFT JOIN users u ON a.admittingDoctorId = u.userId
             LEFT JOIN beds b ON a.bedId = b.bedId
             LEFT JOIN wards w ON b.wardId = w.wardId
             WHERE a.admissionId = ?`,
            [id]
        );

        if (admissions.length === 0) {
            return res.status(404).json({ message: 'Admission not found' });
        }

        const admission = admissions[0];

        // Get doctor reviews
        const [reviews] = await pool.execute(
            `SELECT r.*,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM inpatient_doctor_reviews r
             LEFT JOIN users u ON r.reviewingDoctorId = u.userId
             WHERE r.admissionId = ?
             ORDER BY r.reviewDate DESC`,
            [id]
        );

        // Get nursing care notes
        const [nursingCare] = await pool.execute(
            `SELECT n.*,
                    u.firstName as nurseFirstName, u.lastName as nurseLastName
             FROM inpatient_nursing_care n
             LEFT JOIN users u ON n.nurseId = u.userId
             WHERE n.admissionId = ?
             ORDER BY n.careDate DESC`,
            [id]
        );

        // Get vital signs
        const [vitals] = await pool.execute(
            `SELECT vs.*,
                    u.firstName as recordedByFirstName, u.lastName as recordedByLastName
             FROM vital_signs vs
             LEFT JOIN users u ON vs.recordedBy = u.userId
             WHERE vs.admissionId = ?
             ORDER BY vs.recordedDate DESC`,
            [id]
        );

        // Get vitals schedule
        const [vitalsSchedule] = await pool.execute(
            `SELECT * FROM inpatient_vitals_schedule
             WHERE admissionId = ? AND isActive = 1
             ORDER BY scheduleDate DESC
             LIMIT 1`,
            [id]
        );

        // Get procedures
        const [procedures] = await pool.execute(
            `SELECT pp.*,
                    u.firstName as performedByFirstName, u.lastName as performedByLastName
             FROM patient_procedures pp
             LEFT JOIN users u ON pp.performedBy = u.userId
             WHERE pp.admissionId = ?
             ORDER BY pp.procedureDate DESC`,
            [id]
        );

        // Get lab orders with test names
        const [labOrdersRaw] = await pool.execute(
            `SELECT lo.*,
                    u.firstName as orderedByFirstName, u.lastName as orderedByLastName
             FROM lab_test_orders lo
             LEFT JOIN users u ON lo.orderedBy = u.userId
             WHERE lo.admissionId = ?
             ORDER BY lo.orderDate DESC`,
            [id]
        );

        // Get lab order items with test names for each order
        const labOrders = await Promise.all(labOrdersRaw.map(async (order) => {
            const [items] = await pool.execute(
                `SELECT loi.*, ltt.testName, ltt.testCode
                 FROM lab_test_order_items loi
                 LEFT JOIN lab_test_types ltt ON loi.testTypeId = ltt.testTypeId
                 WHERE loi.orderId = ?
                 ORDER BY loi.itemId`,
                [order.orderId]
            );
            // For display, use the first test name or join all if multiple
            const testNames = items.map((item) => item.testName).filter(Boolean);
            return {
                ...order,
                items: items || [],
                testName: testNames.length > 0 ? testNames.join(', ') : null
            };
        }));

        // Get radiology orders with exam type names for this admission
        // Try to filter by admissionId first (if column exists), otherwise fall back to patientId and date range
        let radiologyOrders;
        try {
            // Try query with admissionId (preferred method)
            [radiologyOrders] = await pool.execute(
                `SELECT ro.*,
                        u.firstName as orderedByFirstName, u.lastName as orderedByLastName,
                        ret.examName, ret.examCode, ret.category
                 FROM radiology_exam_orders ro
                 LEFT JOIN users u ON ro.orderedBy = u.userId
                 LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
                 WHERE ro.admissionId = ?
                 ORDER BY ro.orderDate DESC`,
                [id]
            );
        } catch (error) {
            // If admissionId column doesn't exist, fall back to patientId and date range
            if (error.code === 'ER_BAD_FIELD_ERROR' || error.errno === 1054) {
                const admissionDate = admission?.admissionDate;
                const dischargeDate = admission?.dischargeDate || new Date().toISOString().split('T')[0];
                [radiologyOrders] = await pool.execute(
                    `SELECT ro.*,
                            u.firstName as orderedByFirstName, u.lastName as orderedByLastName,
                            ret.examName, ret.examCode, ret.category
                     FROM radiology_exam_orders ro
                     LEFT JOIN users u ON ro.orderedBy = u.userId
                     LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
                     WHERE ro.patientId = ? AND ro.orderDate >= ? AND ro.orderDate <= ?
                     ORDER BY ro.orderDate DESC`,
                    [admission.patientId, admissionDate, dischargeDate]
                );
            } else {
                throw error; // Re-throw if it's a different error
            }
        }

        // Get prescriptions with medication items
        const [prescriptionsRaw] = await pool.execute(
            `SELECT p.*,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM prescriptions p
             LEFT JOIN users u ON p.doctorId = u.userId
             WHERE p.admissionId = ?
             ORDER BY p.prescriptionDate DESC`,
            [id]
        );

        // Get prescription items and nurse pickup info (when status = picked_up) for each prescription
        const prescriptions = await Promise.all(prescriptionsRaw.map(async (prescription) => {
            const [items] = await pool.execute(
                `SELECT pi.*, m.name as medicationNameFromCatalog
                 FROM prescription_items pi
                 LEFT JOIN medications m ON pi.medicationId = m.medicationId
                 WHERE pi.prescriptionId = ?
                 ORDER BY pi.itemId`,
                [prescription.prescriptionId]
            );
            const medicationNames = items.map((item) =>
                item.medicationNameFromCatalog || item.medicationName
            ).filter(Boolean);

            let pickupInfo = null;
            const [pickupRows] = await pool.execute(
                `SELECT np.pickupId, np.pickupDate, np.status as pickupStatus,
                        nurse.firstName as nurseFirstName, nurse.lastName as nurseLastName,
                        ph.firstName as pharmacistFirstName, ph.lastName as pharmacistLastName
                 FROM nurse_pickups np
                 LEFT JOIN users nurse ON np.pickedUpBy = nurse.userId
                 LEFT JOIN users ph ON np.recordedPickupBy = ph.userId
                 WHERE np.prescriptionId = ? AND np.status = 'picked_up'
                 ORDER BY np.pickupDate DESC LIMIT 1`,
                [prescription.prescriptionId]
            );
            if (pickupRows.length > 0) {
                const r = pickupRows[0];
                pickupInfo = {
                    pickupDate: r.pickupDate,
                    nurseName: [r.nurseFirstName, r.nurseLastName].filter(Boolean).join(' ') || null,
                    pharmacistName: [r.pharmacistFirstName, r.pharmacistLastName].filter(Boolean).join(' ') || null,
                };
            }

            return {
                ...prescription,
                status: pickupInfo ? 'picked_up' : (prescription.status || null),
                items: items || [],
                medicationNames: medicationNames.length > 0 ? medicationNames.join(', ') : null,
                pickupInfo,
            };
        }));

        // Get diagnoses
        const [diagnoses] = await pool.execute(
            'SELECT * FROM admission_diagnoses WHERE admissionId = ? ORDER BY diagnosisType, diagnosisId',
            [id]
        );

        // Get orders/consumables (invoices with consumables linked to this admission)
        const [ordersInvoices] = await pool.execute(
            `SELECT i.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.patientId = ?
             AND (i.notes LIKE '%Consumables ordered%' OR i.notes LIKE '%consumables ordered%' OR i.notes LIKE '%inpatient%')
             AND DATE(i.invoiceDate) >= DATE(?)
             ORDER BY i.invoiceDate DESC`,
            [admission.patientId, admission.admissionDate || new Date().toISOString().split('T')[0]]
        );

        // Get invoice items for orders
        const ordersWithItems = await Promise.all(ordersInvoices.map(async (invoice) => {
            const [items] = await pool.execute(
                `SELECT ii.*, sc.name as chargeName, sc.chargeCode
                 FROM invoice_items ii
                 LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
                 WHERE ii.invoiceId = ?
                 ORDER BY ii.itemId`,
                [invoice.invoiceId]
            );
            return {
                ...invoice,
                items: items || []
            };
        }));

        res.status(200).json({
            admission,
            diagnoses,
            reviews,
            nursingCare,
            vitals,
            vitalsSchedule: vitalsSchedule[0] || null,
            procedures,
            labOrders,
            radiologyOrders,
            prescriptions,
            orders: ordersWithItems,
        });
    } catch (error) {
        console.error('Error fetching admission overview:', error);
        res.status(500).json({ message: 'Error fetching admission overview', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/admissions/:id/bill
 * @description Get comprehensive bill for admission: all invoices in period + bed charge + consultant charges. Resolves prices by patient type (insurance/cash) using latest applicable rate.
 */
router.get('/admissions/:id/bill', async (req, res) => {
    try {
        const { id } = req.params;
        const [admissions] = await pool.execute(
            `SELECT a.*,
                    pt.firstName, pt.lastName, pt.patientNumber, pt.patientType,
                    w.wardName, w.wardType, w.wardId,
                    b.bedNumber, b.bedId
             FROM admissions a
             LEFT JOIN patients pt ON a.patientId = pt.patientId
             LEFT JOIN beds b ON a.bedId = b.bedId
             LEFT JOIN wards w ON b.wardId = w.wardId
             WHERE a.admissionId = ?`,
            [id]
        );
        if (admissions.length === 0) {
            return res.status(404).json({ message: 'Admission not found' });
        }
        const admission = admissions[0];
        const patientId = admission.patientId;
        const wardId = admission.wardId ?? null;
        const wardType = admission.wardType ?? null;
        const admissionDate = toDateOnly(admission.admissionDate);
        const dischargeDate = toDateOnly(admission.dischargeDate);
        if (!admissionDate) {
            return res.status(500).json({ message: 'Admission date is invalid for billing' });
        }
        const admissionEnd = dischargeDate || new Date().toISOString().slice(0, 10);
        const wardOptions = (wardId != null || wardType != null) ? { wardId, wardType } : {};

        let insuranceProviderName = null;
        if (admission.patientType === 'insurance') {
            const [ins] = await pool.execute(
                `SELECT ip.providerName FROM patient_insurance pi
                 LEFT JOIN insurance_providers ip ON pi.providerId = ip.providerId
                 WHERE pi.patientId = ? AND pi.isActive = 1
                   AND (pi.coverageEndDate IS NULL OR pi.coverageEndDate >= ?)
                 ORDER BY pi.coverageStartDate DESC LIMIT 1`,
                [patientId, admissionEnd]
            );
            if (ins.length > 0) insuranceProviderName = ins[0].providerName;
        }

        const lines = [];
        let paidTotal = 0;
        let depositPaidTotal = 0;
        let depositInvoice = null;

        // (1) All invoice items for this patient in admission period (labs, medications, orders, procedures, etc.)
        const [invoiceTotals] = await pool.execute(
            `SELECT COALESCE(SUM(i.paidAmount), 0) as paidTotal
             FROM invoices i
             WHERE i.patientId = ? AND DATE(i.invoiceDate) >= DATE(?) AND DATE(i.invoiceDate) <= DATE(?)
               AND (i.notes IS NULL OR i.notes NOT LIKE 'Admission deposit - %')`,
            [patientId, admissionDate, admissionEnd]
        );
        paidTotal = parseFloat(invoiceTotals[0]?.paidTotal || 0);

        const [invoiceItems] = await pool.execute(
            `SELECT i.invoiceId, i.invoiceNumber, i.invoiceDate, i.status, i.notes,
                    ii.itemId, ii.chargeId, ii.description as itemDescription, ii.quantity, ii.unitPrice, ii.totalPrice,
                    sc.name as chargeName, sc.chargeCode
             FROM invoices i
             INNER JOIN invoice_items ii ON ii.invoiceId = i.invoiceId
             LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
             WHERE i.patientId = ? AND DATE(i.invoiceDate) >= DATE(?) AND DATE(i.invoiceDate) <= DATE(?)
               AND (i.notes IS NULL OR i.notes NOT LIKE 'Admission deposit - %')
             ORDER BY i.invoiceDate ASC, i.invoiceId ASC, ii.itemId ASC`,
            [patientId, admissionDate, admissionEnd]
        );
        const categoryFromNotes = (notes) => {
            if (!notes) return 'Other';
            const n = (notes + '').toLowerCase();
            if (n.includes('lab') || n.includes('lab test')) return 'Lab';
            if (n.includes('drug') || n.includes('prescription') || n.includes('pharmacy')) return 'Medication';
            if (n.includes('procedure')) return 'Procedure';
            if (n.includes('review') || n.includes('doctor review') || n.includes('consultant')) return 'Doctor Review';
            if (n.includes('consumable') || n.includes('inpatient stay')) return 'Consumables';
            if (n.includes('radiology') || n.includes('exam')) return 'Radiology';
            return 'Other';
        };
        for (const it of invoiceItems) {
            const invCategory = categoryFromNotes(it.notes);
            const itemDate = toDateOnly(it.invoiceDate) || admissionDate;
            const chargeId = it.chargeId;
            const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
            const description = it.chargeName || it.itemDescription || it.chargeCode || 'Item';
            const linePayload = {
                source: 'invoice',
                sourceLabel: invCategory,
                lineRef: buildAdmissionBillLineRef('invoice', { invoiceId: it.invoiceId, itemId: it.itemId }),
                invoiceId: it.invoiceId,
                invoiceNumber: it.invoiceNumber,
                date: itemDate,
                description,
                quantity: qty,
                unitPrice: undefined,
                totalPrice: undefined,
                chargeId: chargeId || null,
                status: it.status,
            };
            if (chargeId) {
                // Use already invoiced price when available for speed/stability.
                // Fall back to charge-rate resolution only if stored values are missing.
                const storedUnitPrice = parseFloat(it.unitPrice || 0);
                const storedTotalPrice = parseFloat(it.totalPrice || 0);
                if (storedUnitPrice > 0 || storedTotalPrice > 0) {
                    linePayload.unitPrice = storedUnitPrice > 0 ? storedUnitPrice : Math.round((storedTotalPrice / qty) * 100) / 100;
                    linePayload.totalPrice = storedTotalPrice > 0 ? storedTotalPrice : Math.round(storedUnitPrice * qty * 100) / 100;
                } else {
                    const { unitPrice, totalPrice } = await resolveChargeRate(
                        pool, patientId, { chargeId, quantity: qty }, itemDate, wardOptions
                    );
                    linePayload.unitPrice = unitPrice;
                    linePayload.totalPrice = totalPrice;
                }
            } else {
                const up = parseFloat(it.unitPrice || 0);
                const tot = parseFloat(it.totalPrice || 0) || up * qty;
                linePayload.unitPrice = up;
                linePayload.totalPrice = Math.round(tot * 100) / 100;
            }
            lines.push(linePayload);
        }

        // (1b) Admission deposit credit (deduct only amount already paid against deposit invoice)
        if (admission.depositInvoiceId) {
            const [depositRows] = await pool.execute(
                `SELECT invoiceId, invoiceNumber, invoiceDate, totalAmount, paidAmount, balance, status
                 FROM invoices
                 WHERE invoiceId = ?`,
                [admission.depositInvoiceId]
            );
            if (depositRows.length > 0) {
                depositInvoice = depositRows[0];
                depositPaidTotal = Math.max(0, parseFloat(depositInvoice.paidAmount || 0));
                if (depositPaidTotal > 0) {
                    lines.push({
                        source: 'deposit',
                        sourceLabel: 'Deposit Credit',
                        lineRef: buildAdmissionBillLineRef('deposit', {
                            admissionId: id,
                            invoiceId: depositInvoice.invoiceId,
                        }),
                        date: toDateOnly(depositInvoice.invoiceDate) || admissionDate,
                        description: `Admission deposit applied (${depositInvoice.invoiceNumber || `#${depositInvoice.invoiceId}`})`,
                        chargeId: null,
                        quantity: 1,
                        unitPrice: -depositPaidTotal,
                        totalPrice: -depositPaidTotal,
                        status: depositInvoice.status || 'pending',
                        invoiceId: depositInvoice.invoiceId,
                        invoiceNumber: depositInvoice.invoiceNumber,
                    });
                }
            }
        }

        // (2) Bed charge (days × bed rate)
        const days = Math.max(1, Math.floor((new Date(admissionEnd) - new Date(admissionDate)) / (24 * 60 * 60 * 1000)) + 1);
        const [bedChargeRows] = await pool.execute(
            `SELECT chargeId, name, chargeCode FROM service_charges
             WHERE (chargeCode LIKE 'BED%' OR name LIKE '%bed%' OR category = 'Bed') AND (status = 'Active' OR status = 'Inactive')
             LIMIT 1`
        );
        if (bedChargeRows.length > 0) {
            const bedChargeId = bedChargeRows[0].chargeId;
            const { unitPrice, totalPrice } = await resolveChargeRate(
                pool, patientId, { chargeId: bedChargeId, quantity: days }, admissionDate, wardOptions
            );
            lines.push({
                source: 'bed',
                sourceLabel: 'Bed',
                lineRef: buildAdmissionBillLineRef('bed', {
                    admissionId: id,
                    date: admissionDate,
                    quantity: days,
                }),
                date: admissionDate,
                description: `Bed charge (${days} day${days !== 1 ? 's' : ''})`,
                chargeId: bedChargeId,
                quantity: days,
                unitPrice,
                totalPrice,
            });
        }

        // (3) Consultant charges (per doctor review)
        const [reviews] = await pool.execute(
            'SELECT reviewId, reviewDate FROM inpatient_doctor_reviews WHERE admissionId = ? ORDER BY reviewDate ASC',
            [id]
        );
        const reviewCount = reviews.length;
        if (reviewCount > 0) {
            const [consultChargeRows] = await pool.execute(
                `SELECT chargeId, name FROM service_charges
                 WHERE (chargeCode LIKE 'CONSULT%' OR chargeCode LIKE 'REVIEW%' OR name LIKE '%consultant%' OR name LIKE '%review%') AND (status = 'Active' OR status = 'Inactive')
                 LIMIT 1`
            );
            if (consultChargeRows.length > 0) {
                const lastReviewDate = toDateOnly(reviews[reviews.length - 1].reviewDate) || admissionDate;
                const consultChargeId = consultChargeRows[0].chargeId;
                const { unitPrice, totalPrice } = await resolveChargeRate(
                    pool, patientId, { chargeId: consultChargeId, quantity: reviewCount }, lastReviewDate, wardOptions
                );
                lines.push({
                    source: 'consultant',
                    sourceLabel: 'Consultant',
                    lineRef: buildAdmissionBillLineRef('consultant', {
                        admissionId: id,
                        date: lastReviewDate,
                        quantity: reviewCount,
                    }),
                    date: lastReviewDate,
                    description: `Consultant review (${reviewCount})`,
                    chargeId: consultChargeId,
                    quantity: reviewCount,
                    unitPrice,
                    totalPrice,
                });
            }
        }

        let approvedAdjustments = [];
        try {
            const [rows] = await pool.execute(
                `SELECT lineRef, SUM(deltaAmount) as adjustmentTotal
                 FROM inpatient_bill_adjustments
                 WHERE admissionId = ? AND status = 'approved'
                 GROUP BY lineRef`,
                [id]
            );
            approvedAdjustments = rows;
        } catch (adjError) {
            // Backward compatibility: if migration wasn't applied yet, continue without adjustments.
            if (!(adjError && (adjError.code === 'ER_NO_SUCH_TABLE' || adjError.errno === 1146))) {
                throw adjError;
            }
        }
        const adjustmentsByLineRef = new Map(
            approvedAdjustments.map((r) => [r.lineRef, parseFloat(r.adjustmentTotal || 0)])
        );
        for (const line of lines) {
            const adj = adjustmentsByLineRef.get(line.lineRef) || 0;
            line.approvedAdjustment = Math.round(adj * 100) / 100;
            line.adjustedTotal = Math.round(((line.totalPrice || 0) + adj) * 100) / 100;
        }

        const subtotal = lines.reduce((sum, l) => sum + (l.totalPrice || 0), 0);
        const adjustmentsTotal = lines.reduce((sum, l) => sum + (l.approvedAdjustment || 0), 0);
        const grandTotal = Math.round((subtotal + adjustmentsTotal) * 100) / 100;
        const balanceTotal = Math.round((grandTotal - paidTotal) * 100) / 100;

        res.status(200).json({
            admission: {
                admissionId: admission.admissionId,
                admissionNumber: admission.admissionNumber,
                firstName: admission.firstName,
                lastName: admission.lastName,
                patientNumber: admission.patientNumber,
                wardName: admission.wardName,
                bedNumber: admission.bedNumber,
                admissionDate,
                dischargeDate,
                depositAmount: admission.depositAmount != null ? parseFloat(admission.depositAmount) : null,
                depositRequired: !!admission.depositRequired,
                depositInvoiceId: admission.depositInvoiceId || null,
            },
            patientType: admission.patientType || 'paying',
            insuranceProviderName,
            lines,
            subtotal: Math.round(subtotal * 100) / 100,
            adjustmentsTotal: Math.round(adjustmentsTotal * 100) / 100,
            grandTotal,
            paidTotal: Math.round(paidTotal * 100) / 100,
            balanceTotal,
            deposit: {
                expectedAmount: admission.depositAmount != null ? parseFloat(admission.depositAmount) : 0,
                invoiceId: depositInvoice?.invoiceId || admission.depositInvoiceId || null,
                invoiceNumber: depositInvoice?.invoiceNumber || null,
                status: depositInvoice?.status || null,
                paidAmount: Math.round(depositPaidTotal * 100) / 100,
                outstandingAmount: depositInvoice
                    ? Math.max(0, parseFloat(depositInvoice.totalAmount || 0) - parseFloat(depositInvoice.paidAmount || 0))
                    : Math.max(0, parseFloat(admission.depositAmount || 0) - depositPaidTotal),
            },
        });
    } catch (error) {
        console.error('Error fetching admission bill:', error);
        res.status(500).json({ message: 'Error fetching admission bill', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/admissions/:id/bill-adjustments
 * @description List bill line adjustments for an admission
 */
router.get('/admissions/:id/bill-adjustments', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(
            `SELECT a.*,
                    r1.firstName as requestedByFirstName, r1.lastName as requestedByLastName,
                    r2.firstName as approvedByFirstName, r2.lastName as approvedByLastName
             FROM inpatient_bill_adjustments a
             LEFT JOIN users r1 ON a.requestedBy = r1.userId
             LEFT JOIN users r2 ON a.approvedBy = r2.userId
             WHERE a.admissionId = ?
             ORDER BY a.createdAt DESC, a.adjustmentId DESC`,
            [id]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching bill adjustments:', error);
        res.status(500).json({ message: 'Error fetching bill adjustments', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/admissions/:id/bill-adjustments
 * @description Request a per-line bill adjustment
 */
router.post('/admissions/:id/bill-adjustments', async (req, res) => {
    try {
        const { id } = req.params;
        const { lineRef, adjustmentType = 'credit', deltaAmount, reason } = req.body;
        const requestedBy = getUserId(req);
        if (!requestedBy) {
            return res.status(401).json({ message: 'Authentication required to request bill adjustments' });
        }

        if (!lineRef || typeof lineRef !== 'string') {
            return res.status(400).json({ message: 'lineRef is required' });
        }
        if (lineRef.length > 255) {
            return res.status(400).json({ message: 'lineRef is too long' });
        }
        const allowedAdjustmentTypes = new Set(['credit', 'debit', 'override', 'discount', 'other']);
        if (!allowedAdjustmentTypes.has(String(adjustmentType))) {
            return res.status(400).json({ message: "adjustmentType must be one of: credit, debit, override, discount, other" });
        }
        const delta = parseFloat(deltaAmount);
        if (!Number.isFinite(delta) || delta === 0) {
            return res.status(400).json({ message: 'deltaAmount must be a non-zero number' });
        }
        if (Math.abs(delta) > 100000000) {
            return res.status(400).json({ message: 'deltaAmount is outside allowed range' });
        }
        if (!reason || !String(reason).trim()) {
            return res.status(400).json({ message: 'reason is required' });
        }
        if (String(reason).trim().length > 1000) {
            return res.status(400).json({ message: 'reason is too long' });
        }

        const [result] = await pool.execute(
            `INSERT INTO inpatient_bill_adjustments
             (admissionId, lineRef, adjustmentType, deltaAmount, reason, status, requestedBy)
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            [id, lineRef, adjustmentType, delta, reason, requestedBy || null]
        );

        const [created] = await pool.execute(
            `SELECT * FROM inpatient_bill_adjustments WHERE adjustmentId = ?`,
            [result.insertId]
        );
        res.status(201).json(created[0]);
    } catch (error) {
        console.error('Error creating bill adjustment:', error);
        res.status(500).json({ message: 'Error creating bill adjustment', error: error.message });
    }
});

/**
 * @route PUT /api/inpatient/admissions/:id/bill-adjustments/:adjustmentId
 * @description Approve or reject a per-line bill adjustment
 */
router.put('/admissions/:id/bill-adjustments/:adjustmentId', async (req, res) => {
    try {
        const { id, adjustmentId } = req.params;
        const { status } = req.body;
        const approvedBy = getUserId(req);
        if (!approvedBy) {
            return res.status(401).json({ message: 'Authentication required to approve/reject bill adjustments' });
        }
        const canApprove = await isBillAdjustmentApprover(pool, approvedBy);

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });
        }
        if (!canApprove) {
            return res.status(403).json({ message: 'You are not allowed to approve/reject bill adjustments' });
        }

        const [existing] = await pool.execute(
            `SELECT adjustmentId, status FROM inpatient_bill_adjustments WHERE adjustmentId = ? AND admissionId = ?`,
            [adjustmentId, id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Bill adjustment not found' });
        }
        if (existing[0].status !== 'pending') {
            return res.status(409).json({ message: `Bill adjustment already ${existing[0].status}` });
        }

        await pool.execute(
            `UPDATE inpatient_bill_adjustments
             SET status = ?, approvedBy = ?, approvedAt = NOW(), updatedAt = NOW()
             WHERE adjustmentId = ? AND admissionId = ?`,
            [status, approvedBy || null, adjustmentId, id]
        );

        const [updated] = await pool.execute(
            `SELECT * FROM inpatient_bill_adjustments WHERE adjustmentId = ?`,
            [adjustmentId]
        );
        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating bill adjustment:', error);
        res.status(500).json({ message: 'Error updating bill adjustment', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/admissions/:id/reviews
 * @description Get doctor reviews for an admission
 */
router.get('/admissions/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        const [reviews] = await pool.execute(
            `SELECT r.*,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM inpatient_doctor_reviews r
             LEFT JOIN users u ON r.reviewingDoctorId = u.userId
             WHERE r.admissionId = ?
             ORDER BY r.reviewDate DESC`,
            [id]
        );
        res.status(200).json(reviews);
    } catch (error) {
        console.error('Error fetching doctor reviews:', error);
        res.status(500).json({ message: 'Error fetching doctor reviews', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/admissions/:id/reviews
 * @description Create a doctor review
 */
router.post('/admissions/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewDate, reviewingDoctorId, reviewType, subjective, objective, assessment, plan, notes, nextReviewDate } = req.body;

        if (!reviewingDoctorId) {
            return res.status(400).json({ message: 'Reviewing doctor ID is required' });
        }

        const [result] = await pool.execute(
            `INSERT INTO inpatient_doctor_reviews
             (admissionId, reviewDate, reviewingDoctorId, reviewType, subjective, objective, assessment, plan, notes, nextReviewDate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, reviewDate || new Date(), reviewingDoctorId, reviewType || 'morning_round', subjective || null, objective || null, assessment || null, plan || null, notes || null, nextReviewDate || null]
        );

        const [newReview] = await pool.execute(
            `SELECT r.*,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM inpatient_doctor_reviews r
             LEFT JOIN users u ON r.reviewingDoctorId = u.userId
             WHERE r.reviewId = ?`,
            [result.insertId]
        );

        // Create invoice for doctor review (so inpatient bills include doctor review charges)
        try {
            const userId = getUserId(req);
            const [admRows] = await pool.execute(
                `SELECT a.patientId, a.status as admissionStatus, pt.patientType,
                        w.wardId, w.wardType
                 FROM admissions a
                 LEFT JOIN patients pt ON a.patientId = pt.patientId
                 LEFT JOIN beds b ON a.bedId = b.bedId
                 LEFT JOIN wards w ON b.wardId = w.wardId
                 WHERE a.admissionId = ?`,
                [id]
            );
            if (admRows.length > 0) {
                const admission = admRows[0];
                if (admission.admissionStatus === 'discharged') {
                    return res.status(201).json(newReview[0]);
                }
                const patientId = admission.patientId;
                const patientType = admission.patientType || 'paying';
                const wardOptions = (admission.wardId != null || admission.wardType != null)
                    ? { wardId: admission.wardId ?? null, wardType: admission.wardType ?? null }
                    : {};

                const [consultChargeRows] = await pool.execute(
                    `SELECT chargeId, name
                     FROM service_charges
                     WHERE (chargeCode LIKE 'CONSULT%' OR chargeCode LIKE 'REVIEW%' OR name LIKE '%consultant%' OR name LIKE '%review%')
                       AND (status = 'Active' OR status = 'Inactive')
                     LIMIT 1`
                );

                if (consultChargeRows.length > 0) {
                    const consultChargeId = consultChargeRows[0].chargeId;

                    const reviewDateObj = reviewDate ? new Date(reviewDate) : new Date();
                    const itemDate = !Number.isNaN(reviewDateObj.getTime())
                        ? reviewDateObj.toISOString().slice(0, 10)
                        : new Date().toISOString().slice(0, 10);

                    const { unitPrice, totalPrice } = await resolveChargeRate(
                        pool,
                        patientId,
                        { chargeId: consultChargeId, quantity: 1 },
                        itemDate,
                        wardOptions
                    );

                    if (parseFloat(totalPrice || 0) > 0) {
                        const today = itemDate.replace(/-/g, '');
                        const datePrefix = `INV-${today}-`;

                        const [maxResult] = await pool.execute(
                            `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                             FROM invoices
                             WHERE invoiceNumber LIKE CONCAT(?, '%')`,
                            [datePrefix]
                        );

                        let retryNum = (maxResult[0]?.maxNum || 0) + 1;
                        let finalInvoiceNumber = null;
                        let foundAvailable = false;
                        let retryAttempts = 0;

                        while (!foundAvailable && retryAttempts < 100) {
                            const testNumber = `${datePrefix}${String(retryNum).padStart(4, '0')}`;
                            const [existing] = await pool.execute(
                                'SELECT invoiceId FROM invoices WHERE invoiceNumber = ?',
                                [testNumber]
                            );
                            if (existing.length === 0) {
                                finalInvoiceNumber = testNumber;
                                foundAvailable = true;
                            } else {
                                retryNum++;
                                retryAttempts++;
                            }
                        }

                        if (finalInvoiceNumber) {
                            const [invResult] = await pool.execute(
                                `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, dueDate, totalAmount, balance, status, notes, createdBy)
                                 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
                                [
                                    finalInvoiceNumber,
                                    patientId,
                                    itemDate,
                                    null,
                                    totalPrice,
                                    totalPrice,
                                    `Doctor review (${reviewType || 'review'})`,
                                    userId || null
                                ]
                            );

                            await pool.execute(
                                `INSERT INTO invoice_items (invoiceId, chargeId, description, quantity, unitPrice, totalPrice)
                                 VALUES (?, ?, ?, 1, ?, ?)`,
                                [
                                    invResult.insertId,
                                    consultChargeId,
                                    `Doctor review (${reviewType || 'review'})`,
                                    unitPrice ?? totalPrice,
                                    totalPrice
                                ]
                            );

                            // Add to cashier queue if not already there (best-effort)
                            const [existingQueue] = await pool.execute(
                                `SELECT queueId FROM queue_entries
                                 WHERE patientId = ? AND servicePoint = 'cashier'
                                   AND status IN ('waiting', 'called', 'serving')`,
                                [patientId]
                            );

                            if (existingQueue.length === 0) {
                                const [cashierCount] = await pool.execute(
                                    'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "cashier"'
                                );
                                const ticketNum = cashierCount[0]?.count ? cashierCount[0].count + 1 : 1;
                                const ticketNumber = `C-${String(ticketNum).padStart(3, '0')}`;
                                const queuePriority = reviewType === 'emergency' ? 'urgent' : 'normal';

                                await pool.execute(
                                    `INSERT INTO queue_entries
                                     (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                     VALUES (?, ?, 'cashier', ?, 'waiting', ?, ?)`,
                                    [
                                        patientId,
                                        ticketNumber,
                                        queuePriority,
                                        `Doctor review payment - ${reviewType || 'review'}`,
                                        userId || null
                                    ]
                                );
                            }
                        }
                    }
                }
            }
        } catch (invoiceError) {
            // Don't fail review creation if invoice creation fails
            console.error('Error creating invoice for doctor review:', invoiceError);
        }

        res.status(201).json(newReview[0]);
    } catch (error) {
        console.error('Error creating doctor review:', error);
        res.status(500).json({ message: 'Error creating doctor review', error: error.message });
    }
});

/**
 * @route PUT /api/inpatient/reviews/:reviewId
 * @description Update a doctor review
 */
router.put('/reviews/:reviewId', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reviewDate, reviewingDoctorId, reviewType, subjective, objective, assessment, plan, notes, nextReviewDate } = req.body;

        // Check if review exists
        const [existing] = await pool.execute(
            'SELECT reviewId FROM inpatient_doctor_reviews WHERE reviewId = ?',
            [reviewId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Doctor review not found' });
        }

        // Build update query
        const updates = [];
        const values = [];

        if (reviewDate !== undefined) {
            updates.push('reviewDate = ?');
            values.push(reviewDate);
        }
        if (reviewingDoctorId !== undefined) {
            updates.push('reviewingDoctorId = ?');
            values.push(reviewingDoctorId);
        }
        if (reviewType !== undefined) {
            updates.push('reviewType = ?');
            values.push(reviewType);
        }
        if (subjective !== undefined) {
            updates.push('subjective = ?');
            values.push(subjective || null);
        }
        if (objective !== undefined) {
            updates.push('objective = ?');
            values.push(objective || null);
        }
        if (assessment !== undefined) {
            updates.push('assessment = ?');
            values.push(assessment || null);
        }
        if (plan !== undefined) {
            updates.push('plan = ?');
            values.push(plan || null);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes || null);
        }
        if (nextReviewDate !== undefined) {
            updates.push('nextReviewDate = ?');
            values.push(nextReviewDate || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(reviewId);

        await pool.execute(
            `UPDATE inpatient_doctor_reviews SET ${updates.join(', ')}, updatedAt = NOW() WHERE reviewId = ?`,
            values
        );

        const [updatedReview] = await pool.execute(
            `SELECT r.*,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM inpatient_doctor_reviews r
             LEFT JOIN users u ON r.reviewingDoctorId = u.userId
             WHERE r.reviewId = ?`,
            [reviewId]
        );

        res.status(200).json(updatedReview[0]);
    } catch (error) {
        console.error('Error updating doctor review:', error);
        res.status(500).json({ message: 'Error updating doctor review', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/admissions/:id/nursing-care
 * @description Get nursing care notes for an admission
 */
router.get('/admissions/:id/nursing-care', async (req, res) => {
    try {
        const { id } = req.params;
        const [care] = await pool.execute(
            `SELECT n.*,
                    u.firstName as nurseFirstName, u.lastName as nurseLastName
             FROM inpatient_nursing_care n
             LEFT JOIN users u ON n.nurseId = u.userId
             WHERE n.admissionId = ?
             ORDER BY n.careDate DESC`,
            [id]
        );
        res.status(200).json(care);
    } catch (error) {
        console.error('Error fetching nursing care:', error);
        res.status(500).json({ message: 'Error fetching nursing care', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/admissions/:id/nursing-care
 * @description Create a nursing care note
 */
router.post('/admissions/:id/nursing-care', async (req, res) => {
    try {
        const { id } = req.params;
        const { careDate, nurseId, careType, shift, vitalSignsRecorded, observations, interventions, patientResponse, concerns, notes } = req.body;

        if (!nurseId) {
            return res.status(400).json({ message: 'Nurse ID is required' });
        }

        const [result] = await pool.execute(
            `INSERT INTO inpatient_nursing_care
             (admissionId, careDate, nurseId, careType, shift, vitalSignsRecorded, observations, interventions, patientResponse, concerns, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, careDate || new Date(), nurseId, careType || 'observation', shift || 'morning', vitalSignsRecorded || false, observations || null, interventions || null, patientResponse || null, concerns || null, notes || null]
        );

        const [newCare] = await pool.execute(
            `SELECT n.*,
                    u.firstName as nurseFirstName, u.lastName as nurseLastName
             FROM inpatient_nursing_care n
             LEFT JOIN users u ON n.nurseId = u.userId
             WHERE n.careId = ?`,
            [result.insertId]
        );

        res.status(201).json(newCare[0]);
    } catch (error) {
        console.error('Error creating nursing care note:', error);
        res.status(500).json({ message: 'Error creating nursing care note', error: error.message });
    }
});

/**
 * @route PUT /api/inpatient/nursing-care/:careId
 * @description Update a nursing care note
 */
router.put('/nursing-care/:careId', async (req, res) => {
    try {
        const { careId } = req.params;
        const { careDate, nurseId, careType, shift, vitalSignsRecorded, observations, interventions, patientResponse, concerns, notes } = req.body;

        // Check if care note exists
        const [existing] = await pool.execute(
            'SELECT careId FROM inpatient_nursing_care WHERE careId = ?',
            [careId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Nursing care note not found' });
        }

        // Build update query
        const updates = [];
        const values = [];

        if (careDate !== undefined) {
            updates.push('careDate = ?');
            values.push(careDate);
        }
        if (nurseId !== undefined) {
            updates.push('nurseId = ?');
            values.push(nurseId);
        }
        if (careType !== undefined) {
            updates.push('careType = ?');
            values.push(careType);
        }
        if (shift !== undefined) {
            updates.push('shift = ?');
            values.push(shift);
        }
        if (vitalSignsRecorded !== undefined) {
            updates.push('vitalSignsRecorded = ?');
            values.push(vitalSignsRecorded);
        }
        if (observations !== undefined) {
            updates.push('observations = ?');
            values.push(observations || null);
        }
        if (interventions !== undefined) {
            updates.push('interventions = ?');
            values.push(interventions || null);
        }
        if (patientResponse !== undefined) {
            updates.push('patientResponse = ?');
            values.push(patientResponse || null);
        }
        if (concerns !== undefined) {
            updates.push('concerns = ?');
            values.push(concerns || null);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(careId);

        await pool.execute(
            `UPDATE inpatient_nursing_care SET ${updates.join(', ')}, updatedAt = NOW() WHERE careId = ?`,
            values
        );

        const [updatedCare] = await pool.execute(
            `SELECT n.*,
                    u.firstName as nurseFirstName, u.lastName as nurseLastName
             FROM inpatient_nursing_care n
             LEFT JOIN users u ON n.nurseId = u.userId
             WHERE n.careId = ?`,
            [careId]
        );

        res.status(200).json(updatedCare[0]);
    } catch (error) {
        console.error('Error updating nursing care note:', error);
        res.status(500).json({ message: 'Error updating nursing care note', error: error.message });
    }
});

/**
 * @route GET /api/inpatient/admissions/:id/vitals-schedule
 * @description Get vitals schedule for an admission
 */
router.get('/admissions/:id/vitals-schedule', async (req, res) => {
    try {
        const { id } = req.params;
        const [schedule] = await pool.execute(
            'SELECT * FROM inpatient_vitals_schedule WHERE admissionId = ? AND isActive = 1 ORDER BY scheduleDate DESC LIMIT 1',
            [id]
        );
        res.status(200).json(schedule[0] || null);
    } catch (error) {
        console.error('Error fetching vitals schedule:', error);
        res.status(500).json({ message: 'Error fetching vitals schedule', error: error.message });
    }
});

/**
 * @route POST /api/inpatient/admissions/:id/vitals-schedule
 * @description Create or update vitals schedule for an admission
 */
router.post('/admissions/:id/vitals-schedule', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { scheduleDate, scheduledTime1, scheduledTime2, scheduledTime3, scheduledTime4, frequency, notes } = req.body;

        // Deactivate existing schedules for this admission
        await connection.execute(
            'UPDATE inpatient_vitals_schedule SET isActive = 0 WHERE admissionId = ?',
            [id]
        );

        // Insert new schedule
        const [result] = await connection.execute(
            `INSERT INTO inpatient_vitals_schedule
             (admissionId, scheduleDate, scheduledTime1, scheduledTime2, scheduledTime3, scheduledTime4, frequency, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             scheduledTime1 = VALUES(scheduledTime1),
             scheduledTime2 = VALUES(scheduledTime2),
             scheduledTime3 = VALUES(scheduledTime3),
             scheduledTime4 = VALUES(scheduledTime4),
             frequency = VALUES(frequency),
             notes = VALUES(notes),
             isActive = 1,
             updatedAt = NOW()`,
            [id, scheduleDate || new Date().toISOString().split('T')[0], scheduledTime1 || '06:00:00', scheduledTime2 || '12:00:00', scheduledTime3 || '18:00:00', scheduledTime4 || '00:00:00', frequency || '4x', notes || null]
        );

        await connection.commit();

        const [newSchedule] = await connection.execute(
            'SELECT * FROM inpatient_vitals_schedule WHERE scheduleId = ?',
            [result.insertId]
        );

        res.status(201).json(newSchedule[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating vitals schedule:', error);
        res.status(500).json({ message: 'Error creating vitals schedule', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route POST /api/inpatient/admissions/:id/vitals
 * @description Record vital signs for an inpatient admission
 */
router.post('/admissions/:id/vitals', async (req, res) => {
    try {
        const { id } = req.params;
        const { recordedDate, systolicBP, diastolicBP, heartRate, respiratoryRate, temperature, oxygenSaturation, painScore, glasgowComaScale, weight, height, bmi, bloodGlucose, notes, recordedBy } = req.body;

        // Get patient ID from admission
        const [admissions] = await pool.execute(
            'SELECT patientId FROM admissions WHERE admissionId = ?',
            [id]
        );

        if (admissions.length === 0) {
            return res.status(404).json({ message: 'Admission not found' });
        }

        const patientId = admissions[0].patientId;

        const [result] = await pool.execute(
            `INSERT INTO vital_signs
             (patientId, admissionId, recordedDate, systolicBP, diastolicBP, heartRate, respiratoryRate, temperature, oxygenSaturation, painScore, glasgowComaScale, weight, height, bmi, bloodGlucose, context, notes, recordedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admission', ?, ?)`,
            [patientId, id, recordedDate || new Date(), systolicBP || null, diastolicBP || null, heartRate || null, respiratoryRate || null, temperature || null, oxygenSaturation || null, painScore || null, glasgowComaScale || null, weight || null, height || null, bmi || null, bloodGlucose || null, notes || null, recordedBy || null]
        );

        const [newVital] = await pool.execute(
            `SELECT vs.*,
                    u.firstName as recordedByFirstName, u.lastName as recordedByLastName
             FROM vital_signs vs
             LEFT JOIN users u ON vs.recordedBy = u.userId
             WHERE vs.vitalSignId = ?`,
            [result.insertId]
        );

        res.status(201).json(newVital[0]);
    } catch (error) {
        console.error('Error recording vital signs:', error);
        res.status(500).json({ message: 'Error recording vital signs', error: error.message });
    }
});

/**
 * @route PUT /api/inpatient/vitals/:vitalId
 * @description Update vital signs record
 */
router.put('/vitals/:vitalId', async (req, res) => {
    try {
        const { vitalId } = req.params;
        const { recordedDate, systolicBP, diastolicBP, heartRate, respiratoryRate, temperature, oxygenSaturation, painScore, glasgowComaScale, weight, height, bmi, bloodGlucose, notes } = req.body;

        // Check if vital sign exists
        const [existing] = await pool.execute(
            'SELECT vitalSignId FROM vital_signs WHERE vitalSignId = ?',
            [vitalId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Vital sign record not found' });
        }

        // Build update query
        const updates = [];
        const values = [];

        if (recordedDate !== undefined) {
            updates.push('recordedDate = ?');
            values.push(recordedDate);
        }
        if (systolicBP !== undefined) {
            updates.push('systolicBP = ?');
            values.push(systolicBP || null);
        }
        if (diastolicBP !== undefined) {
            updates.push('diastolicBP = ?');
            values.push(diastolicBP || null);
        }
        if (heartRate !== undefined) {
            updates.push('heartRate = ?');
            values.push(heartRate || null);
        }
        if (respiratoryRate !== undefined) {
            updates.push('respiratoryRate = ?');
            values.push(respiratoryRate || null);
        }
        if (temperature !== undefined) {
            updates.push('temperature = ?');
            values.push(temperature || null);
        }
        if (oxygenSaturation !== undefined) {
            updates.push('oxygenSaturation = ?');
            values.push(oxygenSaturation || null);
        }
        if (painScore !== undefined) {
            updates.push('painScore = ?');
            values.push(painScore || null);
        }
        if (glasgowComaScale !== undefined) {
            updates.push('glasgowComaScale = ?');
            values.push(glasgowComaScale || null);
        }
        if (weight !== undefined) {
            updates.push('weight = ?');
            values.push(weight || null);
        }
        if (height !== undefined) {
            updates.push('height = ?');
            values.push(height || null);
        }
        if (bmi !== undefined) {
            updates.push('bmi = ?');
            values.push(bmi || null);
        }
        if (bloodGlucose !== undefined) {
            updates.push('bloodGlucose = ?');
            values.push(bloodGlucose || null);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(vitalId);

        await pool.execute(
            `UPDATE vital_signs SET ${updates.join(', ')} WHERE vitalSignId = ?`,
            values
        );

        const [updatedVital] = await pool.execute(
            `SELECT vs.*,
                    u.firstName as recordedByFirstName, u.lastName as recordedByLastName
             FROM vital_signs vs
             LEFT JOIN users u ON vs.recordedBy = u.userId
             WHERE vs.vitalSignId = ?`,
            [vitalId]
        );

        res.status(200).json(updatedVital[0]);
    } catch (error) {
        console.error('Error updating vital signs:', error);
        res.status(500).json({ message: 'Error updating vital signs', error: error.message });
    }
});

/**
 * @route DELETE /api/inpatient/vitals/:vitalId
 * @description Delete (soft delete) vital signs record
 */
router.delete('/vitals/:vitalId', async (req, res) => {
    try {
        const { vitalId } = req.params;

        // Check if vital sign exists
        const [existing] = await pool.execute(
            'SELECT vitalSignId FROM vital_signs WHERE vitalSignId = ?',
            [vitalId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Vital sign record not found' });
        }

        // Soft delete by setting a flag or hard delete
        // Since vital_signs may not have a deleted flag, we'll do a hard delete
        // If you want soft delete, add a deletedAt or isDeleted column first
        await pool.execute(
            'DELETE FROM vital_signs WHERE vitalSignId = ?',
            [vitalId]
        );

        res.status(200).json({ message: 'Vital sign record deleted successfully' });
    } catch (error) {
        console.error('Error deleting vital signs:', error);
        res.status(500).json({ message: 'Error deleting vital signs', error: error.message });
    }
});

module.exports = router;

