// Bill Waiver routes - Full CRUD operations
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { notifyBillWaived } = require('../lib/patientSms');

/**
 * Helper function to trigger workflow progression when a waiver is approved
 * This treats waived invoices as paid and moves patients to the next step
 */
async function triggerWorkflowProgression(connection, invoice, patientId, invoiceId, userId) {
    try {
        // Get invoice details including notes and items
        const [invoiceDetails] = await connection.execute(
            `SELECT i.*,
                    GROUP_CONCAT(ii.description SEPARATOR ' | ') as itemDescriptions
             FROM invoices i
             LEFT JOIN invoice_items ii ON i.invoiceId = ii.invoiceId
             WHERE i.invoiceId = ?
             GROUP BY i.invoiceId`,
            [invoiceId]
        );

        if (invoiceDetails.length === 0) return;
        const invoiceData = invoiceDetails[0];
        const notes = invoiceData.notes || '';
        const itemDescriptions = invoiceData.itemDescriptions || '';

        // Check if it's a prescription invoice - create pharmacy queue entry and complete cashier queue
        if (notes.includes('Drug payment - Prescription:') || itemDescriptions.includes('Prescription')) {
            try {
                const prescMatch = notes.match(/Prescription:\s*([A-Z0-9-]+)/);
                if (prescMatch && prescMatch[1]) {
                    const prescriptionNumber = prescMatch[1].trim();
                    const [prescriptions] = await connection.execute(
                        'SELECT prescriptionId, patientId, status FROM prescriptions WHERE prescriptionNumber = ?',
                        [prescriptionNumber]
                    );

                    if (prescriptions.length > 0 && prescriptions[0].status === 'pending') {
                        // Complete cashier queue entries for prescription payment
                        const [cashierQueues] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'cashier'
                             AND (notes LIKE ? OR notes LIKE ?)
                             AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Drug payment%`, `%Prescription: ${prescriptionNumber}%`]
                        );

                        for (const cashierQueue of cashierQueues) {
                            await connection.execute(
                                `UPDATE queue_entries
                                 SET status = 'completed', endTime = NOW(), updatedAt = NOW(),
                                     notes = CONCAT(COALESCE(notes, ''), ' - Completed: Prescription fees waived')
                                 WHERE queueId = ?`,
                                [cashierQueue.queueId]
                            );
                        }

                        // Create pharmacy queue entry
                        const [existingQueue] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'pharmacy'
                             AND notes LIKE ? AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Prescription: ${prescriptionNumber}%`]
                        );

                        if (existingQueue.length === 0) {
                            const [pharmacyCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "pharmacy"'
                            );
                            const pharmacyTicketNum = pharmacyCount[0].count + 1;
                            const pharmacyTicketNumber = `P-${String(pharmacyTicketNum).padStart(3, '0')}`;

                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, 'pharmacy', 'normal', 'waiting', ?, ?)`,
                                [patientId, pharmacyTicketNumber, `Prescription: ${prescriptionNumber} (Waived)`, userId]
                            );
                        }
                    }
                }
            } catch (pharmacyError) {
                console.error('Error creating pharmacy queue after waiver:', pharmacyError);
            }
        }

        // Check if it's a consultation fee invoice - create consultation queue entry and complete cashier queue
        if (notes.includes('Consultation charge from triage') || itemDescriptions.includes('Consultation')) {
            try {
                const triageMatch = notes.match(/triage\s+([A-Z0-9-]+)/i);
                if (triageMatch && triageMatch[1]) {
                    const triageNumber = triageMatch[1].trim();
                    const [triageAssessments] = await connection.execute(
                        `SELECT triageId, patientId, assignedToDoctorId, assignedToDepartment, triageCategory
                         FROM triage_assessments WHERE triageNumber = ?`,
                        [triageNumber]
                    );

                    if (triageAssessments.length > 0) {
                        const triage = triageAssessments[0];
                        let queuePriority = 'normal';
                        if (triage.triageCategory === 'red') queuePriority = 'emergency';
                        else if (triage.triageCategory === 'yellow') queuePriority = 'urgent';

                        // Complete cashier queue entries for consultation fees
                        const [cashierQueues] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'cashier'
                             AND (notes LIKE ? OR notes LIKE ?)
                             AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Consultation fees payment%`, `%Triage: ${triageNumber}%`]
                        );

                        for (const cashierQueue of cashierQueues) {
                            await connection.execute(
                                `UPDATE queue_entries
                                 SET status = 'completed', endTime = NOW(), updatedAt = NOW(),
                                     notes = CONCAT(COALESCE(notes, ''), ' - Completed: Consultation fees waived')
                                 WHERE queueId = ?`,
                                [cashierQueue.queueId]
                            );
                        }

                        // Create consultation queue entry
                        const [existingConsultation] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'consultation'
                             AND DATE(arrivalTime) = CURDATE()
                             AND status NOT IN ('completed', 'cancelled')`,
                            [patientId]
                        );

                        if (existingConsultation.length === 0) {
                            const [consultationCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "consultation"'
                            );
                            const consultationTicketNum = consultationCount[0].count + 1;
                            const consultationTicketNumber = `C-${String(consultationTicketNum).padStart(3, '0')}`;

                            const servicePoint = triage.assignedToDepartment || 'consultation';
                            const queueNotes = triage.assignedToDoctorId
                                ? `Assigned to doctor ID: ${triage.assignedToDoctorId} (Waived)`
                                : 'Consultation (Waived)';

                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, ?, ?, 'waiting', ?, ?)`,
                                [patientId, consultationTicketNumber, servicePoint, queuePriority, queueNotes, userId]
                            );
                        }
                    }
                }
            } catch (consultationError) {
                console.error('Error creating consultation queue after waiver:', consultationError);
            }
        }

        // Check if it's a lab test invoice - create laboratory queue entry and complete cashier queue
        if (notes.includes('Lab payment - Order:') || itemDescriptions.includes('Lab Test:')) {
            try {
                const labOrderMatch = notes.match(/Order:\s*([A-Z0-9-]+)/);
                if (labOrderMatch && labOrderMatch[1]) {
                    const orderNumber = labOrderMatch[1].trim();
                    const [labOrders] = await connection.execute(
                        'SELECT orderId, patientId, status, priority FROM lab_test_orders WHERE orderNumber = ?',
                        [orderNumber]
                    );

                    if (labOrders.length > 0 && labOrders[0].status !== 'cancelled') {
                        await connection.execute(
                            `UPDATE lab_test_orders SET status = 'pending' WHERE orderNumber = ? AND status = 'awaiting_payment'`,
                            [orderNumber]
                        );
                        // Complete cashier queue entries for lab test payment
                        const [cashierQueues] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'cashier'
                             AND (notes LIKE ? OR notes LIKE ?)
                             AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Lab payment%`, `%Order: ${orderNumber}%`]
                        );

                        for (const cashierQueue of cashierQueues) {
                            await connection.execute(
                                `UPDATE queue_entries
                                 SET status = 'completed', endTime = NOW(), updatedAt = NOW(),
                                     notes = CONCAT(COALESCE(notes, ''), ' - Completed: Lab test fees waived')
                                 WHERE queueId = ?`,
                                [cashierQueue.queueId]
                            );
                        }

                        // Create laboratory queue entry
                        const [existingQueue] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'laboratory'
                             AND notes LIKE ? AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Order: ${orderNumber}%`]
                        );

                        if (existingQueue.length === 0) {
                            const [labCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "laboratory"'
                            );
                            const labTicketNum = labCount[0].count + 1;
                            const labTicketNumber = `LAB-${String(labTicketNum).padStart(3, '0')}`;
                            const queuePriority = (labOrders[0].priority === 'stat' || labOrders[0].priority === 'urgent') ? 'urgent' : 'normal';

                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, 'laboratory', ?, 'waiting', ?, ?)`,
                                [patientId, labTicketNumber, queuePriority, `Lab Order: ${orderNumber} (Waived)`, userId]
                            );
                        }
                    }
                }
            } catch (labError) {
                console.error('Error creating laboratory queue after waiver:', labError);
            }
        }

        // Radiology invoice waived → radiology queue (same flow as lab)
        if (notes.includes('Radiology payment - Order:') || itemDescriptions.includes('Radiology Exam:')) {
            try {
                const radOrderMatch = notes.match(/Order:\s*([A-Z0-9-]+)/i);
                if (radOrderMatch && radOrderMatch[1]) {
                    const orderNumber = radOrderMatch[1].trim();
                    const [radOrders] = await connection.execute(
                        'SELECT orderId, patientId, status, priority FROM radiology_exam_orders WHERE orderNumber = ?',
                        [orderNumber]
                    );

                    if (radOrders.length > 0 && radOrders[0].status !== 'cancelled') {
                        await connection.execute(
                            `UPDATE radiology_exam_orders SET status = 'pending' WHERE orderNumber = ? AND status = 'awaiting_payment'`,
                            [orderNumber]
                        );
                        const [cashierQueues] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'cashier'
                             AND (notes LIKE ? OR notes LIKE ?)
                             AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Radiology payment%`, `%Order: ${orderNumber}%`]
                        );

                        for (const cashierQueue of cashierQueues) {
                            await connection.execute(
                                `UPDATE queue_entries
                                 SET status = 'completed', endTime = NOW(), updatedAt = NOW(),
                                     notes = CONCAT(COALESCE(notes, ''), ' - Completed: Radiology fees waived')
                                 WHERE queueId = ?`,
                                [cashierQueue.queueId]
                            );
                        }

                        const [existingRadQ] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'radiology'
                             AND notes LIKE ? AND status NOT IN ('completed', 'cancelled')`,
                            [patientId, `%Order: ${orderNumber}%`]
                        );

                        if (existingRadQ.length === 0) {
                            const [radCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "radiology"'
                            );
                            const radTicketNum = radCount[0].count + 1;
                            const radTicketNumber = `RX-${String(radTicketNum).padStart(3, '0')}`;
                            const radPriority = radOrders[0].priority;
                            const queuePriority = radPriority === 'stat' || radPriority === 'urgent' ? 'urgent' : 'normal';

                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, 'radiology', ?, 'waiting', ?, ?)`,
                                [patientId, radTicketNumber, queuePriority, `Radiology Order: ${orderNumber} (Waived)`, userId]
                            );
                        }
                    }
                }
            } catch (radError) {
                console.error('Error creating radiology queue after waiver:', radError);
            }
        }

        // Check if it's registration fees - create triage queue entry
        if (notes.includes('Registration fees') || itemDescriptions.includes('Registration')) {
            try {
                const [existingTriage] = await connection.execute(
                    `SELECT queueId FROM queue_entries
                     WHERE patientId = ? AND servicePoint = 'triage'
                     AND DATE(arrivalTime) = CURDATE()
                     AND status NOT IN ('completed', 'cancelled')`,
                    [patientId]
                );

                if (existingTriage.length === 0) {
                    const [triageCount] = await connection.execute(
                        'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "triage"'
                    );
                    const triageTicketNum = triageCount[0].count + 1;
                    const triageTicketNumber = `T-${String(triageTicketNum).padStart(3, '0')}`;

                    await connection.execute(
                        `INSERT INTO queue_entries
                        (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                        VALUES (?, ?, 'triage', 'normal', 'waiting', ?, ?)`,
                        [patientId, triageTicketNumber, 'Registration fees waived', userId]
                    );
                }
            } catch (triageError) {
                console.error('Error creating triage queue after waiver:', triageError);
            }
        }
    } catch (error) {
        console.error('Error in workflow progression after waiver:', error);
        // Don't throw - workflow progression failure shouldn't fail waiver creation
    }
}

