// Patient management routes
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { resolveRegistrationFeeAmount } = require('../utils/registrationFee');
const {
  resolveFacilityScope,
  buildPatientFacilityFilter,
  patientBelongsToScope,
  resolveBranchForRequest,
  getRequestUserId,
} = require('../lib/branchContext');

/**
 * @route GET /api/patients
 * @description Get patients visible to the caller's facility profile
 */
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 25, branchId } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 25));
        const offset = (pageNum - 1) * limitNum;
        const scope = await resolveFacilityScope(pool, req);

        // Prefer columns used by the list UI over SELECT *
        let query = `
            SELECT patientId, patientNumber, firstName, lastName, middleName,
                   dateOfBirth, gender, phone, email, address, county, subcounty, ward,
                   idNumber, idType, bloodGroup, createdAt, patientType, registeredBranchId
            FROM patients
            WHERE voided = 0
        `;
        const params = [];

        if (scope.canAccessAllBranches && branchId) {
            query += ` AND registeredBranchId = ?`;
            params.push(Number(branchId));
        } else {
            const filter = buildPatientFacilityFilter(scope, 'registeredBranchId');
            query += filter.clause;
            params.push(...filter.params);
        }

        if (search) {
            query += ` AND (
                firstName LIKE ? OR lastName LIKE ? OR patientNumber LIKE ? OR phone LIKE ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?
                OR email LIKE ? OR idNumber LIKE ? OR CONCAT(firstName, ' ', lastName) LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            const compactSearchTerm = `%${String(search).replace(/[\s-]/g, '')}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, compactSearchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY createdAt DESC LIMIT ${limitNum} OFFSET ${offset}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({ message: 'Error fetching patients', error: error.message });
    }
});

/**
 * @route GET /api/patients/vitals/today
 * @description Get all vital signs recorded today
 */
router.get('/vitals/today', async (req, res) => {
    try {
        const query = `
            SELECT vs.*,
                   p.patientId,
                   p.patientNumber,
                   p.firstName as patientFirstName,
                   p.lastName as patientLastName,
                   CONCAT(p.firstName, ' ', p.lastName) as patientName,
                   u.firstName as recordedByFirstName,
                   u.lastName as recordedByLastName
            FROM vital_signs vs
            LEFT JOIN patients p ON vs.patientId = p.patientId
            LEFT JOIN users u ON vs.recordedBy = u.userId
            WHERE DATE(vs.recordedDate) = CURDATE()
            ORDER BY vs.recordedDate DESC
        `;

        const [rows] = await pool.execute(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching today\'s vital signs:', error);
        res.status(500).json({ message: 'Error fetching today\'s vital signs', error: error.message });
    }
});

/**
 * @route GET /api/patients/:id
 * @description Get a single patient by ID
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const scope = await resolveFacilityScope(pool, req);
        const [rows] = await pool.execute(
            'SELECT * FROM patients WHERE patientId = ? AND voided = 0',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        if (!patientBelongsToScope(scope, rows[0].registeredBranchId)) {
            // Doctors may open patients booked for them (or open bookings) from other facilities
            const rn = String(scope.roleName || '').toLowerCase();
            const isDoctorLike =
                rn === 'doctor' ||
                rn.includes('telemedicine') ||
                rn.includes('clinical_officer') ||
                rn.includes('medical_officer') ||
                rn.includes('clinician');
            let allowedViaBooking = false;
            if (isDoctorLike && scope.userId) {
                const [bookingRows] = await pool.execute(
                    `SELECT appointmentId
                     FROM appointments
                     WHERE patientId = ?
                       AND (doctorId = ? OR doctorId IS NULL)
                       AND status NOT IN ('cancelled', 'no_show')
                     LIMIT 1`,
                    [id, scope.userId]
                );
                allowedViaBooking = Boolean(bookingRows[0]);
            }
            if (!allowedViaBooking) {
                return res.status(403).json({
                    message: 'This patient belongs to another facility and is not visible on your facility profile.',
                });
            }
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching patient:', error);
        res.status(500).json({ message: 'Error fetching patient', error: error.message });
    }
});

/**
 * @route POST /api/patients
 * @description Create a new patient
 */
