// Radiology routes - Full CRUD operations
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { notifyRadiologyReportReady } = require('../lib/patientSms');

/**
 * @route GET /api/radiology/exam-types
 * @description Get all radiology exam types
 */
router.get('/exam-types', async (req, res) => {
    try {
        const { search, category, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM radiology_exam_types WHERE 1=1';
        const params = [];

        if (search) {
            query += ` AND (examName LIKE ? OR examCode LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        if (category) {
            query += ` AND category = ?`;
            params.push(category);
        }

        query += ` ORDER BY examName LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching radiology exam types:', error);
        res.status(500).json({ message: 'Error fetching radiology exam types', error: error.message });
    }
});

/**
 * @route GET /api/radiology/exam-types/:id
 * @description Get a single radiology exam type
 */
router.get('/exam-types/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM radiology_exam_types WHERE examTypeId = ?',
            [req.params.id]
        );

        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Radiology exam type not found' });
        }
    } catch (error) {
        console.error('Error fetching radiology exam type:', error);
        res.status(500).json({ message: 'Error fetching radiology exam type', error: error.message });
    }
});

/**
 * @route POST /api/radiology/exam-types
 * @description Create a new radiology exam type
 */
router.post('/exam-types', async (req, res) => {
    try {
        const examData = req.body;
        const [result] = await pool.execute(
            `INSERT INTO radiology_exam_types (examCode, examName, category, duration, cost, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                examData.examCode || null,
                examData.examName,
                examData.category || null,
                examData.duration || null,
                examData.cost || examData.unitPrice || null,
                examData.description || null
            ]
        );

        const [newExam] = await pool.execute(
            'SELECT * FROM radiology_exam_types WHERE examTypeId = ?',
            [result.insertId]
        );

        res.status(201).json(newExam[0]);
    } catch (error) {
        console.error('Error creating radiology exam type:', error);
        res.status(500).json({ message: 'Error creating radiology exam type', error: error.message });
    }
});

/**
 * @route PUT /api/radiology/exam-types/:id
 * @description Update a radiology exam type
 */
router.put('/exam-types/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const examData = req.body;

        // Check if exam type exists
        const [existing] = await pool.execute(
            'SELECT examTypeId FROM radiology_exam_types WHERE examTypeId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Radiology exam type not found' });
        }

        const updates = [];
        const values = [];

        if (examData.examCode !== undefined) { updates.push('examCode = ?'); values.push(examData.examCode || null); }
        if (examData.examName !== undefined) { updates.push('examName = ?'); values.push(examData.examName); }
        if (examData.category !== undefined) { updates.push('category = ?'); values.push(examData.category || null); }
        if (examData.duration !== undefined) { updates.push('duration = ?'); values.push(examData.duration || null); }
        if (examData.cost !== undefined) { updates.push('cost = ?'); values.push(examData.cost || null); }
        if (examData.unitPrice !== undefined) { updates.push('cost = ?'); values.push(examData.unitPrice || null); }
        if (examData.description !== undefined) { updates.push('description = ?'); values.push(examData.description || null); }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(id);

        await pool.execute(
            `UPDATE radiology_exam_types SET ${updates.join(', ')}, updatedAt = NOW() WHERE examTypeId = ?`,
            values
        );

        const [updated] = await pool.execute(
            'SELECT * FROM radiology_exam_types WHERE examTypeId = ?',
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating radiology exam type:', error);
        res.status(500).json({ message: 'Error updating radiology exam type', error: error.message });
    }
});

/**
 * @route DELETE /api/radiology/exam-types/:id
 * @description Delete a radiology exam type
 */
router.delete('/exam-types/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if exam type exists
        const [existing] = await pool.execute(
            'SELECT * FROM radiology_exam_types WHERE examTypeId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Radiology exam type not found' });
        }

        // Delete the exam type
        await pool.execute(
            'DELETE FROM radiology_exam_types WHERE examTypeId = ?',
            [id]
        );

        res.status(200).json({
            message: 'Radiology exam type deleted successfully',
            examTypeId: id
        });
    } catch (error) {
        console.error('Error deleting radiology exam type:', error);
        res.status(500).json({ message: 'Error deleting radiology exam type', error: error.message });
    }
});

/**
 * @route GET /api/radiology/orders
 * @description Get radiology exam orders.
 * When `patientId` is omitted and `status` is omitted, excludes `awaiting_payment` (work queue only).
 */
router.get('/orders', async (req, res) => {
    try {
        const { patientId, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT ro.*,
                   pt.firstName, pt.lastName, pt.patientNumber,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName,
                   ret.examName, ret.examCode, ret.category
            FROM radiology_exam_orders ro
            LEFT JOIN patients pt ON ro.patientId = pt.patientId
            LEFT JOIN users u ON ro.orderedBy = u.userId
            LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
            WHERE 1=1
        `;
        const params = [];

        if (patientId) {
            query += ` AND ro.patientId = ?`;
            params.push(patientId);
        }

        if (status) {
            query += ` AND ro.status = ?`;
            params.push(status);
        } else if (!patientId) {
            // Imaging work list: unpaid orders (awaiting_payment) stay at cashier — do not list here
            query += ` AND ro.status != 'awaiting_payment'`;
        }

        query += ` ORDER BY ro.orderDate DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching radiology orders:', error);
        res.status(500).json({ message: 'Error fetching radiology orders', error: error.message });
    }
});

/**
 * @route POST /api/radiology/orders
 * @description Create a new radiology exam order
 */
router.post('/orders', async (req, res) => {
    const connection = await pool.getConnection();
    const userId = req.user?.id || req.user?.userId || null;
    try {
        await connection.beginTransaction();

        const { orderNumber, patientId, orderedBy, examTypeId, orderDate, bodyPart, clinicalIndication, priority, status, scheduledDate, notes, admissionId } = req.body;

        // Get exam type details (including cost for billing) to include in clinical indication
        let examName = null;
        let examTypeRow = null;
        if (examTypeId) {
            const [examType] = await connection.execute(
                'SELECT examName, examCode, cost FROM radiology_exam_types WHERE examTypeId = ?',
                [examTypeId]
            );
            if (examType.length > 0) {
                examTypeRow = examType[0];
                examName = examTypeRow.examName;
            }
        }

        // Build clinical indication: include exam name if provided, then append user's clinical indication
        let finalClinicalIndication = clinicalIndication || null;
        if (examName) {
            if (finalClinicalIndication && finalClinicalIndication.trim()) {
                // If clinical indication is provided, prepend exam name
                finalClinicalIndication = `${examName}: ${finalClinicalIndication.trim()}`;
            } else {
                // If no clinical indication, use exam name as default
                finalClinicalIndication = examName;
            }
        }

        // Generate order number if not provided
        let orderNum = orderNumber;
        if (!orderNum) {
            // Get the maximum order number to avoid duplicates
            const [maxResult] = await connection.execute(
                `SELECT MAX(CAST(SUBSTRING(orderNumber, 5) AS UNSIGNED)) as maxNum
                 FROM radiology_exam_orders
                 WHERE orderNumber LIKE 'RAD-%'`
            );

            let nextNum = (maxResult[0]?.maxNum || 0) + 1;
            orderNum = `RAD-${String(nextNum).padStart(6, '0')}`;
        }

        let result;
        let insertAttempts = 0;
        let finalOrderNum = orderNum;

        // Try to insert with retry logic for duplicate key errors
        while (insertAttempts < 100) {
            // First check if the number exists before trying to insert
            const [existing] = await connection.execute(
                'SELECT orderId FROM radiology_exam_orders WHERE orderNumber = ?',
                [finalOrderNum]
            );

            if (existing.length > 0) {
                // Number exists, extract current number and increment
                const currentNum = parseInt(finalOrderNum.substring(4)) || 0;
                const nextNum = currentNum + 1;
                finalOrderNum = `RAD-${String(nextNum).padStart(6, '0')}`;
                insertAttempts++;

                if (insertAttempts >= 100) {
                    await connection.rollback();
                    return res.status(500).json({
                        message: 'Failed to generate unique radiology order number',
                        error: 'Please try again.'
                    });
                }
                // Continue to check next number
                continue;
            }

            // Number doesn't exist, try to insert
            try {
                // Try to insert with admissionId if provided (column may or may not exist)
                // If column doesn't exist, MySQL will throw an error which we'll handle
                if (admissionId) {
                    try {
                        [result] = await connection.execute(
                            `INSERT INTO radiology_exam_orders (orderNumber, patientId, admissionId, orderedBy, examTypeId, orderDate, bodyPart, clinicalIndication, priority, status, scheduledDate, notes)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [finalOrderNum, patientId, admissionId, orderedBy, examTypeId, orderDate || new Date(), bodyPart || null, finalClinicalIndication, priority || 'routine', status || 'pending', scheduledDate || null, notes || null]
                        );
                    } catch (colError) {
                        // If admissionId column doesn't exist (error code 1054), fall back to query without it
                        if (colError.code === 'ER_BAD_FIELD_ERROR' || colError.errno === 1054) {
                            [result] = await connection.execute(
                                `INSERT INTO radiology_exam_orders (orderNumber, patientId, orderedBy, examTypeId, orderDate, bodyPart, clinicalIndication, priority, status, scheduledDate, notes)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [finalOrderNum, patientId, orderedBy, examTypeId, orderDate || new Date(), bodyPart || null, finalClinicalIndication, priority || 'routine', status || 'pending', scheduledDate || null, notes || null]
                            );
                        } else {
                            throw colError; // Re-throw if it's a different error
                        }
                    }
                } else {
                    [result] = await connection.execute(
                        `INSERT INTO radiology_exam_orders (orderNumber, patientId, orderedBy, examTypeId, orderDate, bodyPart, clinicalIndication, priority, status, scheduledDate, notes)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [finalOrderNum, patientId, orderedBy, examTypeId, orderDate || new Date(), bodyPart || null, finalClinicalIndication, priority || 'routine', status || 'pending', scheduledDate || null, notes || null]
                    );
                }
                // Success - break out of retry loop
                break;
            } catch (insertError) {
                // Check if it's a duplicate key error (race condition - another request inserted it)
                if (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062) {
                    // Extract current number and increment
                    const currentNum = parseInt(finalOrderNum.substring(4)) || 0;
                    const nextNum = currentNum + 1;
                    finalOrderNum = `RAD-${String(nextNum).padStart(6, '0')}`;
                    insertAttempts++;

                    if (insertAttempts >= 100) {
                        await connection.rollback();
                        return res.status(500).json({
                            message: 'Failed to generate unique radiology order number',
                            error: 'Please try again.'
                        });
                    }
                    // Continue to retry with new number
                } else {
                    // Not a duplicate key error - rethrow
                    await connection.rollback();
                    throw insertError;
                }
            }
        }

        const orderId = result.insertId;

        // Invoice + cashier queue at order time (patient pays before radiology queue / service)
        const invoiceTotal = examTypeRow ? parseFloat(examTypeRow.cost || 0) : 0;
        if (invoiceTotal > 0) {
            await connection.execute(
                `UPDATE radiology_exam_orders SET status = 'awaiting_payment' WHERE orderId = ?`,
                [orderId]
            );

            const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const datePrefix = `INV-${today}-`;
            const [maxInv] = await connection.execute(
                `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                 FROM invoices WHERE invoiceNumber LIKE CONCAT(?, '%')`,
                [datePrefix]
            );
            let nextInv = (maxInv[0]?.maxNum || 0) + 1;
            let invoiceNumber = `${datePrefix}${String(nextInv).padStart(4, '0')}`;

            const invoiceNotes = `Radiology payment - Order: ${finalOrderNum}${admissionId ? ` (Admission ${admissionId})` : ''}`;

            const [invResult] = await connection.execute(
                `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, totalAmount, balance, status, notes, createdBy)
                 VALUES (?, ?, CURDATE(), ?, ?, 'pending', ?, ?)`,
                [invoiceNumber, patientId, invoiceTotal, invoiceTotal, invoiceNotes, userId]
            );
            const invoiceId = invResult.insertId;

            const itemDescription = `Radiology Exam: ${examTypeRow.examName || 'Exam'} (${examTypeRow.examCode || 'N/A'}) - Order ${finalOrderNum}`;
            await connection.execute(
                `INSERT INTO invoice_items (invoiceId, description, quantity, unitPrice, totalPrice)
                 VALUES (?, ?, 1, ?, ?)`,
                [invoiceId, itemDescription, invoiceTotal, invoiceTotal]
            );

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
                const ticketNumber = `C-${String((cashierCount[0]?.count || 0) + 1).padStart(3, '0')}`;
                const queuePriority = (priority === 'stat' || priority === 'urgent') ? 'urgent' : 'normal';
                await connection.execute(
                    `INSERT INTO queue_entries (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                     VALUES (?, ?, 'cashier', ?, 'waiting', ?, ?)`,
                    [patientId, ticketNumber, queuePriority, `Radiology payment - Order: ${finalOrderNum}`, userId]
                );
            }
        }

        const [newOrder] = await connection.execute(
            `SELECT ro.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    ret.examName, ret.examCode, ret.category
             FROM radiology_exam_orders ro
             LEFT JOIN patients pt ON ro.patientId = pt.patientId
             LEFT JOIN users u ON ro.orderedBy = u.userId
             LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
             WHERE ro.orderId = ?`,
            [orderId]
        );

        await connection.commit();
        res.status(201).json(newOrder[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating radiology order:', error);
        res.status(500).json({ message: 'Error creating radiology order', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route GET /api/radiology/orders/:id
 * @description Get a single radiology exam order with details
 */
router.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get order with patient and doctor info
        const [orders] = await pool.execute(
            `SELECT ro.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    ret.examCode, ret.examName, ret.category
             FROM radiology_exam_orders ro
             LEFT JOIN patients pt ON ro.patientId = pt.patientId
             LEFT JOIN users u ON ro.orderedBy = u.userId
             LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
             WHERE ro.orderId = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ message: 'Radiology order not found' });
        }

        res.status(200).json(orders[0]);
    } catch (error) {
        console.error('Error fetching radiology order:', error);
        res.status(500).json({ message: 'Error fetching radiology order', error: error.message });
    }
});

/**
 * @route PUT /api/radiology/orders/:id
 * @description Update a radiology exam order
 */
router.put('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, scheduledDate, notes, priority, clinicalIndication, bodyPart, examTypeId } = req.body;

        // Check if order exists and get current exam type
        const [existing] = await pool.execute(
            'SELECT examTypeId, clinicalIndication, status, orderNumber FROM radiology_exam_orders WHERE orderId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Radiology order not found' });
        }

        const currentRowStatus = existing[0].status;

        // Fees must be paid (cashier) before radiology work / results — same pattern as laboratory
        if (currentRowStatus === 'awaiting_payment') {
            if (status !== undefined && status !== 'awaiting_payment' && status !== 'cancelled') {
                return res.status(400).json({
                    message: 'Radiology fees must be paid (cashier) before the order can be advanced.',
                    code: 'RADIOLOGY_AWAITING_PAYMENT',
                    orderNumber: existing[0].orderNumber,
                });
            }
            if (notes !== undefined && notes !== null && String(notes).trim() !== '') {
                return res.status(400).json({
                    message: 'Radiology fees must be paid (cashier) before results or notes can be recorded.',
                    code: 'RADIOLOGY_AWAITING_PAYMENT',
                    orderNumber: existing[0].orderNumber,
                });
            }
        }

        // Build update query
        const updates = [];
        const values = [];

        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }

        if (priority !== undefined) {
            updates.push('priority = ?');
            values.push(priority);
        }

        // Handle clinical indication: ensure it includes exam name
        let finalClinicalIndication = clinicalIndication;
        if (clinicalIndication !== undefined) {
            // Determine which exam type to use (new one if being updated, otherwise current one)
            const targetExamTypeId = examTypeId !== undefined ? examTypeId : existing[0].examTypeId;

            // Get exam name
            const [examType] = await pool.execute(
                'SELECT examName FROM radiology_exam_types WHERE examTypeId = ?',
                [targetExamTypeId]
            );

            if (examType.length > 0 && examType[0].examName) {
                const examName = examType[0].examName;
                if (clinicalIndication && clinicalIndication.trim()) {
                    // Check if clinical indication already starts with exam name
                    if (clinicalIndication.trim().startsWith(examName + ':')) {
                        // Already has exam name, use as-is
                        finalClinicalIndication = clinicalIndication.trim();
                    } else {
                        // Prepend exam name
                        finalClinicalIndication = `${examName}: ${clinicalIndication.trim()}`;
                    }
                } else {
                    // No clinical indication provided, use exam name
                    finalClinicalIndication = examName;
                }
            } else {
                finalClinicalIndication = clinicalIndication || null;
            }

            updates.push('clinicalIndication = ?');
            values.push(finalClinicalIndication);
        } else if (examTypeId !== undefined && examTypeId !== existing[0].examTypeId) {
            // Exam type is being changed but clinical indication not provided
            // Update clinical indication to include new exam name
            const [examType] = await pool.execute(
                'SELECT examName FROM radiology_exam_types WHERE examTypeId = ?',
                [examTypeId]
            );
            if (examType.length > 0 && examType[0].examName) {
                const examName = examType[0].examName;
                const currentIndication = existing[0].clinicalIndication;
                // Extract the part after the colon if it exists
                if (currentIndication && currentIndication.includes(':')) {
                    const parts = currentIndication.split(':');
                    finalClinicalIndication = `${examName}: ${parts.slice(1).join(':').trim()}`;
                } else {
                    finalClinicalIndication = examName;
                }
                updates.push('clinicalIndication = ?');
                values.push(finalClinicalIndication);
            }
        }

        if (bodyPart !== undefined) {
            updates.push('bodyPart = ?');
            values.push(bodyPart || null);
        }

        if (examTypeId !== undefined) {
            updates.push('examTypeId = ?');
            values.push(examTypeId);
        }

        if (scheduledDate !== undefined) {
            updates.push('scheduledDate = ?');
            values.push(scheduledDate || null);
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
            `UPDATE radiology_exam_orders SET ${updates.join(', ')} WHERE orderId = ?`,
            values
        );

        // Fetch updated order
        const [updated] = await pool.execute(
            `SELECT ro.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    ret.examCode, ret.examName, ret.category
             FROM radiology_exam_orders ro
             LEFT JOIN patients pt ON ro.patientId = pt.patientId
             LEFT JOIN users u ON ro.orderedBy = u.userId
             LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
             WHERE ro.orderId = ?`,
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating radiology order:', error);
        res.status(500).json({ message: 'Error updating radiology order', error: error.message });
    }
});

/**
 * @route GET /api/radiology/reports
 * @description Stored radiology reports (joined exams + orders + patients)
 */
router.get('/reports', async (req, res) => {
    try {
        const {
            patientId,
            search,
            dateFrom,
            dateTo,
            page = 1,
            limit = 50,
        } = req.query;
        const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

        let query = `
            SELECT
                rr.reportId,
                rr.reportDate,
                rr.findings,
                rr.impression,
                rr.recommendations,
                rr.status AS reportStatus,
                rr.reportedBy,
                ur.firstName AS reportedByFirstName,
                ur.lastName AS reportedByLastName,
                re.examId,
                re.examDate,
                re.status AS examStatus,
                re.technicianId,
                ro.orderId,
                ro.orderNumber,
                ro.patientId,
                ro.clinicalIndication AS orderClinicalIndication,
                ro.bodyPart,
                pt.firstName,
                pt.lastName,
                pt.patientNumber,
                ret.examCode,
                ret.examName,
                ret.category
            FROM radiology_reports rr
            INNER JOIN radiology_exams re ON rr.examId = re.examId
            INNER JOIN radiology_exam_orders ro ON re.orderId = ro.orderId
            LEFT JOIN patients pt ON ro.patientId = pt.patientId
            LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
            LEFT JOIN users ur ON rr.reportedBy = ur.userId
            WHERE 1=1
        `;
        const params = [];

        if (patientId) {
            query += ' AND ro.patientId = ?';
            params.push(patientId);
        }
        if (dateFrom) {
            query += ' AND rr.reportDate >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND rr.reportDate <= ?';
            params.push(dateTo);
        }
        if (search) {
            const term = `%${search}%`;
            query += ` AND (
                ro.orderNumber LIKE ? OR pt.patientNumber LIKE ?
                OR CONCAT(COALESCE(pt.firstName,''), ' ', COALESCE(pt.lastName,'')) LIKE ?
                OR ret.examName LIKE ? OR rr.findings LIKE ? OR rr.impression LIKE ?
            )`;
            params.push(term, term, term, term, term, term);
        }

        query += ` ORDER BY rr.reportDate DESC, rr.reportId DESC LIMIT ${lim} OFFSET ${offset}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching radiology reports:', error);
        res.status(500).json({ message: 'Error fetching radiology reports', error: error.message });
    }
});

/**
 * @route POST /api/radiology/orders/:orderId/complete-report
 * @description Create/update performed exam + final report; mark order completed
 */
router.post('/orders/:orderId/complete-report', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { orderId } = req.params;
        const {
            findings,
            impression,
            recommendations,
            examDate,
            technicianId,
            performedBy,
            reportedBy,
            queueId,
        } = req.body;

        const [orders] = await connection.execute(
            'SELECT orderId, patientId, status, orderNumber FROM radiology_exam_orders WHERE orderId = ?',
            [orderId]
        );
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Radiology order not found' });
        }
        const orderRow = orders[0];
        if (orderRow.status === 'awaiting_payment') {
            await connection.rollback();
            return res.status(400).json({
                message: 'Radiology fees must be paid before recording a report.',
                code: 'RADIOLOGY_AWAITING_PAYMENT',
                orderNumber: orderRow.orderNumber,
            });
        }
        if (orderRow.status === 'cancelled') {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot record report for a cancelled order.' });
        }

        const reporter = reportedBy ? parseInt(reportedBy, 10) : null;
        if (!reporter) {
            await connection.rollback();
            return res.status(400).json({ message: 'reportedBy (user id) is required' });
        }

        const examWhen = examDate ? new Date(examDate) : new Date();
        const reportDay = examWhen.toISOString().slice(0, 10);

        const [existingExams] = await connection.execute(
            'SELECT examId FROM radiology_exams WHERE orderId = ? ORDER BY examId DESC LIMIT 1',
            [orderId]
        );

        let examId;
        if (existingExams.length > 0) {
            examId = existingExams[0].examId;
            await connection.execute(
                `UPDATE radiology_exams SET examDate = ?, technicianId = ?, performedBy = ?, status = 'completed', updatedAt = NOW()
                 WHERE examId = ?`,
                [
                    examWhen,
                    technicianId || null,
                    performedBy || reporter || null,
                    examId,
                ]
            );
        } else {
            const [ins] = await connection.execute(
                `INSERT INTO radiology_exams (orderId, examDate, performedBy, technicianId, status, notes)
                 VALUES (?, ?, ?, ?, 'completed', NULL)`,
                [orderId, examWhen, performedBy || reporter || null, technicianId || null]
            );
            examId = ins.insertId;
        }

        const [existingReports] = await connection.execute(
            'SELECT reportId FROM radiology_reports WHERE examId = ? ORDER BY reportId DESC LIMIT 1',
            [examId]
        );

        if (existingReports.length > 0) {
            await connection.execute(
                `UPDATE radiology_reports SET reportDate = ?, findings = ?, impression = ?, recommendations = ?,
                 reportedBy = ?, status = 'final', updatedAt = NOW() WHERE reportId = ?`,
                [
                    reportDay,
                    findings || null,
                    impression || null,
                    recommendations || null,
                    reporter,
                    existingReports[0].reportId,
                ]
            );
        } else {
            await connection.execute(
                `INSERT INTO radiology_reports (examId, reportDate, findings, impression, recommendations, reportedBy, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'final')`,
                [
                    examId,
                    reportDay,
                    findings || null,
                    impression || null,
                    recommendations || null,
                    reporter,
                ]
            );
        }

        const summaryParts = [];
        if (findings && String(findings).trim()) summaryParts.push(`Findings:\n${findings.trim()}`);
        if (impression && String(impression).trim()) summaryParts.push(`Impression:\n${impression.trim()}`);
        if (recommendations && String(recommendations).trim()) {
            summaryParts.push(`Recommendations:\n${recommendations.trim()}`);
        }
        const notesSummary = summaryParts.join('\n\n');

        await connection.execute(
            `UPDATE radiology_exam_orders SET status = 'completed', notes = ?, updatedAt = NOW() WHERE orderId = ?`,
            [notesSummary || null, orderId]
        );

        if (queueId) {
            await connection.execute(
                `UPDATE queue_entries SET status = 'completed', endTime = NOW(), updatedAt = NOW() WHERE queueId = ? AND patientId = ?`,
                [queueId, orderRow.patientId]
            );
        }

        const [out] = await connection.execute(
            `SELECT ro.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    ret.examCode, ret.examName, ret.category
             FROM radiology_exam_orders ro
             LEFT JOIN patients pt ON ro.patientId = pt.patientId
             LEFT JOIN users u ON ro.orderedBy = u.userId
             LEFT JOIN radiology_exam_types ret ON ro.examTypeId = ret.examTypeId
             WHERE ro.orderId = ?`,
            [orderId]
        );

        await connection.commit();

        if (out[0]?.patientId) {
            notifyRadiologyReportReady(out[0].patientId, {
                orderNumber: out[0].orderNumber,
            });
        }

        res.status(200).json({ order: out[0], examId, message: 'Report saved' });
    } catch (error) {
        await connection.rollback();
        console.error('Error completing radiology report:', error);
        res.status(500).json({ message: 'Error completing radiology report', error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