/**
 * @route GET /api/waivers/types
 * @description Get all waiver types
 */
router.get('/types', async (req, res) => {
    try {
        const { isActive, responsibility } = req.query;

        let query = 'SELECT * FROM waiver_types WHERE 1=1';
        const params = [];

        if (isActive !== undefined) {
            query += ' AND isActive = ?';
            params.push(isActive === 'true' ? 1 : 0);
        } else {
            query += ' AND isActive = 1'; // Default: only active
        }

        if (responsibility) {
            query += ' AND responsibility = ?';
            params.push(responsibility);
        }

        query += ' ORDER BY typeName ASC';

        const [types] = await pool.execute(query, params);
        res.status(200).json(types);
    } catch (error) {
        console.error('Error fetching waiver types:', error);
        res.status(500).json({ message: 'Error fetching waiver types', error: error.message });
    }
});

/**
 * @route GET /api/waivers/types/:id
 * @description Get a single waiver type
 */
router.get('/types/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [types] = await pool.execute(
            'SELECT * FROM waiver_types WHERE waiverTypeId = ?',
            [id]
        );

        if (types.length === 0) {
            return res.status(404).json({ message: 'Waiver type not found' });
        }

        res.status(200).json(types[0]);
    } catch (error) {
        console.error('Error fetching waiver type:', error);
        res.status(500).json({ message: 'Error fetching waiver type', error: error.message });
    }
});