router.post('/', async (req, res) => {
    const patientData = req.body;
    const userId = getRequestUserId(req) || req.user?.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Generate patient number if not provided
        if (!patientData.patientNumber) {
            const [count] = await connection.execute('SELECT COUNT(*) as count FROM patients');
            patientData.patientNumber = `P-${String(count[0].count + 1).padStart(6, '0')}`;
        }

        // Stamp registration facility from request body or X-Branch-Id header (multi-facility).
        // Facility-scoped users are forced onto their current/assigned facility.
        const scope = await resolveFacilityScope(connection, req, { userId, body: patientData });
        let registeredBranchId =
            Number(patientData.registeredBranchId || patientData.branchId || patientData.currentBranchId) || null;
        if (!registeredBranchId) {
            registeredBranchId = scope.currentBranchId || null;
        }
        if (!scope.canAccessAllBranches) {
            registeredBranchId = scope.currentBranchId || scope.branchIds[0] || registeredBranchId;
            if (registeredBranchId && !patientBelongsToScope(scope, registeredBranchId)) {
                await connection.rollback();
                return res.status(403).json({
                    message: 'You can only register patients to your assigned facility.',
                });
            }
        }
        if (!registeredBranchId) {
            const branch = await resolveBranchForRequest(connection, req, { userId, body: patientData });
            registeredBranchId = branch?.branchId || null;
        }

        const [result] = await connection.execute(
            `INSERT INTO patients (
                registeredBranchId, patientNumber, firstName, lastName, middleName, dateOfBirth, gender, patientType, insuranceCompanyId, insuranceNumber,
                phone, email, address, county, subcounty, ward, idNumber, idType,
                nextOfKinName, nextOfKinPhone, nextOfKinRelationship,
                bloodGroup, allergies, medicalHistory, createdBy, voided
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                registeredBranchId,
                patientData.patientNumber || null,
                patientData.firstName,
                patientData.lastName,
                patientData.middleName || null,
                patientData.dateOfBirth || null,
                patientData.gender || null,
                patientData.patientType || 'paying',
                patientData.insuranceCompanyId || null,
                patientData.insuranceNumber || null,
                patientData.phone || null,
                patientData.email || null,
                patientData.address || null,
                patientData.county || null,
                patientData.subcounty || null,
                patientData.ward || null,
                patientData.idNumber || null,
                patientData.idType || null,
                patientData.nextOfKinName || null,
                patientData.nextOfKinPhone || null,
                patientData.nextOfKinRelationship || null,
                patientData.bloodGroup || null,
                patientData.allergies || null,
                patientData.medicalHistory || null,
                userId || null
            ]
        );

        const patientId = result.insertId;

        // After patient registration: optional registration fee invoice + cashier (only if REG-FEE amount > 0)
        try {
            const { amount: registrationFeeAmount, chargeId } = await resolveRegistrationFeeAmount(connection);

            if (registrationFeeAmount <= 0) {
                console.log(
                    `[REGISTRATION] No registration fee invoice for patient ${patientId} ` +
                        `(REG-FEE missing, inactive, or amount is 0 — set charge > 0 in service charges to enable).`
                );
            }

            if (registrationFeeAmount > 0 && chargeId) {
            // Generate invoice number (same approach as triage numbers to avoid duplicates)
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const datePrefix = `INV-${today}-`;

            // Get the maximum invoice number for today (extract the numeric part after last dash)
            const [maxResult] = await connection.execute(
                `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                 FROM invoices
                 WHERE invoiceNumber LIKE CONCAT(?, '%')`,
                [datePrefix]
            );

            let nextNum = (maxResult[0]?.maxNum || 0) + 1;
            let invoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;

            // Check if this number already exists (safety check for race conditions)
            let attempts = 0;
            while (attempts < 100) {
                const [existing] = await connection.execute(
                    'SELECT invoiceId FROM invoices WHERE invoiceNumber = ?',
                    [invoiceNumber]
                );

                if (existing.length === 0) {
                    break; // Number is available
                }
                // Number exists, try next one
                nextNum++;
                invoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;
                attempts++;
            }

            if (attempts >= 100) {
                await connection.rollback();
                connection.release();
                return res.status(500).json({
                    message: 'Failed to generate unique invoice number',
                    error: 'Please try again.'
                });
            }

            // Create invoice for registration fee (with retry on duplicate key error)
            let invoiceResult;
            try {
                [invoiceResult] = await connection.execute(
                    `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, totalAmount, balance, status, notes, createdBy)
                     VALUES (?, ?, CURDATE(), ?, ?, 'pending', ?, ?)`,
                    [
                        invoiceNumber,
                        patientId,
                        registrationFeeAmount,
                        registrationFeeAmount, // balance = totalAmount initially
                        'Registration fee payment',
                        userId || null
                    ]
                );
            } catch (insertError) {
                // Handle duplicate key error - find next available number
                if (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062) {
                    // Get max number and find next available
                    const [retryMaxResult] = await connection.execute(
                        `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                         FROM invoices
                         WHERE invoiceNumber LIKE CONCAT(?, '%')`,
                        [datePrefix]
                    );

                    let retryNum = (retryMaxResult[0]?.maxNum || 0) + 1;
                    let foundAvailable = false;
                    let retryAttempts = 0;

                    while (!foundAvailable && retryAttempts < 100) {
                        const testNumber = `${datePrefix}${String(retryNum).padStart(4, '0')}`;
                        const [existing] = await connection.execute(
                            'SELECT invoiceId FROM invoices WHERE invoiceNumber = ?',
                            [testNumber]
                        );

                        if (existing.length === 0) {
                            invoiceNumber = testNumber;
                            foundAvailable = true;
                        } else {
                            retryNum++;
                            retryAttempts++;
                        }
                    }

                    if (!foundAvailable) {
                        await connection.rollback();
                        connection.release();
                        return res.status(500).json({
                            message: 'Failed to generate unique invoice number',
                            error: 'Please try again.'
                        });
                    }

                    // Retry insert with new number
                    [invoiceResult] = await connection.execute(
                        `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, totalAmount, balance, status, notes, createdBy)
                         VALUES (?, ?, CURDATE(), ?, ?, 'pending', ?, ?)`,
                        [
                            invoiceNumber,
                            patientId,
                            registrationFeeAmount,
                            registrationFeeAmount,
                            'Registration fee payment',
                            userId || null
                        ]
                    );
                } else {
                    throw insertError; // Re-throw if it's not a duplicate key error
                }
            }

            const invoiceId = invoiceResult.insertId;

            // Create invoice item
            await connection.execute(
                `INSERT INTO invoice_items (invoiceId, chargeId, description, quantity, unitPrice, totalPrice)
                 VALUES (?, ?, ?, 1, ?, ?)`,
                [
                    invoiceId,
                    chargeId,
                    'Patient Registration Fee',
                    registrationFeeAmount,
                    registrationFeeAmount
                ]
            );

            // Check if patient already exists in cashier queue (unlikely for new patients, but check anyway)
            const [existingQueue] = await connection.execute(
                `SELECT queueId FROM queue_entries
                 WHERE patientId = ? AND servicePoint = 'cashier'
                 AND status IN ('waiting', 'called', 'serving')`,
                [patientId]
            );

            if (existingQueue.length === 0) {
                // Patient not in cashier queue, add them
                const [cashierCount] = await connection.execute(
                    'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "cashier"'
                );
                const cashierTicketNum = cashierCount[0].count + 1;
                const cashierTicketNumber = `C-${String(cashierTicketNum).padStart(3, '0')}`;

                // Create queue entry for cashier (registration fees payment)
                await connection.execute(
                    `INSERT INTO queue_entries
                    (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                    VALUES (?, ?, 'cashier', 'normal', 'waiting', ?, ?)`,
                    [
                        patientId,
                        cashierTicketNumber,
                        'Registration fees payment',
                        userId || null
                    ]
                );
            } else {
                console.log(`Patient ${patientId} already exists in cashier queue (queueId: ${existingQueue[0].queueId}) - skipping duplicate entry during registration`);
            }

            } // end registration fee invoice + cashier (amount > 0)

            // Add patient to triage queue after registration (always when registration succeeds)
            try {
                // Check if patient already exists in triage queue
                const [existingTriageQueue] = await connection.execute(
                    `SELECT queueId FROM queue_entries
                     WHERE patientId = ? AND servicePoint = 'triage'
                     AND status IN ('waiting', 'called', 'serving')`,
                    [patientId]
                );

                if (existingTriageQueue.length === 0) {
                    // Patient not in triage queue, add them
                    const [triageCount] = await connection.execute(
                        'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "triage"'
                    );
                    const triageTicketNum = triageCount[0].count + 1;
                    const triageTicketNumber = `T-${String(triageTicketNum).padStart(3, '0')}`;

                    // Create queue entry for triage
                    await connection.execute(
                        `INSERT INTO queue_entries
                        (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                        VALUES (?, ?, 'triage', 'normal', 'waiting', ?, ?)`,
                        [
                            patientId,
                            triageTicketNumber,
                            'New patient registration - requires triage',
                            userId || null
                        ]
                    );
                    console.log(`Patient ${patientId} added to triage queue with ticket ${triageTicketNumber}`);
                } else {
                    console.log(`Patient ${patientId} already exists in triage queue (queueId: ${existingTriageQueue[0].queueId}) - skipping duplicate entry during registration`);
                }
            } catch (triageQueueError) {
                // Log error but don't fail patient registration if triage queue creation fails
                console.error('Error adding patient to triage queue after registration:', triageQueueError);
                // Continue with patient registration even if triage queue creation fails
            }
        } catch (queueError) {
            // Log error but don't fail patient registration if queue/invoice creation fails
            console.error('Error creating invoice and cashier queue after patient registration:', queueError);
            // Rollback only the invoice/queue creation, but keep patient registration
            // We'll let the transaction continue since patient registration is the main operation
        }

        // If patient is registered as insurance, create insurance policy automatically
        if (patientData.patientType === 'insurance' && patientData.insuranceCompanyId) {
            try {
                // Check if policy already exists for this patient and provider
                const [existingPolicy] = await connection.execute(
                    'SELECT patientInsuranceId FROM patient_insurance WHERE patientId = ? AND providerId = ?',
                    [patientId, patientData.insuranceCompanyId]
                );

                if (existingPolicy.length === 0) {
                    // Create insurance policy automatically
                    const policyNumber = patientData.insuranceNumber || `POL-${patientId}`;
                    const memberId = patientData.insuranceNumber || null;

                    await connection.execute(
                        `INSERT INTO patient_insurance (
                            patientId, providerId, policyNumber, memberId,
                            coverageStartDate, isActive, notes
                        ) VALUES (?, ?, ?, ?, CURDATE(), 1, ?)`,
                        [
                            patientId,
                            patientData.insuranceCompanyId,
                            policyNumber,
                            memberId,
                            `Auto-created policy from patient registration. Insurance Number: ${patientData.insuranceNumber || 'N/A'}`
                        ]
                    );
                    console.log(`Auto-created insurance policy for patient ${patientId}`);
                }
            } catch (insuranceError) {
                // Log error but don't fail patient registration
                console.error('Error auto-creating insurance policy:', insuranceError);
                // Continue with patient registration even if policy creation fails
            }
        }

        await connection.commit();

        const [newPatient] = await connection.execute(
            'SELECT * FROM patients WHERE patientId = ?',
            [patientId]
        );

        connection.release();
        res.status(201).json(newPatient[0]);
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error creating patient:', error);
        res.status(500).json({ message: 'Error creating patient', error: error.message });
    }
});

/**
 * @route PUT /api/patients/:id
 * @description Update a patient
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const patientData = req.body;

    try {
        const updates = [];
        const values = [];

        Object.keys(patientData).forEach(key => {
            // Prevent updating voided, patientId, createdAt, createdBy through this endpoint
            // voided should only be changed via DELETE endpoint
            if (patientData[key] !== undefined &&
                key !== 'patientId' &&
                key !== 'voided' &&
                key !== 'createdAt' &&
                key !== 'createdBy') {
                updates.push(`${key} = ?`);
                values.push(patientData[key]);
            }
        });

        // Ensure voided is always 0 on update
        updates.push('voided = 0');

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        await pool.execute(
            `UPDATE patients SET ${updates.join(', ')}, updatedAt = NOW() WHERE patientId = ?`,
            values
        );

        const [updated] = await pool.execute(
            'SELECT * FROM patients WHERE patientId = ?',
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({ message: 'Error updating patient', error: error.message });
    }
});

/**
 * @route DELETE /api/patients/:id
 * @description Soft delete a patient (set voided = 1)
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
        // Check if patient exists and is not already voided
        const [existing] = await pool.execute(
            'SELECT * FROM patients WHERE patientId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        if (existing[0].voided === 1) {
            return res.status(400).json({ message: 'Patient is already deleted' });
        }

        // Soft delete: set voided = 1
        await pool.execute(
            'UPDATE patients SET voided = 1, updatedAt = NOW() WHERE patientId = ?',
            [id]
        );

        res.status(200).json({
            message: 'Patient deleted successfully',
            patientId: id
        });
    } catch (error) {
        console.error('Error deleting patient:', error);
        res.status(500).json({ message: 'Error deleting patient', error: error.message });
    }
});

/**
 * @route GET /api/patients/:id/vitals
 * @description Get patient vital signs (optionally filtered by date)
 */
router.get('/:id/vitals', async (req, res) => {
    const { id } = req.params;
    const { date, today } = req.query;

    try {
        let query = `
            SELECT vs.*,
                   u.firstName as recordedByFirstName,
                   u.lastName as recordedByLastName
            FROM vital_signs vs
            LEFT JOIN users u ON vs.recordedBy = u.userId
            WHERE vs.patientId = ?
        `;
        const params = [id];

        if (today === 'true' || date) {
            if (today === 'true') {
                query += ` AND DATE(vs.recordedDate) = CURDATE()`;
            } else {
                query += ` AND DATE(vs.recordedDate) = ?`;
                params.push(date);
            }
        }

        // Enough rows for trend charts on patient detail (was 10)
        query += ` ORDER BY vs.recordedDate DESC LIMIT 200`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching patient vitals:', error);
        res.status(500).json({ message: 'Error fetching patient vitals', error: error.message });
    }
});

module.exports = router;