/**
 * @route POST /api/waivers/types
 * @description Create a new waiver type
 */
router.post('/types', async (req, res) => {
    try {
        const {
            typeCode,
            typeName,
            description,
            responsibility,
            requiresApproval,
            maxAmount,
            maxPercentage,
            requiresReason,
            isActive,
            createdBy
        } = req.body;

        if (!typeCode || !typeName || !responsibility) {
            return res.status(400).json({ message: 'Missing required fields: typeCode, typeName, responsibility' });
        }

        // Check if type code already exists
        const [existing] = await pool.execute(
            'SELECT waiverTypeId FROM waiver_types WHERE typeCode = ?',
            [typeCode]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Waiver type with this code already exists' });
        }

        const [result] = await pool.execute(
            `INSERT INTO waiver_types (
                typeCode, typeName, description, responsibility, requiresApproval,
                maxAmount, maxPercentage, requiresReason, isActive, createdBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                typeCode,
                typeName,
                description || null,
                responsibility,
                requiresApproval !== undefined ? requiresApproval : true,
                maxAmount || null,
                maxPercentage || null,
                requiresReason !== undefined ? requiresReason : true,
                isActive !== undefined ? isActive : true,
                createdBy || null
            ]
        );

        const [newType] = await pool.execute(
            'SELECT * FROM waiver_types WHERE waiverTypeId = ?',
            [result.insertId]
        );

        res.status(201).json(newType[0]);
    } catch (error) {
        console.error('Error creating waiver type:', error);
        res.status(500).json({ message: 'Error creating waiver type', error: error.message });
    }
});

/**
 * @route PUT /api/waivers/types/:id
 * @description Update a waiver type
 */
router.put('/types/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            typeName,
            description,
            responsibility,
            requiresApproval,
            maxAmount,
            maxPercentage,
            requiresReason,
            isActive
        } = req.body;

        // Check if type exists
        const [existing] = await pool.execute(
            'SELECT waiverTypeId FROM waiver_types WHERE waiverTypeId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Waiver type not found' });
        }

        await pool.execute(
            `UPDATE waiver_types SET
                typeName = COALESCE(?, typeName),
                description = COALESCE(?, description),
                responsibility = COALESCE(?, responsibility),
                requiresApproval = COALESCE(?, requiresApproval),
                maxAmount = COALESCE(?, maxAmount),
                maxPercentage = COALESCE(?, maxPercentage),
                requiresReason = COALESCE(?, requiresReason),
                isActive = COALESCE(?, isActive),
                updatedAt = CURRENT_TIMESTAMP
            WHERE waiverTypeId = ?`,
            [
                typeName,
                description,
                responsibility,
                requiresApproval,
                maxAmount,
                maxPercentage,
                requiresReason,
                isActive,
                id
            ]
        );

        const [updated] = await pool.execute(
            'SELECT * FROM waiver_types WHERE waiverTypeId = ?',
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating waiver type:', error);
        res.status(500).json({ message: 'Error updating waiver type', error: error.message });
    }
});

/**
 * @route GET /api/waivers
 * @description Get all bill waivers
 */
router.get('/', async (req, res) => {
    try {
        const { status, responsibility, waiverTypeId, patientId, invoiceId, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT bw.*,
                   i.invoiceNumber, i.invoiceDate, i.totalAmount as invoiceTotal,
                   pt.patientId, pt.firstName, pt.lastName, pt.patientNumber,
                   req.firstName as requestedByFirstName, req.lastName as requestedByLastName,
                   app.firstName as approvedByFirstName, app.lastName as approvedByLastName,
                   rej.firstName as rejectedByFirstName, rej.lastName as rejectedByLastName,
                   staff.firstName as responsibleStaffFirstName, staff.lastName as responsibleStaffLastName
            FROM bill_waivers bw
            LEFT JOIN invoices i ON bw.invoiceId = i.invoiceId
            LEFT JOIN patients pt ON bw.patientId = pt.patientId
            LEFT JOIN users req ON bw.requestedBy = req.userId
            LEFT JOIN users app ON bw.approvedBy = app.userId
            LEFT JOIN users rej ON bw.rejectedBy = rej.userId
            LEFT JOIN users staff ON bw.responsibleStaffId = staff.userId
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND bw.status = ?';
            params.push(status);
        }

        if (responsibility) {
            query += ' AND bw.responsibility = ?';
            params.push(responsibility);
        }

        if (waiverTypeId) {
            query += ' AND bw.waiverTypeId = ?';
            params.push(waiverTypeId);
        }

        if (patientId) {
            query += ' AND bw.patientId = ?';
            params.push(patientId);
        }

        if (invoiceId) {
            query += ' AND bw.invoiceId = ?';
            params.push(invoiceId);
        }

        if (search) {
            query += ` AND (
                bw.waiverNumber LIKE ? OR
                i.invoiceNumber LIKE ? OR
                pt.firstName LIKE ? OR
                pt.lastName LIKE ? OR
                pt.patientNumber LIKE ? OR
                bw.waiverTypeName LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY bw.requestedAt DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [waivers] = await pool.execute(query, params);
        res.status(200).json(waivers);
    } catch (error) {
        console.error('Error fetching waivers:', error);
        res.status(500).json({ message: 'Error fetching waivers', error: error.message });
    }
});

/**
 * @route GET /api/waivers/:id
 * @description Get a single waiver with full details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [waivers] = await pool.execute(
            `SELECT bw.*,
                    i.invoiceNumber, i.invoiceDate, i.totalAmount as invoiceTotal, i.status as invoiceStatus,
                    pt.patientId, pt.firstName, pt.lastName, pt.patientNumber,
                    req.firstName as requestedByFirstName, req.lastName as requestedByLastName,
                    app.firstName as approvedByFirstName, app.lastName as approvedByLastName,
                    rej.firstName as rejectedByFirstName, rej.lastName as rejectedByLastName,
                    staff.firstName as responsibleStaffFirstName, staff.lastName as responsibleStaffLastName,
                    wt.typeCode, wt.typeName, wt.description as waiverTypeDescription
             FROM bill_waivers bw
             LEFT JOIN invoices i ON bw.invoiceId = i.invoiceId
             LEFT JOIN patients pt ON bw.patientId = pt.patientId
             LEFT JOIN users req ON bw.requestedBy = req.userId
             LEFT JOIN users app ON bw.approvedBy = app.userId
             LEFT JOIN users rej ON bw.rejectedBy = rej.userId
             LEFT JOIN users staff ON bw.responsibleStaffId = staff.userId
             LEFT JOIN waiver_types wt ON bw.waiverTypeId = wt.waiverTypeId
             WHERE bw.waiverId = ?`,
            [id]
        );

        if (waivers.length === 0) {
            return res.status(404).json({ message: 'Waiver not found' });
        }

        // Get approval history
        const [history] = await pool.execute(
            `SELECT wah.*,
                    u.firstName, u.lastName
             FROM waiver_approval_history wah
             LEFT JOIN users u ON wah.performedBy = u.userId
             WHERE wah.waiverId = ?
             ORDER BY wah.performedAt ASC`,
            [id]
        );

        // Get staff payments if applicable
        const [payments] = await pool.execute(
            `SELECT wsp.*,
                    u.firstName, u.lastName,
                    rec.firstName as recordedByFirstName, rec.lastName as recordedByLastName
             FROM waiver_staff_payments wsp
             LEFT JOIN users u ON wsp.staffId = u.userId
             LEFT JOIN users rec ON wsp.recordedBy = rec.userId
             WHERE wsp.waiverId = ?
             ORDER BY wsp.paymentDate DESC`,
            [id]
        );

        const waiver = waivers[0];
        waiver.approvalHistory = history;
        waiver.staffPayments = payments;

        res.status(200).json(waiver);
    } catch (error) {
        console.error('Error fetching waiver:', error);
        res.status(500).json({ message: 'Error fetching waiver', error: error.message });
    }
});

/**
 * @route POST /api/waivers
 * @description Create a new bill waiver
 */
router.post('/', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            invoiceId,
            patientId,
            waiverTypeId,
            waivedAmount,
            waiverPercentage,
            reason,
            justification,
            supportingDocuments,
            responsibleStaffId,
            externalPartyName,
            externalPartyContact,
            externalPartyNotes,
            notes,
            requestedBy
        } = req.body;

        console.log('Creating waiver with data:', {
            invoiceId,
            patientId,
            waiverTypeId,
            waivedAmount,
            reason: reason ? 'provided' : 'missing',
            requestedBy
        });

        // Validate required fields
        if (!invoiceId || !patientId || !waiverTypeId || !reason || !requestedBy) {
            await connection.rollback();
            const missing = [];
            if (!invoiceId) missing.push('invoiceId');
            if (!patientId) missing.push('patientId');
            if (!waiverTypeId) missing.push('waiverTypeId');
            if (!reason) missing.push('reason');
            if (!requestedBy) missing.push('requestedBy');

            console.error('Missing required fields:', missing);
            return res.status(400).json({
                message: `Missing required fields: ${missing.join(', ')}`,
                missing: missing
            });
        }

        // Get invoice details
        const [invoices] = await connection.execute(
            'SELECT invoiceId, totalAmount, balance, status FROM invoices WHERE invoiceId = ?',
            [invoiceId]
        );

        if (invoices.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        // Get waiver type details
        const [waiverTypes] = await connection.execute(
            'SELECT * FROM waiver_types WHERE waiverTypeId = ? AND isActive = 1',
            [waiverTypeId]
        );

        if (waiverTypes.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Waiver type not found or inactive' });
        }

        const waiverType = waiverTypes[0];

        // Calculate waived amount
        let finalWaivedAmount = waivedAmount;
        let finalPercentage = waiverPercentage;

        if (waiverPercentage && !waivedAmount) {
            finalWaivedAmount = (invoice.totalAmount * waiverPercentage) / 100;
            finalPercentage = waiverPercentage;
        } else if (waivedAmount && !waiverPercentage) {
            finalPercentage = (waivedAmount / invoice.totalAmount) * 100;
        }

        // Validate against waiver type limits
        if (waiverType.maxAmount && finalWaivedAmount > waiverType.maxAmount) {
            await connection.rollback();
            return res.status(400).json({
                message: `Waived amount exceeds maximum allowed (${waiverType.maxAmount})`
            });
        }

        if (waiverType.maxPercentage && finalPercentage > waiverType.maxPercentage) {
            await connection.rollback();
            return res.status(400).json({
                message: `Waiver percentage exceeds maximum allowed (${waiverType.maxPercentage}%)`
            });
        }

        // Check if waived amount exceeds invoice balance
        if (finalWaivedAmount > invoice.balance) {
            await connection.rollback();
            return res.status(400).json({
                message: 'Waived amount cannot exceed invoice balance'
            });
        }

        const remainingAmount = invoice.balance - finalWaivedAmount;
        const isFullWaiver = remainingAmount <= 0.01; // Account for rounding

        // Generate waiver number
        const year = new Date().getFullYear();
        const [lastWaiver] = await connection.execute(
            `SELECT waiverNumber FROM bill_waivers
             WHERE waiverNumber LIKE ?
             ORDER BY waiverNumber DESC LIMIT 1`,
            [`WAIV-${year}-%`]
        );

        let waiverNumber;
        if (lastWaiver.length > 0) {
            const lastNum = parseInt(lastWaiver[0].waiverNumber.split('-')[2]);
            waiverNumber = `WAIV-${year}-${String(lastNum + 1).padStart(5, '0')}`;
        } else {
            waiverNumber = `WAIV-${year}-00001`;
        }

        // Determine status based on waiver type requirements
        const status = waiverType.requiresApproval ? 'pending' : 'approved';

        // Insert waiver
        const [result] = await connection.execute(
            `INSERT INTO bill_waivers (
                waiverNumber, invoiceId, patientId, waiverTypeId, waiverTypeCode, waiverTypeName, responsibility,
                originalAmount, waivedAmount, remainingAmount, waiverPercentage, isFullWaiver,
                reason, justification, supportingDocuments, status, requestedBy,
                responsibleStaffId, paymentStatus, paymentDueDate, paymentAmount,
                externalPartyName, externalPartyContact, externalPartyNotes, notes, createdBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                waiverNumber,
                invoiceId,
                patientId,
                waiverTypeId,
                waiverType.typeCode,
                waiverType.typeName,
                waiverType.responsibility,
                invoice.balance,
                finalWaivedAmount,
                remainingAmount,
                finalPercentage,
                isFullWaiver,
                reason,
                justification || null,
                supportingDocuments ? JSON.stringify(supportingDocuments) : null,
                status,
                requestedBy,
                waiverType.responsibility === 'staff' ? (responsibleStaffId || requestedBy) : null,
                waiverType.responsibility === 'staff' ? 'pending' : null,
                waiverType.responsibility === 'staff' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null,
                waiverType.responsibility === 'staff' ? finalWaivedAmount : null,
                waiverType.responsibility === 'external' ? (externalPartyName || null) : null,
                waiverType.responsibility === 'external' ? (externalPartyContact || null) : null,
                waiverType.responsibility === 'external' ? (externalPartyNotes || null) : null,
                notes || null,
                requestedBy
            ]
        );

        // Update invoice balance
        await connection.execute(
            'UPDATE invoices SET balance = balance - ?, updatedAt = CURRENT_TIMESTAMP WHERE invoiceId = ?',
            [finalWaivedAmount, invoiceId]
        );

        // Update invoice status - set to "waived" if fully waived, "partial" if partially waived
        if (isFullWaiver) {
            await connection.execute(
                'UPDATE invoices SET status = "waived", updatedAt = CURRENT_TIMESTAMP WHERE invoiceId = ?',
                [invoiceId]
            );
        } else if (invoice.balance - finalWaivedAmount > 0) {
            await connection.execute(
                'UPDATE invoices SET status = "partial", updatedAt = CURRENT_TIMESTAMP WHERE invoiceId = ?',
                [invoiceId]
            );
        }

        // Add to approval history
        await connection.execute(
            `INSERT INTO waiver_approval_history (
                waiverId, action, performedBy, previousStatus, newStatus, notes
            ) VALUES (?, 'requested', ?, NULL, ?, ?)`,
            [result.insertId, requestedBy, status, 'Waiver request submitted']
        );

        // If auto-approved, add approval history and trigger workflow
        if (status === 'approved') {
            await connection.execute(
                `INSERT INTO waiver_approval_history (
                    waiverId, action, performedBy, previousStatus, newStatus, notes
                ) VALUES (?, 'approved', ?, 'pending', 'approved', ?)`,
                [result.insertId, requestedBy, 'Auto-approved (no approval required)']
            );

            await connection.execute(
                'UPDATE bill_waivers SET approvedBy = ?, approvedAt = CURRENT_TIMESTAMP WHERE waiverId = ?',
                [requestedBy, result.insertId]
            );

            // Trigger workflow progression (waived = paid)
            await triggerWorkflowProgression(connection, invoice, patientId, invoiceId, requestedBy);
        }

        await connection.commit();

        const [newWaiver] = await pool.execute(
            `SELECT bw.*,
                    i.invoiceNumber, i.invoiceDate,
                    pt.firstName, pt.lastName, pt.patientNumber
             FROM bill_waivers bw
             LEFT JOIN invoices i ON bw.invoiceId = i.invoiceId
             LEFT JOIN patients pt ON bw.patientId = pt.patientId
             WHERE bw.waiverId = ?`,
            [result.insertId]
        );

        if (status === 'approved' && patientId) {
            notifyBillWaived(patientId, {
                waiverAmount: newWaiver[0]?.waiverAmount,
                invoiceNumber: newWaiver[0]?.invoiceNumber,
            });
        }

        res.status(201).json(newWaiver[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating waiver:', error);
        console.error('Error stack:', error.stack);
        console.error('Request body:', JSON.stringify(req.body, null, 2));
        res.status(500).json({
            message: 'Error creating waiver',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/waivers/:id/approve
 * @description Approve a waiver
 */
router.put('/:id/approve', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { approvedBy, notes } = req.body;

        if (!approvedBy) {
            await connection.rollback();
            return res.status(400).json({ message: 'Missing required field: approvedBy' });
        }

        // Get waiver
        const [waivers] = await connection.execute(
            'SELECT * FROM bill_waivers WHERE waiverId = ?',
            [id]
        );

        if (waivers.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Waiver not found' });
        }

        const waiver = waivers[0];

        if (waiver.status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ message: `Cannot approve waiver with status: ${waiver.status}` });
        }

        // Update waiver
        await connection.execute(
            `UPDATE bill_waivers SET
                status = 'approved',
                approvedBy = ?,
                approvedAt = CURRENT_TIMESTAMP,
                updatedAt = CURRENT_TIMESTAMP
            WHERE waiverId = ?`,
            [approvedBy, id]
        );

        // Add to approval history
        await connection.execute(
            `INSERT INTO waiver_approval_history (
                waiverId, action, performedBy, previousStatus, newStatus, notes
            ) VALUES (?, 'approved', ?, ?, 'approved', ?)`,
            [id, approvedBy, waiver.status, notes || 'Waiver approved']
        );

        // Get invoice details for workflow progression
        const [invoiceDetails] = await connection.execute(
            'SELECT * FROM invoices WHERE invoiceId = ?',
            [waiver.invoiceId]
        );

        if (invoiceDetails.length > 0) {
            const invoice = invoiceDetails[0];
            // Update invoice status to "waived" if fully waived
            if (waiver.isFullWaiver) {
                await connection.execute(
                    'UPDATE invoices SET status = "waived", updatedAt = CURRENT_TIMESTAMP WHERE invoiceId = ?',
                    [waiver.invoiceId]
                );
            }
            // Trigger workflow progression (waived = paid)
            await triggerWorkflowProgression(connection, invoice, waiver.patientId, waiver.invoiceId, approvedBy);
        }

        await connection.commit();

        const [updated] = await pool.execute(
            `SELECT bw.*,
                    i.invoiceNumber,
                    pt.firstName, pt.lastName, pt.patientNumber
             FROM bill_waivers bw
             LEFT JOIN invoices i ON bw.invoiceId = i.invoiceId
             LEFT JOIN patients pt ON bw.patientId = pt.patientId
             WHERE bw.waiverId = ?`,
            [id]
        );

        if (waiver.patientId) {
            notifyBillWaived(waiver.patientId, {
                waiverAmount: waiver.waiverAmount ?? updated[0]?.waiverAmount,
                invoiceNumber: updated[0]?.invoiceNumber,
            });
        }

        res.status(200).json(updated[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error approving waiver:', error);
        res.status(500).json({ message: 'Error approving waiver', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/waivers/:id/reject
 * @description Reject a waiver
 */
router.put('/:id/reject', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { rejectedBy, rejectionReason } = req.body;

        if (!rejectedBy || !rejectionReason) {
            await connection.rollback();
            return res.status(400).json({ message: 'Missing required fields: rejectedBy, rejectionReason' });
        }

        // Get waiver
        const [waivers] = await connection.execute(
            'SELECT * FROM bill_waivers WHERE waiverId = ?',
            [id]
        );

        if (waivers.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Waiver not found' });
        }

        const waiver = waivers[0];

        if (waiver.status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ message: `Cannot reject waiver with status: ${waiver.status}` });
        }

        // Revert invoice balance
        await connection.execute(
            'UPDATE invoices SET balance = balance + ?, updatedAt = CURRENT_TIMESTAMP WHERE invoiceId = ?',
            [waiver.waivedAmount, waiver.invoiceId]
        );

        // Update waiver
        await connection.execute(
            `UPDATE bill_waivers SET
                status = 'rejected',
                rejectedBy = ?,
                rejectedAt = CURRENT_TIMESTAMP,
                rejectionReason = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE waiverId = ?`,
            [rejectedBy, rejectionReason, id]
        );

        // Add to approval history
        await connection.execute(
            `INSERT INTO waiver_approval_history (
                waiverId, action, performedBy, previousStatus, newStatus, notes
            ) VALUES (?, 'rejected', ?, ?, 'rejected', ?)`,
            [id, rejectedBy, waiver.status, rejectionReason]
        );

        await connection.commit();

        const [updated] = await pool.execute(
            `SELECT bw.*,
                    i.invoiceNumber,
                    pt.firstName, pt.lastName, pt.patientNumber
             FROM bill_waivers bw
             LEFT JOIN invoices i ON bw.invoiceId = i.invoiceId
             LEFT JOIN patients pt ON bw.patientId = pt.patientId
             WHERE bw.waiverId = ?`,
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error rejecting waiver:', error);
        res.status(500).json({ message: 'Error rejecting waiver', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route POST /api/waivers/:id/staff-payment
 * @description Record a staff payment for a staff-responsible waiver
 */
router.post('/:id/staff-payment', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { paymentAmount, paymentDate, paymentMethod, paymentReference, receiptNumber, notes, recordedBy } = req.body;

        if (!paymentAmount || !paymentDate || !recordedBy) {
            await connection.rollback();
            return res.status(400).json({ message: 'Missing required fields: paymentAmount, paymentDate, recordedBy' });
        }

        // Get waiver
        const [waivers] = await connection.execute(
            'SELECT * FROM bill_waivers WHERE waiverId = ? AND responsibility = "staff"',
            [id]
        );

        if (waivers.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Waiver not found or not staff-responsible' });
        }

        const waiver = waivers[0];

        // Insert payment
        const [result] = await connection.execute(
            `INSERT INTO waiver_staff_payments (
                waiverId, staffId, paymentAmount, paymentDate, paymentMethod,
                paymentReference, receiptNumber, notes, recordedBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                waiver.responsibleStaffId,
                paymentAmount,
                paymentDate,
                paymentMethod || null,
                paymentReference || null,
                receiptNumber || null,
                notes || null,
                recordedBy
            ]
        );

        // Calculate total paid
        const [payments] = await connection.execute(
            'SELECT SUM(paymentAmount) as totalPaid FROM waiver_staff_payments WHERE waiverId = ?',
            [id]
        );

        const totalPaid = parseFloat(payments[0].totalPaid || 0);

        // Update waiver payment status
        let paymentStatus = 'partial';
        if (totalPaid >= waiver.paymentAmount) {
            paymentStatus = 'paid';
        }

        await connection.execute(
            `UPDATE bill_waivers SET
                paymentStatus = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE waiverId = ?`,
            [paymentStatus, id]
        );

        // Add to approval history
        await connection.execute(
            `INSERT INTO waiver_approval_history (
                waiverId, action, performedBy, notes
            ) VALUES (?, 'payment_recorded', ?, ?)`,
            [id, recordedBy, `Payment of ${paymentAmount} recorded`]
        );

        if (paymentStatus === 'paid') {
            await connection.execute(
                `INSERT INTO waiver_approval_history (
                    waiverId, action, performedBy, notes
                ) VALUES (?, 'payment_completed', ?, 'Full payment received')`,
                [id, recordedBy]
            );
        }

        await connection.commit();

        const [newPayment] = await pool.execute(
            `SELECT wsp.*,
                    u.firstName, u.lastName,
                    rec.firstName as recordedByFirstName, rec.lastName as recordedByLastName
             FROM waiver_staff_payments wsp
             LEFT JOIN users u ON wsp.staffId = u.userId
             LEFT JOIN users rec ON wsp.recordedBy = rec.userId
             WHERE wsp.paymentId = ?`,
            [result.insertId]
        );

        res.status(201).json(newPayment[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error recording staff payment:', error);
        res.status(500).json({ message: 'Error recording staff payment', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route GET /api/waivers/patients/outstanding
 * @description Get patients with outstanding bills
 */
router.get('/patients/outstanding', async (req, res) => {
    try {
        const { search } = req.query;

        let query = `
            SELECT DISTINCT
                p.patientId,
                p.patientNumber,
                p.firstName,
                p.lastName,
                p.phone,
                COUNT(DISTINCT i.invoiceId) as invoiceCount,
                SUM(i.balance) as totalOutstanding
            FROM patients p
            INNER JOIN invoices i ON p.patientId = i.patientId
            WHERE i.status IN ('pending', 'partial')
              AND i.balance > 0
        `;
        const params = [];

        if (search) {
            query += ` AND (
                p.firstName LIKE ? OR
                p.lastName LIKE ? OR
                p.patientNumber LIKE ? OR
                p.phone LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += `
            GROUP BY p.patientId, p.patientNumber, p.firstName, p.lastName, p.phone
            HAVING totalOutstanding > 0
            ORDER BY totalOutstanding DESC, p.lastName ASC, p.firstName ASC
            LIMIT 100
        `;

        const [patients] = await pool.execute(query, params);
        res.status(200).json(patients);
    } catch (error) {
        console.error('Error fetching patients with outstanding bills:', error);
        res.status(500).json({ message: 'Error fetching patients', error: error.message });
    }
});

/**
 * @route GET /api/waivers/stats/summary
 * @description Get waiver statistics
 */
router.get('/stats/summary', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let dateFilter = '';
        const params = [];

        if (startDate && endDate) {
            dateFilter = 'WHERE bw.requestedAt BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Total waivers
        const [totalWaivers] = await pool.execute(
            `SELECT COUNT(*) as count FROM bill_waivers bw ${dateFilter}`,
            params
        );

        // Total waived amount
        const [totalWaived] = await pool.execute(
            `SELECT SUM(waivedAmount) as total FROM bill_waivers bw ${dateFilter}`,
            params
        );

        // By status
        const [byStatus] = await pool.execute(
            `SELECT status, COUNT(*) as count, SUM(waivedAmount) as total
             FROM bill_waivers bw ${dateFilter}
             GROUP BY status`,
            params
        );

        // By responsibility
        const [byResponsibility] = await pool.execute(
            `SELECT responsibility, COUNT(*) as count, SUM(waivedAmount) as total
             FROM bill_waivers bw ${dateFilter}
             GROUP BY responsibility`,
            params
        );

        // By waiver type
        const [byType] = await pool.execute(
            `SELECT waiverTypeName, COUNT(*) as count, SUM(waivedAmount) as total
             FROM bill_waivers bw ${dateFilter}
             GROUP BY waiverTypeName
             ORDER BY total DESC
             LIMIT 10`,
            params
        );

        res.status(200).json({
            totalWaivers: totalWaivers[0].count,
            totalWaivedAmount: parseFloat(totalWaived[0].total || 0),
            byStatus,
            byResponsibility,
            byType
        });
    } catch (error) {
        console.error('Error fetching waiver stats:', error);
        res.status(500).json({ message: 'Error fetching waiver stats', error: error.message });
    }
});

module.exports = router;

