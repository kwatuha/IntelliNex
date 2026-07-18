// NOTE: Only one request should be sent to check for critical alerts per opened encounter form.
// The system will check only the last recorded vitals or lab results to flag a patient as critical.
// If you observe multiple requests or a continuous loading indicator in the critical alerts section,
// ensure that only a single check is triggered per new vital/lab entry (or when the form is first opened).
// You may need to debounce or throttle client requests and verify backend logic to prevent redundant checks.
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const {
    generateDocumentNumber,
    findFifoBatchForStore,
    deductInventoryBatch,
    receiveInventoryAtStore,
    buildTransferBatchNumber,
    buildStoreInventoryFilter,
    buildBranchStoreInventoryFilter,
    branchInventoryFilterParams,
} = require('../lib/drugMovement');
const {
    notifyPharmacyStaff,
    checkStoreReorderLevels,
    getStoreStockQuantity,
} = require('../lib/pharmacyNotifications');
const { notifyPrescriptionReady } = require('../lib/patientSms');

/**
 * @route GET /api/pharmacy/medications
 * @description Get all medications
 */
router.get('/medications', async (req, res) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM medications WHERE voided = 0';
        const params = [];

        if (search) {
            query += ` AND (name LIKE ? OR genericName LIKE ? OR medicationCode LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY name LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching medications:', error);
        res.status(500).json({ message: 'Error fetching medications', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/medications/:id
 * @description Get a single medication by ID
 */
router.get('/medications/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM medications WHERE medicationId = ? AND voided = 0',
            [req.params.id]
        );

        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Medication not found' });
        }
    } catch (error) {
        console.error('Error fetching medication:', error);
        res.status(500).json({ message: 'Error fetching medication', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/medications
 * @description Create a new medication
 */
router.post('/medications', async (req, res) => {
    try {
        const medicationData = req.body;
        const [result] = await pool.execute(
            `INSERT INTO medications (medicationCode, name, genericName, dosageForm, strength, category, manufacturer, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                medicationData.medicationCode || null,
                medicationData.name || medicationData.medicationName || null,
                medicationData.genericName || null,
                medicationData.dosageForm || null,
                medicationData.strength || null,
                medicationData.category || null,
                medicationData.manufacturer || null,
                medicationData.description || null
            ]
        );

        const [newMedication] = await pool.execute(
            'SELECT * FROM medications WHERE medicationId = ?',
            [result.insertId]
        );

        res.status(201).json(newMedication[0]);
    } catch (error) {
        console.error('Error creating medication:', error);
        res.status(500).json({ message: 'Error creating medication', error: error.message });
    }
});

/**
 * @route PUT /api/pharmacy/medications/:id
 * @description Update a medication
 */
router.put('/medications/:id', async (req, res) => {
    try {
        const updates = [];
        const values = [];
        const medicationData = req.body;

        // Map fields correctly (medicationName -> name)
        if (medicationData.name !== undefined) {
            updates.push('name = ?');
            values.push(medicationData.name);
        } else if (medicationData.medicationName !== undefined) {
            updates.push('name = ?');
            values.push(medicationData.medicationName);
        }

        if (medicationData.medicationCode !== undefined) {
            updates.push('medicationCode = ?');
            values.push(medicationData.medicationCode || null);
        }
        if (medicationData.genericName !== undefined) {
            updates.push('genericName = ?');
            values.push(medicationData.genericName || null);
        }
        if (medicationData.dosageForm !== undefined) {
            updates.push('dosageForm = ?');
            values.push(medicationData.dosageForm || null);
        }
        if (medicationData.strength !== undefined) {
            updates.push('strength = ?');
            values.push(medicationData.strength || null);
        }
        if (medicationData.category !== undefined) {
            updates.push('category = ?');
            values.push(medicationData.category || null);
        }
        if (medicationData.manufacturer !== undefined) {
            updates.push('manufacturer = ?');
            values.push(medicationData.manufacturer || null);
        }
        if (medicationData.description !== undefined) {
            updates.push('description = ?');
            values.push(medicationData.description || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.id);

        await pool.execute(
            `UPDATE medications SET ${updates.join(', ')}, updatedAt = NOW() WHERE medicationId = ?`,
            values
        );

        const [updated] = await pool.execute(
            'SELECT * FROM medications WHERE medicationId = ?',
            [req.params.id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating medication:', error);
        res.status(500).json({ message: 'Error updating medication', error: error.message });
    }
});

/**
 * @route DELETE /api/pharmacy/medications/:id
 * @description Soft delete a medication (set voided = 1)
 */
router.delete('/medications/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if medication exists
        const [existing] = await pool.execute(
            'SELECT * FROM medications WHERE medicationId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Medication not found' });
        }

        // Soft delete: set voided = 1
        await pool.execute(
            'UPDATE medications SET voided = 1, updatedAt = NOW() WHERE medicationId = ?',
            [id]
        );

        res.status(200).json({
            message: 'Medication deleted successfully',
            medicationId: id
        });
    } catch (error) {
        console.error('Error deleting medication:', error);
        res.status(500).json({ message: 'Error deleting medication', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/prescriptions
 * @description Get all prescriptions
 */
router.get('/prescriptions', async (req, res) => {
    try {
        const { patientId, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT p.*,
                   pt.firstName, pt.lastName, pt.patientNumber,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName,
                   (SELECT i.status FROM invoices i
                    WHERE i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                    AND i.status NOT IN ('cancelled', 'draft')
                    ORDER BY i.invoiceId DESC
                    LIMIT 1) as invoiceStatus
            FROM prescriptions p
            LEFT JOIN patients pt ON p.patientId = pt.patientId
            LEFT JOIN users u ON p.doctorId = u.userId
            WHERE 1=1
        `;
        const params = [];

        if (patientId) {
            query += ` AND p.patientId = ?`;
            params.push(patientId);
        }

        if (status) {
            query += ` AND p.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY p.prescriptionDate DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);

        // Fetch prescription items with medication names for each prescription
        const prescriptionsWithItems = await Promise.all(rows.map(async (prescription) => {
            try {
                const [items] = await pool.execute(
                    `SELECT pi.*, m.name as medicationNameFromCatalog, m.genericName
                     FROM prescription_items pi
                     LEFT JOIN medications m ON pi.medicationId = m.medicationId
                     WHERE pi.prescriptionId = ?
                     ORDER BY pi.itemId`,
                    [prescription.prescriptionId]
                );
                return {
                    ...prescription,
                    items: items || []
                };
            } catch (error) {
                console.error(`Error fetching items for prescription ${prescription.prescriptionId}:`, error);
                return {
                    ...prescription,
                    items: []
                };
            }
        }));

        res.status(200).json(prescriptionsWithItems);
    } catch (error) {
        console.error('Error fetching prescriptions:', error);
        res.status(500).json({ message: 'Error fetching prescriptions', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/prescriptions/:id
 * @description Get a prescription with items
 */
router.get('/prescriptions/:id', async (req, res) => {
    try {
        const [prescription] = await pool.execute(
            `SELECT p.*,
                    pt.firstName, pt.lastName, pt.patientNumber,
                    u.firstName as doctorFirstName, u.lastName as doctorLastName,
                    (SELECT i.status FROM invoices i
                     WHERE i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                     AND i.status NOT IN ('cancelled', 'draft')
                     LIMIT 1) as invoiceStatus,
                    (SELECT i.invoiceId FROM invoices i
                     WHERE i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                     AND i.status NOT IN ('cancelled', 'draft')
                     LIMIT 1) as invoiceId
             FROM prescriptions p
             LEFT JOIN patients pt ON p.patientId = pt.patientId
             LEFT JOIN users u ON p.doctorId = u.userId
             WHERE p.prescriptionId = ?`,
            [req.params.id]
        );

        if (prescription.length === 0) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        // Get prescription items with medication info
        const [items] = await pool.execute(
            `SELECT pi.*, m.name as medicationNameFromCatalog, m.genericName
             FROM prescription_items pi
             LEFT JOIN medications m ON pi.medicationId = m.medicationId
             WHERE pi.prescriptionId = ?
             ORDER BY pi.itemId`,
            [req.params.id]
        );

        // Get pricing from drug_inventory for each medication
        // Use the minimum sellPrice if multiple batches exist
        const itemsWithPricing = await Promise.all(items.map(async (item) => {
            if (!item.medicationId) {
                return { ...item, sellPrice: null, unitPrice: null, inInventory: false };
            }

            try {
                const [pricing] = await pool.execute(
                    `SELECT MIN(di.sellPrice) as minSellPrice, AVG(di.sellPrice) as avgSellPrice,
                            MIN(di.unitPrice) as minUnitPrice, SUM(di.quantity) as totalQuantity
                     FROM drug_inventory di
                     WHERE di.medicationId = ? AND di.quantity > 0
                     GROUP BY di.medicationId`,
                    [item.medicationId]
                );

                if (pricing.length > 0 && pricing[0].minSellPrice) {
                    return {
                        ...item,
                        sellPrice: parseFloat(pricing[0].minSellPrice),
                        unitPrice: pricing[0].minUnitPrice ? parseFloat(pricing[0].minUnitPrice) : null,
                        inInventory: true,
                        availableQuantity: pricing[0].totalQuantity ? parseInt(pricing[0].totalQuantity) : 0
                    };
                }
            } catch (error) {
                console.error(`Error fetching pricing for medication ${item.medicationId}:`, error);
            }

            return { ...item, sellPrice: null, unitPrice: null, inInventory: false };
        }));

        res.status(200).json({
            ...prescription[0],
            items: itemsWithPricing
        });
    } catch (error) {
        console.error('Error fetching prescription:', error);
        res.status(500).json({ message: 'Error fetching prescription', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/prescriptions
 * @description Create a new prescription
 */
/**
 * @route POST /api/pharmacy/prescriptions
 * @description Create a new prescription, link to FIFO batches, and generate invoice/queue.
 */
router.post('/prescriptions', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { prescriptionNumber, patientId, doctorId, prescriptionDate, status, notes, items, admissionId } = req.body;
        const userId = req.user?.id || null;

        // 1. Generate prescription number
        let prescNumber = prescriptionNumber;
        if (!prescNumber) {
            const [count] = await connection.execute('SELECT COUNT(*) as count FROM prescriptions');
            prescNumber = `PRES-${String(count[0].count + 1).padStart(6, '0')}`;
        }

        // Ensure all values are properly set (no undefined)
        const prescriptionValues = [
            prescNumber,
            patientId !== undefined ? patientId : null,
            doctorId !== undefined ? doctorId : null,
            prescriptionDate || new Date(),
            status || 'pending',
            notes !== undefined && notes !== null ? notes : null,
            admissionId !== undefined && admissionId !== null ? admissionId : null
        ];

        // Validate no undefined values
        for (let i = 0; i < prescriptionValues.length; i++) {
            if (prescriptionValues[i] === undefined) {
                console.error(`[PRESCRIPTION] Undefined value at index ${i} in prescription INSERT`);
                throw new Error(`Prescription parameter at index ${i} is undefined`);
            }
        }

        const [result] = await connection.execute(
            `INSERT INTO prescriptions (prescriptionNumber, patientId, doctorId, prescriptionDate, status, notes, admissionId)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            prescriptionValues
        );
        const prescriptionId = result.insertId;

        // 2. Process Items and find FIFO Batches for Billing
        let totalAmount = 0;
        const invoiceItems = [];

        if (items && items.length > 0) {
            for (const item of items) {
                let medicationName = item.medicationName || 'Unknown';
                const medicationIdNum = item.medicationId ? parseInt(item.medicationId) : null;
                const quantityNum = item.quantity ? parseInt(item.quantity) : 0;

                // If medication name is 'Unknown' but we have medicationId, fetch the actual name
                if (medicationName === 'Unknown' && medicationIdNum) {
                    try {
                        const [medications] = await connection.execute(
                            'SELECT name FROM medications WHERE medicationId = ?',
                            [medicationIdNum]
                        );
                        if (medications.length > 0 && medications[0].name) {
                            medicationName = medications[0].name;
                        }
                    } catch (err) {
                        console.error('Error fetching medication name:', err);
                        // Keep 'Unknown' if fetch fails
                    }
                }

                // Save prescription item
                // Ensure all values are null instead of undefined to avoid SQL errors
                const itemValues = [
                    prescriptionId !== undefined ? prescriptionId : null,
                    medicationIdNum !== undefined && medicationIdNum !== null ? medicationIdNum : null,
                    medicationName !== undefined && medicationName !== null ? medicationName : null,
                    item.dosage !== undefined && item.dosage !== null ? item.dosage : null,
                    item.frequency !== undefined && item.frequency !== null ? item.frequency : null,
                    item.duration !== undefined && item.duration !== null ? item.duration : null,
                    quantityNum !== undefined && quantityNum !== null ? quantityNum : null,
                    item.instructions !== undefined && item.instructions !== null ? item.instructions : null
                ];

                // Validate no undefined values before executing
                for (let i = 0; i < itemValues.length; i++) {
                    if (itemValues[i] === undefined) {
                        console.error(`[PRESCRIPTION] Undefined value at index ${i} in prescription_items INSERT`);
                        console.error(`[PRESCRIPTION] Item data:`, JSON.stringify(item, null, 2));
                        console.error(`[PRESCRIPTION] Item values:`, JSON.stringify(itemValues, null, 2));
                        throw new Error(`Prescription item parameter at index ${i} is undefined`);
                    }
                }

                await connection.execute(
                    `INSERT INTO prescription_items (prescriptionId, medicationId, medicationName, dosage, frequency, duration, quantity, instructions)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    itemValues
                );

                // FIFO Batch Selection (Price Lookup)
                if (medicationIdNum && quantityNum > 0) {
                    const [batches] = await connection.execute(
                        `SELECT di.drugInventoryId, di.sellPrice FROM drug_inventory di
                         WHERE di.medicationId = ? AND di.quantity > 0 AND di.status = 'active'
                         AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
                         ORDER BY di.expiryDate ASC, di.createdAt ASC LIMIT 1`,
                        [medicationIdNum]
                    );

                    if (batches.length > 0) {
                        const price = parseFloat(batches[0].sellPrice);
                        totalAmount += price * quantityNum;
                        invoiceItems.push({
                            medicationId: medicationIdNum,
                            description: `Prescription Item: ${medicationName}`,
                            quantity: quantityNum,
                            unitPrice: price,
                            totalPrice: price * quantityNum,
                            drugInventoryId: batches[0].drugInventoryId
                        });
                    }
                }
            }
        }

        // 3. Create Invoice & Queue (Maintaining your logic for unique invoice numbers)
        if (invoiceItems.length > 0 && totalAmount > 0) {
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const datePrefix = `INV-${today}-`;
            const [maxResult] = await connection.execute(
                `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                 FROM invoices WHERE invoiceNumber LIKE CONCAT(?, '%')`, [datePrefix]
            );
            let nextNum = (maxResult[0]?.maxNum || 0) + 1;
            let invoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;

            const [invResult] = await connection.execute(
                `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, totalAmount, balance, status, notes, createdBy)
                 VALUES (?, ?, CURDATE(), ?, ?, 'pending', ?, ?)`,
                [invoiceNumber, patientId, totalAmount, totalAmount, `Drug payment - Prescription: ${prescNumber}`, userId || null]
            );

            for (const invItem of invoiceItems) {
                await connection.execute(
                    `INSERT INTO invoice_items (invoiceId, description, quantity, unitPrice, totalPrice, drugInventoryId)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [invResult.insertId, invItem.description, invItem.quantity, invItem.unitPrice, invItem.totalPrice, invItem.drugInventoryId]
                );
            }

            // Create Cashier Queue Entry (check for duplicates first)
            try {
                const [existingCashierQueue] = await connection.execute(
                    `SELECT queueId FROM queue_entries
                     WHERE patientId = ? AND servicePoint = 'cashier'
                     AND status IN ('waiting', 'called', 'serving')`,
                    [patientId]
                );

                if (existingCashierQueue.length === 0) {
                    // Patient not in cashier queue, add them
                    const [cashierCount] = await connection.execute('SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "cashier"');
                    const cashierTicketNumber = `C-${String(cashierCount[0].count + 1).padStart(3, '0')}`;
                    const [queueResult] = await connection.execute(
                        `INSERT INTO queue_entries (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                         VALUES (?, ?, 'cashier', 'normal', 'waiting', ?, ?)`,
                        [patientId, cashierTicketNumber, `Drug payment - Prescription: ${prescNumber}`, userId || null]
                    );
                    console.log(`[CASHIER QUEUE] Successfully created cashier queue entry for patient ${patientId} with ticket ${cashierTicketNumber} for prescription ${prescNumber}`);
                } else {
                    console.log(`[CASHIER QUEUE] Patient ${patientId} already exists in cashier queue (queueId: ${existingCashierQueue[0].queueId}) - skipping duplicate entry for prescription ${prescNumber}`);
                }
            } catch (queueError) {
                console.error('[CASHIER QUEUE] Error creating cashier queue entry:', queueError);
                console.error('[CASHIER QUEUE] Error stack:', queueError.stack);
                // Don't fail the prescription creation if queue entry fails
                // The invoice is already created, so the patient can still pay
            }
        }

        await connection.commit();
        res.status(201).json({ prescriptionId, prescriptionNumber: prescNumber });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Error creating prescription', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/pharmacy/prescriptions/:id
 * @description Update a prescription
 */


router.put('/prescriptions/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { status, notes, patientId, doctorId, prescriptionDate, items } = req.body;
        const userId = req.user?.id || req.user?.userId || 1;

        // 1. Get existing prescription
        const [existing] = await connection.execute(
            'SELECT * FROM prescriptions WHERE prescriptionId = ?',
            [id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Prescription not found' });
        }

        const oldPrescription = existing[0];

        // --- INVENTORY HANDSHAKE & HISTORY LOGGING ---
        if (status === 'dispensed' && oldPrescription.status !== 'dispensed') {

            // Find the invoice items associated with this prescription to get the reserved Batch IDs
            const [dispenseItems] = await connection.execute(
                `SELECT ii.drugInventoryId, ii.quantity, ii.description, pi.medicationId
                 FROM invoice_items ii
                 JOIN invoices i ON ii.invoiceId = i.invoiceId
                 JOIN prescription_items pi ON pi.prescriptionId = ?
                 WHERE i.notes LIKE CONCAT('%', ?, '%') AND ii.drugInventoryId IS NOT NULL
                 GROUP BY ii.invoiceItemId`,
                 [id, oldPrescription.prescriptionNumber]
            );

            for (const item of dispenseItems) {
                // Get current drug inventory details
                const [drugInventories] = await connection.execute(
                    'SELECT * FROM drug_inventory WHERE drugInventoryId = ?',
                    [item.drugInventoryId]
                );

                if (drugInventories.length === 0) {
                    throw new Error(`Drug inventory not found for batch: ${item.description}`);
                }

                const drugInventory = drugInventories[0];

                // A. Update Inventory Quantity (coerce DECIMAL/string from MySQL)
                const oldQuantity = Number(drugInventory.quantity);
                const deductQty = Number(item.quantity);
                if (!Number.isFinite(oldQuantity) || !Number.isFinite(deductQty) || deductQty <= 0) {
                    throw new Error(`Invalid quantity for invoice line: ${item.description || item.drugInventoryId}`);
                }
                const newQuantity = oldQuantity - deductQty;

                const [updateResult] = await connection.execute(
                    `UPDATE drug_inventory
                     SET quantity = ?, updatedAt = NOW()
                     WHERE drugInventoryId = ? AND quantity >= ?`,
                    [newQuantity < 0 ? 0 : newQuantity, item.drugInventoryId, deductQty]
                );

                if (updateResult.affectedRows === 0) {
                    throw new Error(`Insufficient stock in selected batch for: ${item.description}`);
                }

                // B. UPDATE DRUG INVENTORY HISTORY (Using correct schema)
                // This ensures the "History" tab in your UI reflects the dispense action
                const transactionDate = new Date().toISOString().split('T')[0];
                const unitPriceForTransaction = drugInventory.unitPrice || 0;
                const sellPriceForTransaction = drugInventory.sellPrice || 0;
                const totalValue = deductQty * unitPriceForTransaction;
                const totalSellValue = deductQty * sellPriceForTransaction;

                await connection.execute(
                    `INSERT INTO drug_inventory_transactions
                     (drugInventoryId, patientId, prescriptionId, transactionType, transactionDate, quantityChange, quantityBefore, quantityAfter, balanceAfter,
                      unitPrice, sellPrice, totalValue, totalSellValue, referenceType, referenceId, referenceNumber, performedBy, notes)
                     VALUES (?, ?, ?, 'DISPENSATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prescription', ?, ?, ?, ?)`,
                    [
                        item.drugInventoryId,
                        oldPrescription.patientId,
                        id, // prescriptionId
                        transactionDate,
                        -deductQty, // Negative for dispensation
                        oldQuantity,
                        newQuantity < 0 ? 0 : newQuantity,
                        newQuantity < 0 ? 0 : newQuantity, // balanceAfter
                        unitPriceForTransaction,
                        sellPriceForTransaction,
                        -totalValue, // Negative cost value
                        -totalSellValue, // Negative selling value
                        id, // referenceId (prescriptionId)
                        oldPrescription.prescriptionNumber, // referenceNumber
                        userId || 1,
                        `Dispensed for Prescription: ${oldPrescription.prescriptionNumber}. ${item.description || ''}`
                    ]
                );

                // Also create stock adjustment record
                try {
                    const expiryDateForAdjustment = drugInventory.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    await connection.execute(
                        `INSERT INTO drug_stock_adjustments
                         (drugInventoryId, medicationId, adjustmentType, adjustmentDate, quantity, batchNumber, unitPrice, sellPrice,
                          expiryDate, location, patientId, prescriptionId, referenceType, referenceId, referenceNumber, performedBy, notes)
                         VALUES (?, ?, 'DISPENSATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prescription', ?, ?, ?, ?)`,
                        [
                            item.drugInventoryId,
                            item.medicationId,
                            transactionDate,
                            -deductQty,
                            drugInventory.batchNumber || 'UNKNOWN',
                            unitPriceForTransaction,
                            sellPriceForTransaction,
                            expiryDateForAdjustment,
                            drugInventory.location || null,
                            oldPrescription.patientId,
                            id,
                            id,
                            oldPrescription.prescriptionNumber,
                            userId || 1,
                            `Dispensed for Prescription: ${oldPrescription.prescriptionNumber}. ${item.description || ''}`
                        ]
                    );
                } catch (adjustmentError) {
                    console.error('Warning: Failed to record stock adjustment (non-critical):', adjustmentError);
                }
            }
        }

        // --- MAINTAIN PREVIOUS FEATURES (History tracking for fields/items) ---
        const updates = [];
        const values = [];
        const historyEntries = [];

        if (status !== undefined && status !== oldPrescription.status) {
            updates.push('status = ?');
            values.push(status);
            historyEntries.push({ fieldName: 'status', oldValue: oldPrescription.status, newValue: status });
        }

        if (notes !== undefined && notes !== oldPrescription.notes) {
            updates.push('notes = ?');
            values.push(notes);
            historyEntries.push({ fieldName: 'notes', oldValue: oldPrescription.notes || '', newValue: notes || '' });
        }

        if (patientId !== undefined && patientId !== oldPrescription.patientId) {
            updates.push('patientId = ?');
            values.push(patientId);
            historyEntries.push({ fieldName: 'patientId', oldValue: oldPrescription.patientId?.toString() || '', newValue: patientId?.toString() || '' });
        }

        if (doctorId !== undefined && doctorId !== oldPrescription.doctorId) {
            updates.push('doctorId = ?');
            values.push(doctorId);
            historyEntries.push({ fieldName: 'doctorId', oldValue: oldPrescription.doctorId?.toString() || '', newValue: doctorId?.toString() || '' });
        }

        if (prescriptionDate !== undefined && prescriptionDate !== oldPrescription.prescriptionDate) {
            updates.push('prescriptionDate = ?');
            values.push(prescriptionDate);
            historyEntries.push({ fieldName: 'prescriptionDate', oldValue: oldPrescription.prescriptionDate || '', newValue: prescriptionDate || '' });
        }

        if (updates.length > 0) {
            values.push(id);
            await connection.execute(
                `UPDATE prescriptions SET ${updates.join(', ')}, updatedAt = NOW() WHERE prescriptionId = ?`,
                values
            );
            for (const entry of historyEntries) {
                await connection.execute(
                    `INSERT INTO prescription_history (prescriptionId, fieldName, oldValue, newValue, changedBy, changeType)
                     VALUES (?, ?, ?, ?, ?, 'update')`,
                    [id, entry.fieldName, entry.oldValue, entry.newValue, userId]
                );
            }
        }

        // Handle prescription_items updates
        if (items && Array.isArray(items)) {
            const [existingItems] = await connection.execute('SELECT * FROM prescription_items WHERE prescriptionId = ?', [id]);
            const newItemIds = items.filter(item => item.itemId).map(item => item.itemId);
            const itemsToDelete = existingItems.filter(item => !newItemIds.includes(item.itemId));

            for (const item of itemsToDelete) {
                await connection.execute(`DELETE FROM prescription_items WHERE itemId = ?`, [item.itemId]);
            }

            for (const item of items) {
                if (item.itemId) {
                    const existingItem = existingItems.find(ei => ei.itemId === item.itemId);
                    if (existingItem) {
                        const itemUpdates = [];
                        const itemValues = [];
                        const fields = ['dosage', 'frequency', 'duration', 'quantity', 'instructions', 'status'];
                        fields.forEach(f => {
                            if (item[f] !== undefined && item[f] !== existingItem[f]) {
                                itemUpdates.push(`${f} = ?`);
                                itemValues.push(item[f]);
                            }
                        });
                        if (itemUpdates.length > 0) {
                            itemValues.push(item.itemId);
                            await connection.execute(`UPDATE prescription_items SET ${itemUpdates.join(', ')} WHERE itemId = ?`, itemValues);
                        }
                    }
                } else {
                    await connection.execute(
                        `INSERT INTO prescription_items (prescriptionId, medicationId, medicationName, dosage, frequency, duration, quantity, instructions, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [id, item.medicationId, item.medicationName, item.dosage, item.frequency, item.duration, item.quantity, item.instructions, item.status || 'pending']
                    );
                }
            }
        }

        await connection.commit();

        const [updated] = await connection.execute(
            `SELECT p.*, pt.firstName, pt.lastName, u.firstName as doctorFirstName, u.lastName as doctorLastName
             FROM prescriptions p
             LEFT JOIN patients pt ON p.patientId = pt.patientId
             LEFT JOIN users u ON p.doctorId = u.userId
             WHERE p.prescriptionId = ?`, [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error updating prescription:', error);
        res.status(500).json({ message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

/**
 * @route GET /api/pharmacy/inventory
 * @description Get pharmacy inventory
 */
router.get('/inventory', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT pi.*, m.name as medicationName, m.medicationCode, m.genericName
             FROM pharmacy_inventory pi
             LEFT JOIN medications m ON pi.medicationId = m.medicationId
             ORDER BY m.name`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching pharmacy inventory:', error);
        res.status(500).json({ message: 'Error fetching pharmacy inventory', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory
 * @description Get all drug inventory items
 */
router.get('/drug-inventory', async (req, res) => {
    try {
        const { medicationId, search, location, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT di.*,
                   m.name as medicationName,
                   m.medicationCode,
                   m.genericName,
                   m.dosageForm,
                   m.strength
            FROM drug_inventory di
            LEFT JOIN medications m ON di.medicationId = m.medicationId
            WHERE 1=1
        `;
        const params = [];

        if (medicationId) {
            query += ` AND di.medicationId = ?`;
            params.push(medicationId);
        }

        if (search) {
            query += ` AND (m.name LIKE ? OR m.genericName LIKE ? OR di.batchNumber LIKE ? OR di.location LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (location) {
            query += ` AND di.location = ?`;
            params.push(location);
        }

        query += ` ORDER BY di.expiryDate ASC, m.name LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching drug inventory:', error);
        res.status(500).json({ message: 'Error fetching drug inventory', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/summary
 * @description Get aggregated drug inventory summary (total quantities per medication)
 */
router.get('/drug-inventory/summary', async (req, res) => {
    try {
        const { search, page = 1, limit = 100 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT * FROM vw_drug_inventory_aggregated
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (medicationName LIKE ? OR genericName LIKE ? OR medicationCode LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY medicationName LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) as total FROM vw_drug_inventory_aggregated WHERE 1=1`;
        const countParams = [];
        if (search) {
            countQuery += ` AND (medicationName LIKE ? OR genericName LIKE ? OR medicationCode LIKE ?)`;
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm);
        }
        const [countRows] = await pool.execute(countQuery, countParams);
        const total = countRows[0]?.total || 0;

        res.status(200).json({
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching drug inventory summary:', error);
        res.status(500).json({ message: 'Error fetching drug inventory summary', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/value-by-location
 * @description Inventory value summary grouped by location and drug
 */
router.get('/drug-inventory/value-by-location', async (req, res) => {
    try {
        const { location, search, dateFrom, dateTo } = req.query;
        const params = [];

        let query = `
            SELECT
                COALESCE(ds.storeName, di.location, 'Unassigned') AS location,
                m.medicationId,
                m.medicationCode,
                m.name AS medicationName,
                m.genericName,
                m.dosageForm,
                m.strength,
                SUM(COALESCE(di.quantity, 0)) AS quantity,
                SUM(COALESCE(di.quantity, 0) * COALESCE(di.sellPrice, 0)) AS amountValue,
                COUNT(*) AS batchCount,
                MIN(di.expiryDate) AS earliestExpiryDate,
                MAX(di.expiryDate) AS latestExpiryDate
            FROM drug_inventory di
            LEFT JOIN medications m ON di.medicationId = m.medicationId
            LEFT JOIN drug_stores ds ON di.storeId = ds.storeId
            WHERE COALESCE(di.status, 'active') = 'active'
              AND COALESCE(di.quantity, 0) > 0
        `;

        if (location && location !== 'all') {
            query += ` AND COALESCE(ds.storeName, di.location, 'Unassigned') = ?`;
            params.push(location);
        }

        if (search) {
            query += ` AND (m.name LIKE ? OR m.genericName LIKE ? OR m.medicationCode LIKE ? OR di.batchNumber LIKE ?)`;
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        if (dateFrom) {
            query += ` AND DATE(di.createdAt) >= ?`;
            params.push(dateFrom);
        }

        if (dateTo) {
            query += ` AND DATE(di.createdAt) <= ?`;
            params.push(dateTo);
        }

        query += `
            GROUP BY
                COALESCE(ds.storeName, di.location, 'Unassigned'),
                m.medicationId,
                m.medicationCode,
                m.name,
                m.genericName,
                m.dosageForm,
                m.strength
            ORDER BY location ASC, medicationName ASC
        `;

        const [rows] = await pool.execute(query, params);
        const totals = rows.reduce((acc, row) => {
            acc.quantity += Number(row.quantity || 0);
            acc.amountValue += Number(row.amountValue || 0);
            return acc;
        }, { quantity: 0, amountValue: 0 });

        res.status(200).json({ data: rows, totals });
    } catch (error) {
        console.error('Error fetching inventory value by location:', error);
        res.status(500).json({ message: 'Error fetching inventory value by location', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/:id
 * @description Get a single drug inventory item by ID
 */
router.get('/drug-inventory/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT di.*,
                    m.name as medicationName,
                    m.medicationCode,
                    m.genericName,
                    m.dosageForm,
                    m.strength
             FROM drug_inventory di
             LEFT JOIN medications m ON di.medicationId = m.medicationId
             WHERE di.drugInventoryId = ?`,
            [req.params.id]
        );

        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Drug inventory item not found' });
        }
    } catch (error) {
        console.error('Error fetching drug inventory item:', error);
        res.status(500).json({ message: 'Error fetching drug inventory item', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/drug-inventory
 * @description Create a new drug inventory item
 */
router.post('/drug-inventory', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            medicationId,
            batchNumber,
            quantity,
            unitPrice,
            manufactureDate,
            expiryDate,
            minPrice,
            sellPrice,
            location,
            notes
        } = req.body;

        // 1. Validation
        if (!medicationId || !batchNumber || !expiryDate || !sellPrice || !String(location || '').trim()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Missing required fields: medicationId, batchNumber, expiryDate, sellPrice, location' });
        }

        const userId = req.user?.id || req.user?.userId || 1;
        const receivedQuantity = parseFloat(quantity) || 0;
        const transactionDate = new Date().toISOString().split('T')[0];

        // 2. Check if this batch already exists for this medication
        const [existingBatches] = await connection.execute(
            'SELECT * FROM drug_inventory WHERE batchNumber = ? AND medicationId = ?',
            [batchNumber, medicationId]
        );

        let drugInventoryId;
        let oldQuantity = 0;
        let isNewBatch = false;

        if (existingBatches.length > 0) {
            // UPDATING EXISTING BATCH
            const existing = existingBatches[0];
            drugInventoryId = existing.drugInventoryId;
            oldQuantity = existing.quantity;
            const newQuantity = oldQuantity + receivedQuantity;

            await connection.execute(
                `UPDATE drug_inventory
                 SET quantity = ?,
                     unitPrice = ?,
                     sellPrice = ?,
                     minPrice = ?,
                     expiryDate = ?,
                     location = ?,
                     status = 'active',
                     updatedAt = NOW()
                 WHERE drugInventoryId = ?`,
                [newQuantity, unitPrice, sellPrice, minPrice || null, expiryDate, location || null, drugInventoryId]
            );
        } else {
            // CREATING NEW BATCH
            isNewBatch = true;
            const [result] = await connection.execute(
                `INSERT INTO drug_inventory
                 (medicationId, batchNumber, quantity, originalQuantity, unitPrice, manufactureDate, expiryDate, minPrice, sellPrice, location, notes, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
                [
                    medicationId,
                    batchNumber,
                    receivedQuantity,
                    receivedQuantity, // First receipt sets the original quantity
                    unitPrice || 0,
                    manufactureDate || null,
                    expiryDate,
                    minPrice || null,
                    sellPrice,
                    location || null,
                    notes || null
                ]
            );
            drugInventoryId = result.insertId;
        }

        const currentTotalQuantity = oldQuantity + receivedQuantity;

        // 3. Record Stock Adjustment (Detailed History)
        await connection.execute(
            `INSERT INTO drug_stock_adjustments
             (drugInventoryId, medicationId, adjustmentType, adjustmentDate, quantity, batchNumber, unitPrice, sellPrice,
              manufactureDate, expiryDate, minPrice, location, referenceType, referenceNumber, performedBy, notes)
             VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_entry', ?, ?, ?)`,
            [
                drugInventoryId,
                medicationId,
                transactionDate,
                receivedQuantity,
                batchNumber,
                unitPrice || 0,
                sellPrice || 0,
                manufactureDate || null,
                expiryDate,
                minPrice || null,
                location || null,
                batchNumber,
                userId,
                notes || `Stock receipt: ${receivedQuantity} units.`
            ]
        );

        // 4. Record Inventory Transaction (Financial/Audit History)
        const totalValue = receivedQuantity * (unitPrice || 0);
        const totalSellValue = receivedQuantity * (sellPrice || 0);

        await connection.execute(
            `INSERT INTO drug_inventory_transactions
             (drugInventoryId, transactionType, transactionDate, quantityChange, quantityBefore, quantityAfter, balanceAfter,
              unitPrice, sellPrice, totalValue, totalSellValue, referenceType, referenceNumber, performedBy, notes)
             VALUES (?, 'RECEIPT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inventory_entry', ?, ?, ?)`,
            [
                drugInventoryId,
                transactionDate,
                receivedQuantity,
                oldQuantity,
                currentTotalQuantity,
                currentTotalQuantity,
                unitPrice || 0,
                sellPrice || 0,
                totalValue,
                totalSellValue,
                batchNumber,
                userId,
                `Inventory Entry: ${isNewBatch ? 'New Batch' : 'Added to existing batch'}`
            ]
        );

        await connection.commit();

        // 5. Return the updated record with medication details
        const [updatedItem] = await connection.execute(
            `SELECT di.*, m.name as medicationName, m.medicationCode, m.genericName, m.dosageForm, m.strength
             FROM drug_inventory di
             LEFT JOIN medications m ON di.medicationId = m.medicationId
             WHERE di.drugInventoryId = ?`,
            [drugInventoryId]
        );

        res.status(201).json(updatedItem[0]);

    } catch (error) {
        await connection.rollback();
        console.error('Error processing drug inventory:', error);
        res.status(500).json({ message: 'Error processing drug inventory', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/pharmacy/drug-inventory/:id
 * @description Update a drug inventory item
 */
router.put('/drug-inventory/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            medicationId,
            batchNumber,
            quantity,
            unitPrice,
            manufactureDate,
            expiryDate,
            minPrice,
            sellPrice,
            location,
            notes
        } = req.body;

        // Check if item exists
        const [existing] = await pool.execute(
            'SELECT drugInventoryId FROM drug_inventory WHERE drugInventoryId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Drug inventory item not found' });
        }

        if (location !== undefined && !String(location || '').trim()) {
            return res.status(400).json({ message: 'Location is required' });
        }

        // Build update query
        const updates = [];
        const values = [];

        if (medicationId !== undefined) {
            updates.push('medicationId = ?');
            values.push(medicationId);
        }
        if (batchNumber !== undefined) {
            updates.push('batchNumber = ?');
            values.push(batchNumber);
        }
        if (quantity !== undefined) {
            updates.push('quantity = ?');
            values.push(quantity);
        }
        if (unitPrice !== undefined) {
            updates.push('unitPrice = ?');
            values.push(unitPrice);
        }
        if (manufactureDate !== undefined) {
            updates.push('manufactureDate = ?');
            values.push(manufactureDate || null);
        }
        if (expiryDate !== undefined) {
            updates.push('expiryDate = ?');
            values.push(expiryDate);
        }
        if (minPrice !== undefined) {
            updates.push('minPrice = ?');
            values.push(minPrice || null);
        }
        if (sellPrice !== undefined) {
            updates.push('sellPrice = ?');
            values.push(sellPrice);
        }
        if (location !== undefined) {
            updates.push('location = ?');
            values.push(location || null);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(id);

        await pool.execute(
            `UPDATE drug_inventory SET ${updates.join(', ')}, updatedAt = NOW() WHERE drugInventoryId = ?`,
            values
        );

        const [updated] = await pool.execute(
            `SELECT di.*,
                    m.name as medicationName,
                    m.medicationCode,
                    m.genericName,
                    m.dosageForm,
                    m.strength
             FROM drug_inventory di
             LEFT JOIN medications m ON di.medicationId = m.medicationId
             WHERE di.drugInventoryId = ?`,
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating drug inventory item:', error);
        res.status(500).json({ message: 'Error updating drug inventory item', error: error.message });
    }
});

/**
 * @route DELETE /api/pharmacy/drug-inventory/:id
 * @description Delete a drug inventory item
 */
router.delete('/drug-inventory/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if item exists
        const [existing] = await pool.execute(
            'SELECT drugInventoryId, quantity, batchNumber FROM drug_inventory WHERE drugInventoryId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Drug inventory item not found' });
        }

        // IMPORTANT: Drug inventory records should NOT be deleted as they contain vital audit information
        // Even when quantity reaches 0, the record should be preserved for:
        // - Historical batch tracking (batch number, expiry date)
        // - Purchase price records (unitPrice, sellPrice)
        // - Dispensation audit trail (linked via dispensations table)
        // - Regulatory compliance (tracking all batches that entered the system)
        //
        // If correction is needed (e.g., data entry error), update the record instead of deleting.
        // Records with quantity = 0 are automatically excluded from active inventory queries.

        return res.status(403).json({
            message: 'Drug inventory records cannot be deleted to preserve audit trail',
            reason: 'Records contain vital historical information and must be retained for compliance and audit purposes',
            suggestion: 'If correction is needed, update the record or contact system administrator'
        });
    } catch (error) {
        console.error('Error attempting to delete drug inventory item:', error);
        res.status(500).json({ message: 'Error processing request', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/prescriptions/:id/history
 * @description Get prescription history/audit log
 */
router.get('/prescriptions/:id/history', async (req, res) => {
    try {
        const { id } = req.params;

        const [history] = await pool.execute(
            `SELECT ph.*,
                    u.firstName as changedByFirstName,
                    u.lastName as changedByLastName,
                    u.username as changedByUsername
             FROM prescription_history ph
             LEFT JOIN users u ON ph.changedBy = u.userId
             WHERE ph.prescriptionId = ?
             ORDER BY ph.changeDate DESC`,
            [id]
        );

        const [itemsHistory] = await pool.execute(
            `SELECT pih.*,
                    u.firstName as changedByFirstName,
                    u.lastName as changedByLastName,
                    u.username as changedByUsername
             FROM prescription_items_history pih
             LEFT JOIN users u ON pih.changedBy = u.userId
             WHERE pih.prescriptionId = ?
             ORDER BY pih.changeDate DESC`,
            [id]
        );

        res.status(200).json({
            prescriptionHistory: history,
            itemsHistory: itemsHistory
        });
    } catch (error) {
        console.error('Error fetching prescription history:', error);
        res.status(500).json({ message: 'Error fetching prescription history', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/:id/history
 * @description Get drug inventory history/audit log
 */
router.get('/drug-inventory/:id/history', async (req, res) => {
    try {
        const { id } = req.params;

        const [history] = await pool.execute(
            `SELECT dih.*,
                    u.firstName as changedByFirstName,
                    u.lastName as changedByLastName,
                    u.username as changedByUsername
             FROM drug_inventory_history dih
             LEFT JOIN users u ON dih.changedBy = u.userId
             WHERE dih.drugInventoryId = ?
             ORDER BY dih.changeDate DESC`,
            [id]
        );

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching drug inventory history:', error);
        res.status(500).json({ message: 'Error fetching drug inventory history', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/prescriptions/paid/ready-for-dispensing
 * @description Get paid prescription items that are ready for dispensing (only items with drug_inventory)
 */
router.get('/prescriptions/paid/ready-for-dispensing', async (req, res) => {
    try {
        const { patientId } = req.query;

        let query = `
            SELECT
                pi.itemId,
                pi.prescriptionId,
                pi.medicationId,
                COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, 'Unknown Medication') as medicationName,
                pi.dosage,
                pi.frequency,
                pi.duration,
                pi.quantity as prescribedQuantity,
                pi.instructions,
                pi.status,
                p.prescriptionNumber,
                p.prescriptionDate,
                p.patientId,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                pt.patientNumber,
                u.firstName as doctorFirstName,
                u.lastName as doctorLastName,
                (SELECT i.invoiceId FROM invoices i
                 WHERE i.patientId = p.patientId
                 AND i.status = 'paid'
                 AND (
                     i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                     OR i.notes LIKE CONCAT('%Drug payment%')
                     OR EXISTS (
                         SELECT 1 FROM invoice_items ii
                         INNER JOIN drug_inventory di_match ON di_match.drugInventoryId = ii.drugInventoryId
                         WHERE ii.invoiceId = i.invoiceId
                         AND di_match.medicationId = pi.medicationId
                     )
                 )
                 ORDER BY i.invoiceDate DESC
                 LIMIT 1) as invoiceId,
                (SELECT i.invoiceNumber FROM invoices i
                 WHERE i.patientId = p.patientId
                 AND i.status = 'paid'
                 AND (
                     i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                     OR i.notes LIKE CONCAT('%Drug payment%')
                     OR EXISTS (
                         SELECT 1 FROM invoice_items ii
                         INNER JOIN drug_inventory di_match ON di_match.drugInventoryId = ii.drugInventoryId
                         WHERE ii.invoiceId = i.invoiceId
                         AND di_match.medicationId = pi.medicationId
                     )
                 )
                 ORDER BY i.invoiceDate DESC
                 LIMIT 1) as invoiceNumber,
                'paid' as invoiceStatus,
                COALESCE(
                    (SELECT di_sel.drugInventoryId FROM invoices i_sel
                     INNER JOIN invoice_items ii_sel ON ii_sel.invoiceId = i_sel.invoiceId
                     INNER JOIN drug_inventory di_sel ON di_sel.drugInventoryId = ii_sel.drugInventoryId
                     WHERE i_sel.patientId = p.patientId
                     AND i_sel.status = 'paid'
                     AND di_sel.medicationId = pi.medicationId
                     AND di_sel.quantity > 0
                     ORDER BY i_sel.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_sel2.drugInventoryId FROM invoices i_sel2
                     INNER JOIN invoice_items ii_sel2 ON ii_sel2.invoiceId = i_sel2.invoiceId
                     INNER JOIN drug_inventory di_sel2 ON di_sel2.drugInventoryId = ii_sel2.drugInventoryId
                     WHERE i_sel2.patientId = p.patientId
                     AND i_sel2.status = 'paid'
                     AND di_sel2.medicationId = pi.medicationId
                     AND di_sel2.quantity > 0
                     ORDER BY i_sel2.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_fallback.drugInventoryId FROM drug_inventory di_fallback
                     WHERE di_fallback.medicationId = pi.medicationId
                     AND di_fallback.quantity > 0
                     AND di_fallback.status = 'active'
                     AND (di_fallback.expiryDate IS NULL OR di_fallback.expiryDate >= CURDATE())
                     ORDER BY di_fallback.expiryDate ASC, di_fallback.createdAt ASC
                     LIMIT 1)
                ) as drugInventoryId,
                COALESCE(
                    (SELECT di_sel.sellPrice FROM invoices i_sel
                     INNER JOIN invoice_items ii_sel ON ii_sel.invoiceId = i_sel.invoiceId
                     INNER JOIN drug_inventory di_sel ON di_sel.drugInventoryId = ii_sel.drugInventoryId
                     WHERE i_sel.patientId = p.patientId
                     AND i_sel.status = 'paid'
                     AND di_sel.medicationId = pi.medicationId
                     ORDER BY i_sel.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_fallback.sellPrice FROM drug_inventory di_fallback
                     WHERE di_fallback.medicationId = pi.medicationId
                     AND di_fallback.quantity > 0
                     AND di_fallback.status = 'active'
                     AND (di_fallback.expiryDate IS NULL OR di_fallback.expiryDate >= CURDATE())
                     ORDER BY di_fallback.expiryDate ASC, di_fallback.createdAt ASC
                     LIMIT 1)
                ) as unitPrice,
                COALESCE(
                    (SELECT ii_sel.totalPrice FROM invoices i_sel
                     INNER JOIN invoice_items ii_sel ON ii_sel.invoiceId = i_sel.invoiceId
                     INNER JOIN drug_inventory di_sel ON di_sel.drugInventoryId = ii_sel.drugInventoryId
                     WHERE i_sel.patientId = p.patientId
                     AND i_sel.status = 'paid'
                     AND di_sel.medicationId = pi.medicationId
                     ORDER BY i_sel.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_fallback.sellPrice * pi.quantity FROM drug_inventory di_fallback
                     WHERE di_fallback.medicationId = pi.medicationId
                     AND di_fallback.quantity > 0
                     AND di_fallback.status = 'active'
                     AND (di_fallback.expiryDate IS NULL OR di_fallback.expiryDate >= CURDATE())
                     ORDER BY di_fallback.expiryDate ASC, di_fallback.createdAt ASC
                     LIMIT 1)
                ) as totalPrice,
                COALESCE(
                    (SELECT di_sel.batchNumber FROM invoices i_sel
                     INNER JOIN invoice_items ii_sel ON ii_sel.invoiceId = i_sel.invoiceId
                     INNER JOIN drug_inventory di_sel ON di_sel.drugInventoryId = ii_sel.drugInventoryId
                     WHERE i_sel.patientId = p.patientId
                     AND i_sel.status = 'paid'
                     AND di_sel.medicationId = pi.medicationId
                     ORDER BY i_sel.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_fallback.batchNumber FROM drug_inventory di_fallback
                     WHERE di_fallback.medicationId = pi.medicationId
                     AND di_fallback.quantity > 0
                     AND di_fallback.status = 'active'
                     AND (di_fallback.expiryDate IS NULL OR di_fallback.expiryDate >= CURDATE())
                     ORDER BY di_fallback.expiryDate ASC, di_fallback.createdAt ASC
                     LIMIT 1)
                ) as batchNumber,
                COALESCE(
                    (SELECT di_sel.expiryDate FROM invoices i_sel
                     INNER JOIN invoice_items ii_sel ON ii_sel.invoiceId = i_sel.invoiceId
                     INNER JOIN drug_inventory di_sel ON di_sel.drugInventoryId = ii_sel.drugInventoryId
                     WHERE i_sel.patientId = p.patientId
                     AND i_sel.status = 'paid'
                     AND di_sel.medicationId = pi.medicationId
                     ORDER BY i_sel.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_fallback.expiryDate FROM drug_inventory di_fallback
                     WHERE di_fallback.medicationId = pi.medicationId
                     AND di_fallback.quantity > 0
                     AND di_fallback.status = 'active'
                     AND (di_fallback.expiryDate IS NULL OR di_fallback.expiryDate >= CURDATE())
                     ORDER BY di_fallback.expiryDate ASC, di_fallback.createdAt ASC
                     LIMIT 1)
                ) as expiryDate,
                COALESCE(
                    (SELECT di_sel.quantity FROM invoices i_sel
                     INNER JOIN invoice_items ii_sel ON ii_sel.invoiceId = i_sel.invoiceId
                     INNER JOIN drug_inventory di_sel ON di_sel.drugInventoryId = ii_sel.drugInventoryId
                     WHERE i_sel.patientId = p.patientId
                     AND i_sel.status = 'paid'
                     AND di_sel.medicationId = pi.medicationId
                     AND di_sel.quantity > 0
                     ORDER BY i_sel.invoiceDate DESC
                     LIMIT 1),
                    (SELECT di_fallback.quantity FROM drug_inventory di_fallback
                     WHERE di_fallback.medicationId = pi.medicationId
                     AND di_fallback.quantity > 0
                     AND di_fallback.status = 'active'
                     AND (di_fallback.expiryDate IS NULL OR di_fallback.expiryDate >= CURDATE())
                     ORDER BY di_fallback.expiryDate ASC, di_fallback.createdAt ASC
                     LIMIT 1)
                ) as availableQuantity
            FROM prescription_items pi
            INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
            INNER JOIN patients pt ON p.patientId = pt.patientId
            INNER JOIN users u ON p.doctorId = u.userId
            LEFT JOIN medications m ON pi.medicationId = m.medicationId
            WHERE pi.status = 'pending'
            AND pi.medicationId IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM invoices i
                WHERE i.patientId = p.patientId
                AND i.status = 'paid'
                AND (
                    -- Match by invoice notes containing prescription number or drug payment
                    i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                    OR i.notes LIKE CONCAT('%Drug payment - Prescription: ', p.prescriptionNumber, '%')
                    OR i.notes LIKE CONCAT('%Prescription%', p.prescriptionNumber, '%')
                    OR i.notes LIKE CONCAT('%Drug payment%')
                    -- OR match by invoice items with drugInventoryId matching this medication
                    OR EXISTS (
                        SELECT 1 FROM invoice_items ii
                        INNER JOIN drug_inventory di_match ON di_match.drugInventoryId = ii.drugInventoryId
                        WHERE ii.invoiceId = i.invoiceId
                        AND di_match.medicationId = pi.medicationId
                    )
                    -- OR match by invoice items description containing medication name
                    OR EXISTS (
                        SELECT 1 FROM invoice_items ii
                        WHERE ii.invoiceId = i.invoiceId
                        AND (
                            ii.description LIKE CONCAT('%', COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, ''), '%')
                            OR ii.description LIKE CONCAT('%Prescription Item%')
                        )
                    )
                    -- OR if patient has any paid invoice with prescription-related notes, match all their pending prescriptions
                    OR (
                        i.notes LIKE CONCAT('%Drug payment%')
                        AND NOT EXISTS (
                            SELECT 1 FROM prescription_items pi_other
                            INNER JOIN prescriptions p_other ON pi_other.prescriptionId = p_other.prescriptionId
                            WHERE p_other.patientId = p.patientId
                            AND pi_other.status = 'pending'
                            AND pi_other.medicationId IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM invoices i_other
                                WHERE i_other.patientId = p.patientId
                                AND i_other.status = 'paid'
                                AND (
                                    i_other.notes LIKE CONCAT('%Prescription: ', p_other.prescriptionNumber, '%')
                                    OR EXISTS (
                                        SELECT 1 FROM invoice_items ii_other
                                        INNER JOIN drug_inventory di_other ON di_other.drugInventoryId = ii_other.drugInventoryId
                                        WHERE ii_other.invoiceId = i_other.invoiceId
                                        AND di_other.medicationId = pi_other.medicationId
                                    )
                                )
                            )
                        )
                    )
                )
            )
            AND EXISTS (
                SELECT 1 FROM drug_inventory di_check
                WHERE di_check.medicationId = pi.medicationId
                AND di_check.quantity > 0
                AND di_check.status = 'active'
                AND (di_check.expiryDate IS NULL OR di_check.expiryDate >= CURDATE())
            )
        `;
        const params = [];

        if (patientId) {
            query += ' AND p.patientId = ?';
            params.push(patientId);
        }

        query += ' ORDER BY p.prescriptionDate DESC, pi.itemId ASC';

        const [rows] = await pool.execute(query, params);
        console.log(`[PHARMACY DISPENSE] Main query returned ${rows.length} items for patient ${patientId || 'all'}`);

        // If no results with invoice_items match, try a fallback query
        if (rows.length === 0 && patientId) {
            console.log(`[PHARMACY DISPENSE] No results with invoice_items match for patient ${patientId}, trying fallback query`);

            // First, try to find prescriptions with paid invoices (more flexible matching)
            const fallbackQuery = `
                SELECT
                    pi.itemId,
                    pi.prescriptionId,
                    pi.medicationId,
                    COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, 'Unknown Medication') as medicationName,
                    pi.dosage,
                    pi.frequency,
                    pi.duration,
                    pi.quantity as prescribedQuantity,
                    pi.instructions,
                    pi.status,
                    p.prescriptionNumber,
                    p.prescriptionDate,
                    p.patientId,
                    pt.firstName as patientFirstName,
                    pt.lastName as patientLastName,
                    pt.patientNumber,
                    u.firstName as doctorFirstName,
                    u.lastName as doctorLastName,
                    i.invoiceId,
                    i.invoiceNumber,
                    i.status as invoiceStatus,
                    (SELECT di2.drugInventoryId
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as drugInventoryId,
                    (SELECT di2.sellPrice
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as unitPrice,
                    (SELECT di2.sellPrice * pi.quantity
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as totalPrice,
                    (SELECT di2.batchNumber
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as batchNumber,
                    (SELECT di2.expiryDate
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as expiryDate,
                    (SELECT di2.quantity
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as availableQuantity
                FROM prescription_items pi
                INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
                INNER JOIN patients pt ON p.patientId = pt.patientId
                INNER JOIN users u ON p.doctorId = u.userId
                LEFT JOIN medications m ON pi.medicationId = m.medicationId
                INNER JOIN invoices i ON (
                    i.patientId = p.patientId
                    AND i.status = 'paid'
                    AND (
                        i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                        OR i.notes LIKE CONCAT('%Drug payment - Prescription: ', p.prescriptionNumber, '%')
                        OR i.notes LIKE CONCAT('%Prescription%', p.prescriptionNumber, '%')
                        OR i.notes LIKE CONCAT('%', p.prescriptionNumber, '%')
                        OR i.notes LIKE CONCAT('%Prescription%')
                        OR i.notes LIKE CONCAT('%Drug payment%')
                        OR EXISTS (
                            SELECT 1 FROM invoice_items ii
                            WHERE ii.invoiceId = i.invoiceId
                            AND (
                                ii.description LIKE CONCAT('%', COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, ''), '%')
                                OR (ii.drugInventoryId IS NOT NULL AND EXISTS (
                                    SELECT 1 FROM drug_inventory di_check2
                                    WHERE di_check2.drugInventoryId = ii.drugInventoryId
                                    AND di_check2.medicationId = pi.medicationId
                                ))
                            )
                        )
                    )
                )
                WHERE pi.status = 'pending'
                AND pi.medicationId IS NOT NULL
                AND p.patientId = ?
                    OR EXISTS (
                        SELECT 1 FROM invoice_items ii2
                        WHERE ii2.invoiceId = i.invoiceId
                        AND (
                            ii2.description LIKE CONCAT('%', COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, ''), '%')
                            OR (ii2.drugInventoryId IS NOT NULL AND EXISTS (
                                SELECT 1 FROM drug_inventory di_check
                                WHERE di_check.drugInventoryId = ii2.drugInventoryId
                                AND di_check.medicationId = pi.medicationId
                            ))
                        )
                    )
                )
                AND EXISTS (
                    SELECT 1 FROM drug_inventory di_check
                    WHERE di_check.medicationId = pi.medicationId
                    AND di_check.quantity > 0
                    AND di_check.status = 'active'
                    AND (di_check.expiryDate IS NULL OR di_check.expiryDate >= CURDATE())
                )
                ORDER BY p.prescriptionDate DESC, pi.itemId ASC
            `;

            const [fallbackRows] = await pool.execute(fallbackQuery, [patientId]);
            console.log(`[PHARMACY DISPENSE] Fallback query returned ${fallbackRows.length} items`);

            if (fallbackRows.length > 0) {
                return res.status(200).json(fallbackRows);
            }

            // Last resort: Just find pending prescriptions with available inventory
            // Match by invoice items (medication name or drugInventoryId) instead of invoice notes
            console.log(`[PHARMACY DISPENSE] Fallback query also returned 0 items, trying last resort query`);
            const lastResortQuery = `
                SELECT
                    pi.itemId,
                    pi.prescriptionId,
                    pi.medicationId,
                    COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, 'Unknown Medication') as medicationName,
                    pi.dosage,
                    pi.frequency,
                    pi.duration,
                    pi.quantity as prescribedQuantity,
                    pi.instructions,
                    pi.status,
                    p.prescriptionNumber,
                    p.prescriptionDate,
                    p.patientId,
                    pt.firstName as patientFirstName,
                    pt.lastName as patientLastName,
                    pt.patientNumber,
                    u.firstName as doctorFirstName,
                    u.lastName as doctorLastName,
                    COALESCE(
                        (SELECT i.invoiceId FROM invoices i
                         INNER JOIN invoice_items ii ON i.invoiceId = ii.invoiceId
                         WHERE i.patientId = p.patientId
                         AND i.status = 'paid'
                         AND (
                             ii.description LIKE CONCAT('%', COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, ''), '%')
                             OR (ii.drugInventoryId IS NOT NULL AND EXISTS (
                                 SELECT 1 FROM drug_inventory di_check
                                 WHERE di_check.drugInventoryId = ii.drugInventoryId
                                 AND di_check.medicationId = pi.medicationId
                             ))
                         )
                         ORDER BY i.invoiceDate DESC
                         LIMIT 1),
                        (SELECT invoiceId FROM invoices WHERE patientId = p.patientId AND status = 'paid' ORDER BY invoiceDate DESC LIMIT 1)
                    ) as invoiceId,
                    COALESCE(
                        (SELECT i.invoiceNumber FROM invoices i
                         INNER JOIN invoice_items ii ON i.invoiceId = ii.invoiceId
                         WHERE i.patientId = p.patientId
                         AND i.status = 'paid'
                         AND (
                             ii.description LIKE CONCAT('%', COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, ''), '%')
                             OR (ii.drugInventoryId IS NOT NULL AND EXISTS (
                                 SELECT 1 FROM drug_inventory di_check
                                 WHERE di_check.drugInventoryId = ii.drugInventoryId
                                 AND di_check.medicationId = pi.medicationId
                             ))
                         )
                         ORDER BY i.invoiceDate DESC
                         LIMIT 1),
                        (SELECT invoiceNumber FROM invoices WHERE patientId = p.patientId AND status = 'paid' ORDER BY invoiceDate DESC LIMIT 1)
                    ) as invoiceNumber,
                    'paid' as invoiceStatus,
                    (SELECT di2.drugInventoryId
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as drugInventoryId,
                    (SELECT di2.sellPrice
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as unitPrice,
                    (SELECT di2.sellPrice * pi.quantity
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as totalPrice,
                    (SELECT di2.batchNumber
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as batchNumber,
                    (SELECT di2.expiryDate
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as expiryDate,
                    (SELECT di2.quantity
                     FROM drug_inventory di2
                     WHERE di2.medicationId = pi.medicationId
                     AND di2.quantity > 0
                     AND di2.status = 'active'
                     AND (di2.expiryDate IS NULL OR di2.expiryDate >= CURDATE())
                     ORDER BY di2.expiryDate ASC, di2.createdAt ASC
                     LIMIT 1) as availableQuantity
                FROM prescription_items pi
                INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
                INNER JOIN patients pt ON p.patientId = pt.patientId
                INNER JOIN users u ON p.doctorId = u.userId
                LEFT JOIN medications m ON pi.medicationId = m.medicationId
                WHERE pi.status = 'pending'
                AND pi.medicationId IS NOT NULL
                AND p.patientId = ?
                AND EXISTS (
                    SELECT 1 FROM invoices i2
                    INNER JOIN invoice_items ii2 ON i2.invoiceId = ii2.invoiceId
                    WHERE i2.patientId = p.patientId
                    AND i2.status = 'paid'
                    AND (
                        ii2.description LIKE CONCAT('%', COALESCE(NULLIF(pi.medicationName, 'Unknown'), m.name, ''), '%')
                        OR (ii2.drugInventoryId IS NOT NULL AND EXISTS (
                            SELECT 1 FROM drug_inventory di_check2
                            WHERE di_check2.drugInventoryId = ii2.drugInventoryId
                            AND di_check2.medicationId = pi.medicationId
                        ))
                        OR i2.notes LIKE CONCAT('%Prescription%')
                        OR i2.notes LIKE CONCAT('%Drug payment%')
                    )
                )
                AND EXISTS (
                    SELECT 1 FROM drug_inventory di_check
                    WHERE di_check.medicationId = pi.medicationId
                    AND di_check.quantity > 0
                    AND di_check.status = 'active'
                    AND (di_check.expiryDate IS NULL OR di_check.expiryDate >= CURDATE())
                )
                ORDER BY p.prescriptionDate DESC, pi.itemId ASC
            `;

            const [lastResortRows] = await pool.execute(lastResortQuery, [patientId]);
            console.log(`[PHARMACY DISPENSE] Last resort query returned ${lastResortRows.length} items`);
            return res.status(200).json(lastResortRows);
        }

        console.log(`[PHARMACY DISPENSE] Query returned ${rows.length} items for patient ${patientId || 'all'}`);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching prescription items ready for dispensing:', error);
        res.status(500).json({ message: 'Error fetching prescription items ready for dispensing', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/prescriptions/paid/ready-for-dispensing/debug
 * @description Debug endpoint to check why prescription items are not showing for a patient
 */
router.get('/prescriptions/paid/ready-for-dispensing/debug', async (req, res) => {
    try {
        const { patientId } = req.query;

        if (!patientId) {
            return res.status(400).json({ error: 'patientId is required' });
        }

        const debugInfo = {
            patientId,
            prescriptions: [],
            invoices: [],
            prescriptionItems: [],
            invoiceItems: [],
            drugInventory: [],
            issues: []
        };

        // 1. Get all prescriptions for this patient
        const [prescriptions] = await pool.execute(
            `SELECT prescriptionId, prescriptionNumber, patientId, doctorId, prescriptionDate, status, notes
             FROM prescriptions
             WHERE patientId = ?
             ORDER BY prescriptionDate DESC`,
            [patientId]
        );
        debugInfo.prescriptions = prescriptions;

        // 2. Get all prescription items
        if (prescriptions.length > 0) {
            const prescriptionIds = prescriptions.map(p => p.prescriptionId);
            const placeholders = prescriptionIds.map(() => '?').join(',');
            const [items] = await pool.execute(
                `SELECT itemId, prescriptionId, medicationId, medicationName, dosage, frequency, duration, quantity, instructions, status
                 FROM prescription_items
                 WHERE prescriptionId IN (${placeholders})`,
                prescriptionIds
            );
            debugInfo.prescriptionItems = items;

            // Check for issues
            const pendingItems = items.filter(i => i.status === 'pending');
            if (pendingItems.length === 0) {
                debugInfo.issues.push('No prescription items with status="pending"');
            }

            const itemsWithMedicationId = items.filter(i => i.medicationId !== null);
            if (itemsWithMedicationId.length === 0) {
                debugInfo.issues.push('No prescription items have medicationId (all are null)');
            }
        } else {
            debugInfo.issues.push('No prescriptions found for this patient');
        }

        // 3. Get all invoices for this patient
        const [invoices] = await pool.execute(
            `SELECT invoiceId, invoiceNumber, patientId, invoiceDate, totalAmount, paidAmount, balance, status, notes
             FROM invoices
             WHERE patientId = ?
             ORDER BY invoiceDate DESC`,
            [patientId]
        );
        debugInfo.invoices = invoices;

        // 4. Check for prescription-related invoices
        const prescriptionInvoices = invoices.filter(inv =>
            inv.notes && (
                inv.notes.includes('Prescription:') ||
                inv.notes.includes('Drug payment')
            )
        );

        if (prescriptionInvoices.length === 0) {
            debugInfo.issues.push('No invoices found with prescription-related notes');
        }

        const paidPrescriptionInvoices = prescriptionInvoices.filter(inv => inv.status === 'paid');
        if (paidPrescriptionInvoices.length === 0) {
            debugInfo.issues.push('No paid invoices found for prescriptions');
        }

        // 5. Get invoice items for prescription invoices
        if (paidPrescriptionInvoices.length > 0) {
            const invoiceIds = paidPrescriptionInvoices.map(inv => inv.invoiceId);
            const placeholders = invoiceIds.map(() => '?').join(',');
            const [invoiceItems] = await pool.execute(
                `SELECT invoiceItemId, invoiceId, description, quantity, unitPrice, totalPrice, drugInventoryId
                 FROM invoice_items
                 WHERE invoiceId IN (${placeholders})`,
                invoiceIds
            );
            debugInfo.invoiceItems = invoiceItems;

            const itemsWithDrugInventory = invoiceItems.filter(ii => ii.drugInventoryId !== null);
            if (itemsWithDrugInventory.length === 0) {
                debugInfo.issues.push('No invoice items have drugInventoryId linked');
            }
        }

        // 6. Get drug inventory for prescribed medications
        if (debugInfo.prescriptionItems.length > 0) {
            const medicationIds = debugInfo.prescriptionItems
                .filter(pi => pi.medicationId !== null)
                .map(pi => pi.medicationId);

            if (medicationIds.length > 0) {
                const uniqueMedicationIds = [...new Set(medicationIds)];
                const placeholders = uniqueMedicationIds.map(() => '?').join(',');
                const [drugInventory] = await pool.execute(
                    `SELECT drugInventoryId, medicationId, batchNumber, expiryDate, quantity, status, sellPrice
                     FROM drug_inventory
                     WHERE medicationId IN (${placeholders})
                     AND quantity > 0
                     AND status = 'active'
                     AND (expiryDate IS NULL OR expiryDate >= CURDATE())
                     ORDER BY expiryDate ASC, createdAt ASC`,
                    uniqueMedicationIds
                );
                debugInfo.drugInventory = drugInventory;

                if (drugInventory.length === 0) {
                    debugInfo.issues.push('No available drug inventory found for prescribed medications');
                }
            }
        }

        // 7. Try to match prescriptions with invoices
        const matches = [];
        for (const prescription of prescriptions) {
            const matchingInvoices = invoices.filter(inv =>
                inv.notes && (
                    inv.notes.includes(`Prescription: ${prescription.prescriptionNumber}`) ||
                    inv.notes.includes(`Drug payment - Prescription: ${prescription.prescriptionNumber}`)
                )
            );

            if (matchingInvoices.length > 0) {
                matches.push({
                    prescription: prescription.prescriptionNumber,
                    prescriptionStatus: prescription.status,
                    invoices: matchingInvoices.map(inv => ({
                        invoiceNumber: inv.invoiceNumber,
                        status: inv.status,
                        notes: inv.notes
                    }))
                });
            } else {
                debugInfo.issues.push(`Prescription ${prescription.prescriptionNumber} has no matching invoice`);
            }
        }
        debugInfo.matches = matches;

        // 8. Run the actual query to see what it returns
        const [actualResults] = await pool.execute(`
            SELECT
                pi.itemId,
                pi.prescriptionId,
                pi.medicationId,
                pi.medicationName,
                pi.status as itemStatus,
                p.prescriptionNumber,
                p.status as prescriptionStatus,
                i.invoiceId,
                i.invoiceNumber,
                i.status as invoiceStatus,
                i.notes as invoiceNotes,
                ii.drugInventoryId,
                di.quantity as availableQuantity
            FROM prescription_items pi
            INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
            LEFT JOIN invoices i ON (
                i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
                OR i.notes LIKE CONCAT('%Drug payment - Prescription: ', p.prescriptionNumber, '%')
            )
            LEFT JOIN invoice_items ii ON ii.invoiceId = i.invoiceId
            LEFT JOIN drug_inventory di ON ii.drugInventoryId = di.drugInventoryId
            WHERE p.patientId = ?
            ORDER BY p.prescriptionDate DESC
        `, [patientId]);
        debugInfo.actualQueryResults = actualResults;

        res.status(200).json(debugInfo);
    } catch (error) {
        console.error('Error in debug endpoint:', error);
        res.status(500).json({ message: 'Error in debug endpoint', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/prescriptions/:prescriptionId/items/ready-for-dispensing
 * @description Get prescription items ready for dispensing for a specific prescription
 */
router.get('/prescriptions/:prescriptionId/items/ready-for-dispensing', async (req, res) => {
    try {
        const { prescriptionId } = req.params;

        const [rows] = await pool.execute(
            `
            SELECT
                pi.itemId,
                pi.prescriptionId,
                pi.medicationId,
                pi.medicationName,
                pi.dosage,
                pi.frequency,
                pi.duration,
                pi.quantity as prescribedQuantity,
                pi.instructions,
                pi.status,
                p.prescriptionNumber,
                p.prescriptionDate,
                p.patientId,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                pt.patientNumber,
                u.firstName as doctorFirstName,
                u.lastName as doctorLastName,
                i.invoiceId,
                i.invoiceNumber,
                i.status as invoiceStatus
            FROM prescription_items pi
            INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
            INNER JOIN patients pt ON p.patientId = pt.patientId
            INNER JOIN users u ON p.doctorId = u.userId
            INNER JOIN invoices i ON i.notes LIKE CONCAT('%Prescription: ', p.prescriptionNumber, '%')
            WHERE pi.prescriptionId = ?
            AND pi.status = 'pending'
            AND i.status = 'paid'
            ORDER BY pi.itemId ASC
            `,
            [prescriptionId]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching prescription items ready for dispensing:', error);
        res.status(500).json({ message: 'Error fetching prescription items ready for dispensing', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/available/:medicationId
 * @description Get available drug inventory for a medication
 * Returns batches in FIFO order (First In First Out) - oldest batches first
 * Orders by first receipt date (earliest transaction), then by expiry date for same-day receipts
 */
router.get('/drug-inventory/available/:medicationId', async (req, res) => {
    try {
        const { medicationId } = req.params;
        const { storeId, scope = 'branch' } = req.query;
        const params = [medicationId];
        let storeFilter = '';
        if (storeId) {
            const useBranchScope = scope !== 'store';
            storeFilter = useBranchScope
                ? ` AND ${buildBranchStoreInventoryFilter('di', '?')}`
                : ` AND ${buildStoreInventoryFilter('di', '?')}`;
            const filterParams = useBranchScope
                ? branchInventoryFilterParams(storeId)
                : [storeId, storeId, storeId, storeId];
            params.push(...filterParams);
        }

        const [rows] = await pool.execute(
            `
            SELECT
                di.drugInventoryId,
                di.medicationId,
                di.batchNumber,
                di.quantity,
                di.unitPrice,
                di.sellPrice,
                di.expiryDate,
                di.location,
                di.storeId,
                di.status,
                di.createdAt,
                m.name as medicationName,
                ds.storeName,
                COALESCE(
                    (SELECT MIN(transactionDate)
                     FROM drug_inventory_transactions
                     WHERE drugInventoryId = di.drugInventoryId
                     AND transactionType = 'RECEIPT'),
                    di.createdAt
                ) as firstReceiptDate
            FROM drug_inventory di
            INNER JOIN medications m ON di.medicationId = m.medicationId
            LEFT JOIN drug_stores ds ON di.storeId = ds.storeId
            WHERE di.medicationId = ?
            AND di.quantity > 0
            AND di.status = 'active'
            AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
            ${storeFilter}
            ORDER BY
                COALESCE(
                    (SELECT MIN(transactionDate)
                     FROM drug_inventory_transactions
                     WHERE drugInventoryId = di.drugInventoryId
                     AND transactionType = 'RECEIPT'),
                    di.createdAt
                ) ASC,
                di.expiryDate ASC
            `,
            params
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching available drug inventory:', error);
        res.status(500).json({ message: 'Error fetching available drug inventory', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/dispensations
 * @description Dispense medications from prescription items
 */
router.post('/dispensations', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { prescriptionItemId, drugInventoryId, quantityDispensed, batchNumber, expiryDate, notes } = req.body;
        const userId = req.user?.id || req.user?.userId || 1;

        if (!prescriptionItemId || quantityDispensed === undefined || quantityDispensed === null || quantityDispensed === '') {
            await connection.rollback();
            return res.status(400).json({ error: 'Prescription item ID and quantity are required' });
        }

        const qtyDisp = Number(quantityDispensed);
        if (!Number.isFinite(qtyDisp) || qtyDisp <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'quantityDispensed must be a positive number' });
        }

        // 1. Get prescription item
        const [prescriptionItems] = await connection.execute(
            'SELECT * FROM prescription_items WHERE itemId = ?',
            [prescriptionItemId]
        );

        if (prescriptionItems.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Prescription item not found' });
        }

        const prescriptionItem = prescriptionItems[0];
        let drugInventory;
        let selectedDrugInventoryId = null;
        if (drugInventoryId !== undefined && drugInventoryId !== null && drugInventoryId !== '') {
            const invId = Number(drugInventoryId);
            if (!Number.isInteger(invId) || invId <= 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Invalid drugInventoryId' });
            }
            selectedDrugInventoryId = invId;
        }

        // 2. FIFO Logic / Inventory Selection
        if (!selectedDrugInventoryId && prescriptionItem.medicationId) {
            const [oldestBatches] = await connection.execute(
                `SELECT di.* FROM drug_inventory di
                 WHERE di.medicationId = ? AND di.quantity > 0 AND di.status = 'active'
                   AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
                 ORDER BY COALESCE(di.createdAt, NOW()) ASC, di.expiryDate ASC LIMIT 1`,
                [prescriptionItem.medicationId]
            );

            if (oldestBatches.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'No available stock found for this medication' });
            }
            drugInventory = oldestBatches[0];
            selectedDrugInventoryId = drugInventory.drugInventoryId;
        } else {
            const [drugInventories] = await connection.execute(
                'SELECT * FROM drug_inventory WHERE drugInventoryId = ?',
                [selectedDrugInventoryId]
            );

            if (drugInventories.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Drug inventory not found' });
            }
            drugInventory = drugInventories[0];
        }

        if (
            prescriptionItem.medicationId != null &&
            drugInventory.medicationId != null &&
            Number(prescriptionItem.medicationId) !== Number(drugInventory.medicationId)
        ) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Selected inventory batch does not match the medication on this prescription line'
            });
        }

        const availableQty = Number(drugInventory.quantity);
        if (!Number.isFinite(availableQty)) {
            await connection.rollback();
            return res.status(500).json({ error: 'Invalid quantity on hand in drug inventory record' });
        }

        if (availableQty < qtyDisp) {
            await connection.rollback();
            return res.status(400).json({ error: `Insufficient stock. Available: ${availableQty}` });
        }

        // 3. Format Dates
        let formattedExpiryDate = expiryDate || drugInventory.expiryDate;
        if (formattedExpiryDate && typeof formattedExpiryDate === 'string' && formattedExpiryDate.includes('T')) {
            formattedExpiryDate = formattedExpiryDate.split('T')[0];
        }

        // 4. Create dispensation record
        const [dispensationResult] = await connection.execute(
            `INSERT INTO dispensations
            (prescriptionItemId, dispensationDate, quantityDispensed, batchNumber, expiryDate, dispensedBy, notes)
            VALUES (?, CURDATE(), ?, ?, ?, ?, ?)`,
            [prescriptionItemId, qtyDisp, batchNumber || drugInventory.batchNumber, formattedExpiryDate || null, userId, notes || null]
        );

        const dispensationId = dispensationResult.insertId;

        // 5. Update drug inventory quantity
        const oldQuantity = availableQty;
        const newQuantity = oldQuantity - qtyDisp;

        if (newQuantity <= 0) {
            await connection.execute(
                `UPDATE drug_inventory SET quantity = 0, status = 'exhausted', dateExhausted = CURDATE(), updatedAt = NOW() WHERE drugInventoryId = ?`,
                [selectedDrugInventoryId]
            );
        } else {
            await connection.execute(
                'UPDATE drug_inventory SET quantity = ?, updatedAt = NOW() WHERE drugInventoryId = ?',
                [newQuantity, selectedDrugInventoryId]
            );
        }

        // 6. Record transaction in drug_inventory_transactions (FIXED MAPPING)
        const [prescriptionInfo] = await connection.execute(
            `SELECT p.patientId, p.prescriptionId FROM prescriptions p
             INNER JOIN prescription_items pi ON p.prescriptionId = pi.prescriptionId WHERE pi.itemId = ?`,
            [prescriptionItemId]
        );
        const patientId = prescriptionInfo.length > 0 ? prescriptionInfo[0].patientId : null;
        const prescriptionId = prescriptionInfo.length > 0 ? prescriptionInfo[0].prescriptionId : null;

        const transactionDate = new Date().toISOString().split('T')[0];
        const unitPrice = drugInventory.unitPrice || 0;
        const sellPrice = drugInventory.sellPrice || 0;

        try {
            await connection.execute(
                `INSERT INTO drug_inventory_transactions
                (drugInventoryId, patientId, prescriptionId, dispensationId, transactionType, transactionDate,
                 quantityChange, quantityBefore, quantityAfter, balanceAfter, unitPrice, sellPrice,
                 totalValue, totalSellValue, referenceType, referenceId, referenceNumber, performedBy, notes)
                VALUES (?, ?, ?, ?, 'DISPENSATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispensation', ?, ?, ?, ?)`,
                [
                    selectedDrugInventoryId, patientId, prescriptionId, dispensationId,
                    transactionDate, -qtyDisp, oldQuantity, newQuantity,
                    newQuantity, unitPrice, sellPrice, qtyDisp * unitPrice,
                    qtyDisp * sellPrice, dispensationId, `DISP-${dispensationId}`, userId,
                    `Dispensed ${qtyDisp} units. Batch: ${drugInventory.batchNumber}`
                ]
            );
        } catch (txError) {
            throw new Error(`Inventory Transaction failed: ${txError.message}`);
        }

        // 7. Record Stock Adjustment (Secondary record)
        try {
            const expForAdj = drugInventory.expiryDate || new Date(Date.now() + 31536000000).toISOString().split('T')[0];
            await connection.execute(
                `INSERT INTO drug_stock_adjustments
                (drugInventoryId, medicationId, adjustmentType, adjustmentDate, quantity, batchNumber, unitPrice, sellPrice,
                 expiryDate, location, patientId, prescriptionId, dispensationId, referenceType, referenceId, referenceNumber, performedBy, notes)
                VALUES (?, ?, 'DISPENSATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispensation', ?, ?, ?, ?)`,
                [
                    selectedDrugInventoryId, drugInventory.medicationId, transactionDate, -qtyDisp,
                    drugInventory.batchNumber || 'UNKNOWN', unitPrice, sellPrice, expForAdj,
                    drugInventory.location || null, patientId, prescriptionId, dispensationId,
                    dispensationId, `DISP-${dispensationId}`, userId, `Dispensed ${qtyDisp} units`
                ]
            );
        } catch (adjError) {
            console.error('Adjustment log failed:', adjError.message);
        }

        // 8. Update prescription status
        const prescribedQty = Number(prescriptionItem.quantity);
        if (Number.isFinite(prescribedQty) && qtyDisp >= prescribedQty) {
            await connection.execute('UPDATE prescription_items SET status = "dispensed", updatedAt = NOW() WHERE itemId = ?', [prescriptionItemId]);
        }

        const [pendingItems] = await connection.execute('SELECT COUNT(*) as count FROM prescription_items WHERE prescriptionId = ? AND status = "pending"', [prescriptionItem.prescriptionId]);
        let prescriptionFullyDispensed = false;
        if (pendingItems[0].count === 0) {
            await connection.execute('UPDATE prescriptions SET status = "dispensed", updatedAt = NOW() WHERE prescriptionId = ?', [prescriptionItem.prescriptionId]);
            prescriptionFullyDispensed = true;
        }

        // 9. Check if patient should be removed from pharmacy queue
        // Check if patient has any remaining pending prescription items
        if (patientId) {
            const [remainingPendingItems] = await connection.execute(
                `SELECT COUNT(*) as count
                 FROM prescription_items pi
                 INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
                 WHERE p.patientId = ? AND pi.status = 'pending'`,
                [patientId]
            );

            // If no pending items remain, complete the pharmacy queue entry
            if (remainingPendingItems[0].count === 0) {
                const [pharmacyQueues] = await connection.execute(
                    `SELECT queueId FROM queue_entries
                     WHERE patientId = ? AND servicePoint = 'pharmacy'
                     AND status NOT IN ('completed', 'cancelled')
                     ORDER BY queueId DESC
                     LIMIT 1`,
                    [patientId]
                );

                if (pharmacyQueues.length > 0) {
                    await connection.execute(
                        `UPDATE queue_entries
                         SET status = 'completed', endTime = NOW(), updatedAt = NOW(),
                             notes = CONCAT(COALESCE(notes, ''), ' - All medications dispensed')
                         WHERE queueId = ?`,
                        [pharmacyQueues[0].queueId]
                    );
                    console.log(`[PHARMACY DISPENSE] Completed pharmacy queue entry ${pharmacyQueues[0].queueId} for patient ${patientId} - all medications dispensed`);
                }
            }
        }

        await connection.commit();

        // 9. Return result
        const [result] = await connection.execute(
            `SELECT d.*, pi.medicationName, u.firstName as dispensedByFirstName
             FROM dispensations d
             INNER JOIN prescription_items pi ON d.prescriptionItemId = pi.itemId
             INNER JOIN users u ON d.dispensedBy = u.userId
             WHERE d.dispensationId = ?`, [dispensationId]
        );

        if (prescriptionFullyDispensed && patientId) {
            try {
                const [prescRows] = await connection.execute(
                    'SELECT prescriptionNumber FROM prescriptions WHERE prescriptionId = ? LIMIT 1',
                    [prescriptionId]
                );
                notifyPrescriptionReady(patientId, {
                    prescriptionNumber: prescRows[0]?.prescriptionNumber,
                });
            } catch (smsErr) {
                console.error('[SMS] prescription ready notify skipped:', smsErr.message || smsErr);
            }
        }

        res.status(201).json(result[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Dispensation Error:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    } finally {
        connection.release();
    }
});
/**
 * @route GET /api/pharmacy/batch-trace/:batchNumber
 * @description Trace all patients who received drugs from a specific batch number
 */
router.get('/batch-trace/:batchNumber', async (req, res) => {
    try {
        const { batchNumber } = req.params;

        if (!batchNumber) {
            return res.status(400).json({ message: 'Batch number is required' });
        }

        const [rows] = await pool.execute(
            `
            SELECT
                d.dispensationId,
                d.dispensationDate,
                d.quantityDispensed,
                d.batchNumber,
                d.expiryDate,
                d.notes as dispensationNotes,
                d.createdAt as dispensedAt,

                -- Prescription item details
                pi.itemId as prescriptionItemId,
                pi.medicationName,
                pi.dosage,
                pi.frequency,
                pi.duration,
                pi.instructions,

                -- Prescription details
                p.prescriptionId,
                p.prescriptionNumber,
                p.prescriptionDate,
                p.status as prescriptionStatus,

                -- Patient details
                pt.patientId,
                pt.patientNumber,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                pt.phone as patientPhone,
                pt.dateOfBirth,
                pt.gender,

                -- Doctor details
                dr.firstName as doctorFirstName,
                dr.lastName as doctorLastName,
                dr.username as doctorUsername,

                -- Dispensed by details
                dispenser.firstName as dispensedByFirstName,
                dispenser.lastName as dispensedByLastName,
                dispenser.username as dispensedByUsername,

                -- Medication details
                m.medicationId,
                m.medicationCode,
                m.name as medicationFullName,
                m.genericName,
                m.dosageForm,
                m.strength,
                m.manufacturer

            FROM dispensations d
            INNER JOIN prescription_items pi ON d.prescriptionItemId = pi.itemId
            INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
            INNER JOIN patients pt ON p.patientId = pt.patientId
            INNER JOIN users dr ON p.doctorId = dr.userId
            INNER JOIN users dispenser ON d.dispensedBy = dispenser.userId
            LEFT JOIN medications m ON pi.medicationId = m.medicationId
            WHERE d.batchNumber = ?
            ORDER BY d.dispensationDate DESC, p.prescriptionDate DESC
            `,
            [batchNumber]
        );

        // Also get batch information from drug_inventory
        const [batchInfo] = await pool.execute(
            `
            SELECT
                di.drugInventoryId,
                di.medicationId,
                di.batchNumber,
                di.quantity as currentQuantity,
                di.unitPrice,
                di.manufactureDate,
                di.expiryDate,
                di.minPrice,
                di.sellPrice,
                di.location,
                di.notes,
                di.createdAt,
                m.name as medicationName,
                m.medicationCode,
                m.genericName
            FROM drug_inventory di
            LEFT JOIN medications m ON di.medicationId = m.medicationId
            WHERE di.batchNumber = ?
            LIMIT 1
            `,
            [batchNumber]
        );

        res.status(200).json({
            batchNumber: batchNumber,
            batchInfo: batchInfo.length > 0 ? batchInfo[0] : null,
            dispensations: rows,
            totalDispensations: rows.length,
            totalQuantityDispensed: rows.reduce((sum, row) => sum + (row.quantityDispensed || 0), 0),
            uniquePatients: [...new Set(rows.map(row => row.patientId))].length
        });
    } catch (error) {
        console.error('Error tracing batch number:', error);
        res.status(500).json({ message: 'Error tracing batch number', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/batch-trace
 * @description Get all unique batch numbers with summary information (for search/listing)
 */
router.get('/batch-trace', async (req, res) => {
    try {
        const { search, medicationId } = req.query;

        let query = `
            SELECT DISTINCT
                d.batchNumber,
                COUNT(DISTINCT d.dispensationId) as dispensationCount,
                COUNT(DISTINCT p.patientId) as patientCount,
                SUM(d.quantityDispensed) as totalQuantityDispensed,
                MIN(d.dispensationDate) as firstDispensationDate,
                MAX(d.dispensationDate) as lastDispensationDate,
                di.expiryDate,
                di.medicationId,
                m.name as medicationName,
                m.medicationCode
            FROM dispensations d
            INNER JOIN prescription_items pi ON d.prescriptionItemId = pi.itemId
            INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
            LEFT JOIN drug_inventory di ON d.batchNumber = di.batchNumber
            LEFT JOIN medications m ON COALESCE(pi.medicationId, di.medicationId) = m.medicationId
            WHERE d.batchNumber IS NOT NULL AND d.batchNumber != ''
        `;

        const params = [];

        if (search) {
            query += ` AND (d.batchNumber LIKE ? OR m.name LIKE ? OR m.genericName LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (medicationId) {
            query += ` AND (pi.medicationId = ? OR di.medicationId = ?)`;
            params.push(medicationId, medicationId);
        }

        query += `
            GROUP BY d.batchNumber, di.expiryDate, di.medicationId, m.name, m.medicationCode
            ORDER BY MAX(d.dispensationDate) DESC
            LIMIT 100
        `;

        const [rows] = await pool.execute(query, params);

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching batch trace list:', error);
        res.status(500).json({ message: 'Error fetching batch trace list', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/:id/transactions
 * @description Get complete transaction history for a specific batch (drugInventoryId)
 * Shows all receipts, dispensations, adjustments, etc. for the batch
 */
router.get('/drug-inventory/:id/transactions', async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, transactionType } = req.query;

        let query = `
            SELECT
                dit.transactionId,
                dit.drugInventoryId,
                di.batchNumber,
                di.medicationId,
                m.name as medicationName,
                m.medicationCode,
                dit.transactionType,
                dit.transactionDate,
                dit.transactionTime,
                dit.quantityChange,
                dit.quantityBefore,
                dit.quantityAfter,
                dit.balanceAfter,
                dit.unitPrice,
                dit.sellPrice,
                dit.totalValue,
                dit.totalSellValue,
                dit.referenceType,
                dit.referenceId,
                dit.referenceNumber,
                dit.patientId,
                p.firstName as patientFirstName,
                p.lastName as patientLastName,
                p.patientNumber,
                dit.prescriptionId,
                pr.prescriptionNumber,
                u.firstName as performedByFirstName,
                u.lastName as performedByLastName,
                dit.notes,
                di.originalQuantity,
                di.quantity as currentQuantity,
                di.status as batchStatus,
                di.dateExhausted,
                di.expiryDate
            FROM drug_inventory_transactions dit
            INNER JOIN drug_inventory di ON dit.drugInventoryId = di.drugInventoryId
            LEFT JOIN medications m ON di.medicationId = m.medicationId
            LEFT JOIN users u ON dit.performedBy = u.userId
            LEFT JOIN patients p ON dit.patientId = p.patientId
            LEFT JOIN prescriptions pr ON dit.prescriptionId = pr.prescriptionId
            WHERE dit.drugInventoryId = ?
        `;
        const params = [id];

        if (startDate) {
            query += ` AND dit.transactionDate >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND dit.transactionDate <= ?`;
            params.push(endDate);
        }

        if (transactionType) {
            query += ` AND dit.transactionType = ?`;
            params.push(transactionType);
        }

        query += ` ORDER BY dit.transactionDate DESC, dit.transactionTime DESC`;

        const [rows] = await pool.execute(query, params);

        // Get batch summary
        const [batchSummary] = await pool.execute(
            `SELECT
                di.drugInventoryId,
                di.batchNumber,
                di.medicationId,
                m.name as medicationName,
                m.medicationCode,
                di.originalQuantity,
                di.quantity as currentQuantity,
                di.status,
                di.dateExhausted,
                di.expiryDate,
                di.unitPrice,
                di.sellPrice,
                di.location,
                di.createdAt as batchCreatedAt
             FROM drug_inventory di
             LEFT JOIN medications m ON di.medicationId = m.medicationId
             WHERE di.drugInventoryId = ?`,
            [id]
        );

        res.status(200).json({
            batch: batchSummary[0] || null,
            transactions: rows,
            totalTransactions: rows.length,
            summary: {
                totalReceived: rows.filter(t => t.transactionType === 'RECEIPT').reduce((sum, t) => sum + t.quantityChange, 0),
                totalDispensed: Math.abs(rows.filter(t => t.transactionType === 'DISPENSATION').reduce((sum, t) => sum + t.quantityChange, 0)),
                totalAdjustments: rows.filter(t => t.transactionType === 'ADJUSTMENT').reduce((sum, t) => sum + t.quantityChange, 0),
                firstTransaction: rows.length > 0 ? rows[rows.length - 1] : null,
                lastTransaction: rows.length > 0 ? rows[0] : null
            }
        });
    } catch (error) {
        console.error('Error fetching drug inventory transactions:', error);
        res.status(500).json({ message: 'Error fetching drug inventory transactions', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/batch/:batchNumber/transactions
 * @description Get complete transaction history for a batch by batch number
 */
router.get('/drug-inventory/batch/:batchNumber/transactions', async (req, res) => {
    try {
        const { batchNumber } = req.params;
        const { startDate, endDate, transactionType } = req.query;

        // First, find the drugInventoryId for this batch
        const [batches] = await pool.execute(
            'SELECT drugInventoryId FROM drug_inventory WHERE batchNumber = ? ORDER BY createdAt DESC LIMIT 1',
            [batchNumber]
        );

        if (batches.length === 0) {
            return res.status(404).json({ message: 'Batch not found' });
        }

        const drugInventoryId = batches[0].drugInventoryId;

        // Redirect to the drugInventoryId endpoint or query directly
        let query = `
            SELECT
                dit.transactionId,
                dit.drugInventoryId,
                di.batchNumber,
                di.medicationId,
                m.name as medicationName,
                m.medicationCode,
                dit.transactionType,
                dit.transactionDate,
                dit.transactionTime,
                dit.quantityChange,
                dit.quantityBefore,
                dit.quantityAfter,
                dit.balanceAfter,
                dit.unitPrice,
                dit.totalValue,
                dit.referenceType,
                dit.referenceId,
                dit.referenceNumber,
                u.firstName as performedByFirstName,
                u.lastName as performedByLastName,
                dit.notes
            FROM drug_inventory_transactions dit
            INNER JOIN drug_inventory di ON dit.drugInventoryId = di.drugInventoryId
            LEFT JOIN medications m ON di.medicationId = m.medicationId
            LEFT JOIN users u ON dit.performedBy = u.userId
            WHERE dit.drugInventoryId = ?
        `;
        const params = [drugInventoryId];

        if (startDate) {
            query += ` AND dit.transactionDate >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND dit.transactionDate <= ?`;
            params.push(endDate);
        }

        if (transactionType) {
            query += ` AND dit.transactionType = ?`;
            params.push(transactionType);
        }

        query += ` ORDER BY dit.transactionDate DESC, dit.transactionTime DESC`;

        const [rows] = await pool.execute(query, params);

        res.status(200).json({
            batchNumber: batchNumber,
            drugInventoryId: drugInventoryId,
            transactions: rows,
            totalTransactions: rows.length
        });
    } catch (error) {
        console.error('Error fetching batch transactions:', error);
        res.status(500).json({ message: 'Error fetching batch transactions', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/medication/:medicationId/history
 * @description Get complete inventory history for a medication (all batches)
 */
router.get('/drug-inventory/medication/:medicationId/history', async (req, res) => {
    try {
        const { medicationId } = req.params;
        const { startDate, endDate, status } = req.query;

        // Get all batches for this medication
        let batchQuery = `
            SELECT
                di.drugInventoryId,
                di.batchNumber,
                di.originalQuantity,
                di.quantity as currentQuantity,
                di.status,
                di.dateExhausted,
                di.expiryDate,
                di.unitPrice,
                di.sellPrice,
                di.createdAt as batchCreatedAt,
                di.updatedAt as batchUpdatedAt
            FROM drug_inventory di
            WHERE di.medicationId = ?
        `;
        const batchParams = [medicationId];

        if (status) {
            batchQuery += ` AND di.status = ?`;
            batchParams.push(status);
        }

        batchQuery += ` ORDER BY di.createdAt DESC`;

        const [batches] = await pool.execute(batchQuery, batchParams);

        // Get all transactions for all batches of this medication
        let transactionQuery = `
            SELECT
                dit.*,
                di.batchNumber,
                di.medicationId,
                m.name as medicationName,
                m.medicationCode,
                u.firstName as performedByFirstName,
                u.lastName as performedByLastName
            FROM drug_inventory_transactions dit
            INNER JOIN drug_inventory di ON dit.drugInventoryId = di.drugInventoryId
            LEFT JOIN medications m ON di.medicationId = m.medicationId
            LEFT JOIN users u ON dit.performedBy = u.userId
            WHERE di.medicationId = ?
        `;
        const transactionParams = [medicationId];

        if (startDate) {
            transactionQuery += ` AND dit.transactionDate >= ?`;
            transactionParams.push(startDate);
        }

        if (endDate) {
            transactionQuery += ` AND dit.transactionDate <= ?`;
            transactionParams.push(endDate);
        }

        transactionQuery += ` ORDER BY dit.transactionDate DESC, dit.transactionTime DESC`;

        const [transactions] = await pool.execute(transactionQuery, transactionParams);

        // Get medication info
        const [medication] = await pool.execute(
            'SELECT * FROM medications WHERE medicationId = ?',
            [medicationId]
        );

        res.status(200).json({
            medication: medication[0] || null,
            batches: batches,
            transactions: transactions,
            summary: {
                totalBatches: batches.length,
                activeBatches: batches.filter(b => b.status === 'active').length,
                exhaustedBatches: batches.filter(b => b.status === 'exhausted').length,
                totalTransactions: transactions.length,
                totalReceived: transactions.filter(t => t.transactionType === 'RECEIPT').reduce((sum, t) => sum + t.quantityChange, 0),
                totalDispensed: Math.abs(transactions.filter(t => t.transactionType === 'DISPENSATION').reduce((sum, t) => sum + t.quantityChange, 0)),
                currentStock: batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0)
            }
        });
    } catch (error) {
        console.error('Error fetching medication inventory history:', error);
        res.status(500).json({ message: 'Error fetching medication inventory history', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-inventory/:id/stock-levels
 * @description Get historical stock levels at different points in time (snapshots)
 * Useful for seeing inventory levels over time
 */
router.get('/drug-inventory/:id/stock-levels', async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        // Get all transactions ordered by date
        let query = `
            SELECT
                dit.transactionDate,
                dit.transactionTime,
                dit.transactionType,
                dit.balanceAfter as stockLevel,
                dit.quantityChange,
                dit.referenceNumber,
                dit.notes
            FROM drug_inventory_transactions dit
            WHERE dit.drugInventoryId = ?
        `;
        const params = [id];

        if (startDate) {
            query += ` AND dit.transactionDate >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND dit.transactionDate <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY dit.transactionDate ASC, dit.transactionTime ASC`;

        const [rows] = await pool.execute(query, params);

        // Get batch info
        const [batch] = await pool.execute(
            `SELECT
                di.*,
                m.name as medicationName,
                m.medicationCode
             FROM drug_inventory di
             LEFT JOIN medications m ON di.medicationId = m.medicationId
             WHERE di.drugInventoryId = ?`,
            [id]
        );

        res.status(200).json({
            batch: batch[0] || null,
            stockLevels: rows,
            summary: {
                initialStock: rows.length > 0 ? rows[0].stockLevel - rows[0].quantityChange : 0,
                finalStock: rows.length > 0 ? rows[rows.length - 1].stockLevel : 0,
                minStock: rows.length > 0 ? Math.min(...rows.map(r => r.stockLevel)) : 0,
                maxStock: rows.length > 0 ? Math.max(...rows.map(r => r.stockLevel)) : 0,
                dataPoints: rows.length
            }
        });
    } catch (error) {
        console.error('Error fetching stock levels:', error);
        res.status(500).json({ message: 'Error fetching stock levels', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-history
 * @description Get comprehensive drug history with filters
 * Supports filtering by medication, patient, date range, batch, type, etc.
 */
router.get('/drug-history', async (req, res) => {
    try {
        const {
            medicationId,
            patientId,
            batchNumber,
            adjustmentType,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 50
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
            SELECT
                dsa.*,
                m.name as medicationName,
                m.medicationCode,
                m.genericName,
                p.firstName as patientFirstName,
                p.lastName as patientLastName,
                p.patientNumber,
                pr.prescriptionNumber,
                u.firstName as performedByFirstName,
                u.lastName as performedByLastName
            FROM drug_stock_adjustments dsa
            INNER JOIN medications m ON dsa.medicationId = m.medicationId
            LEFT JOIN patients p ON dsa.patientId = p.patientId
            LEFT JOIN prescriptions pr ON dsa.prescriptionId = pr.prescriptionId
            LEFT JOIN users u ON dsa.performedBy = u.userId
            WHERE 1=1
        `;
        const params = [];

        if (medicationId && medicationId !== "all") {
            query += ` AND dsa.medicationId = ?`;
            params.push(medicationId);
        }

        if (patientId && patientId !== "all") {
            query += ` AND dsa.patientId = ?`;
            params.push(patientId);
        }

        if (batchNumber && batchNumber !== "all") {
            query += ` AND dsa.batchNumber = ?`;
            params.push(batchNumber);
        }

        if (adjustmentType && adjustmentType !== "all") {
            query += ` AND dsa.adjustmentType = ?`;
            params.push(adjustmentType);
        }

        if (startDate) {
            query += ` AND dsa.adjustmentDate >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND dsa.adjustmentDate <= ?`;
            params.push(endDate);
        }

        if (search) {
            query += ` AND (
                m.name LIKE ? OR
                m.medicationCode LIKE ? OR
                dsa.batchNumber LIKE ? OR
                p.firstName LIKE ? OR
                p.lastName LIKE ? OR
                p.patientNumber LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Get total count (before adding LIMIT/OFFSET)
        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered`;
        const countParams = [...params]; // Copy params for count query
        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0].total;

        // Add ordering and pagination to main query (use direct values for LIMIT/OFFSET)
        const safeLimit = parseInt(limit) || 50;
        const safeOffset = parseInt(offset) || 0;
        query += ` ORDER BY dsa.adjustmentDate DESC, dsa.adjustmentTime DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

        const [rows] = await pool.execute(query, params);

        res.status(200).json({
            adjustments: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching drug history:', error);
        res.status(500).json({ message: 'Error fetching drug history', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-history/patient/:patientId
 * @description Get drug history for a specific patient
 */
router.get('/drug-history/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const { startDate, endDate } = req.query;

        let query = `
            SELECT
                dsa.*,
                m.name as medicationName,
                m.medicationCode,
                pr.prescriptionNumber,
                u.firstName as performedByFirstName,
                u.lastName as performedByLastName
            FROM drug_stock_adjustments dsa
            INNER JOIN medications m ON dsa.medicationId = m.medicationId
            LEFT JOIN prescriptions pr ON dsa.prescriptionId = pr.prescriptionId
            LEFT JOIN users u ON dsa.performedBy = u.userId
            WHERE dsa.patientId = ? AND dsa.adjustmentType = 'DISPENSATION'
        `;
        const params = [patientId];

        if (startDate) {
            query += ` AND dsa.adjustmentDate >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND dsa.adjustmentDate <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY dsa.adjustmentDate DESC, dsa.adjustmentTime DESC`;

        const [rows] = await pool.execute(query, params);

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching patient drug history:', error);
        res.status(500).json({ message: 'Error fetching patient drug history', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/stock-adjustments
 * @description Create a stock adjustment (manual stock movement)
 * Supports: RECEIPT, DISPENSATION, ADJUSTMENT, TRANSFER, EXPIRY, DAMAGE, RETURN, CORRECTION
 */
router.post('/stock-adjustments', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            drugInventoryId,
            medicationId,
            adjustmentType,
            adjustmentDate,
            quantity,
            batchNumber,
            unitPrice,
            sellPrice,
            manufactureDate,
            expiryDate,
            minPrice,
            location,
            referenceType,
            referenceId,
            referenceNumber,
            notes
        } = req.body;

        const userId = req.user?.id || req.user?.userId || 1;

        // Validate required fields
        if (!medicationId || !adjustmentType || !adjustmentDate || quantity === undefined) {
            await connection.rollback();
            return res.status(400).json({ error: 'medicationId, adjustmentType, adjustmentDate, and quantity are required' });
        }

        // For RECEIPT, batchNumber is required
        if (adjustmentType === 'RECEIPT' && !batchNumber) {
            await connection.rollback();
            return res.status(400).json({ error: 'batchNumber is required for RECEIPT adjustments' });
        }

        let drugInventory;
        let actualDrugInventoryId = drugInventoryId;
        let isNewBatch = false;

        // For RECEIPT adjustments, check if batch already exists, if not create new batch
        if (adjustmentType === 'RECEIPT' && batchNumber) {
            // Check if batch already exists
            const [existingBatches] = await connection.execute(
                'SELECT * FROM drug_inventory WHERE batchNumber = ? AND medicationId = ?',
                [batchNumber, medicationId]
            );

            if (existingBatches.length > 0) {
                // Batch exists, use it
                drugInventory = existingBatches[0];
                actualDrugInventoryId = drugInventory.drugInventoryId;
                isNewBatch = false;
            } else {
                // Create new batch
                if (!unitPrice || !sellPrice || !expiryDate) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'unitPrice, sellPrice, and expiryDate are required when creating a new batch' });
                }

                const [newBatchResult] = await connection.execute(
                    `INSERT INTO drug_inventory
                     (medicationId, batchNumber, quantity, unitPrice, sellPrice, minPrice, manufactureDate, expiryDate, location, notes, status, originalQuantity)
                     VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                    [
                        medicationId,
                        batchNumber,
                        unitPrice,
                        sellPrice,
                        minPrice || null,
                        manufactureDate || null,
                        expiryDate,
                        location || null,
                        notes || null,
                        Math.abs(quantity) // originalQuantity
                    ]
                );

                actualDrugInventoryId = newBatchResult.insertId;
                isNewBatch = true;

                // Get the newly created batch
                const [newBatches] = await connection.execute(
                    'SELECT * FROM drug_inventory WHERE drugInventoryId = ?',
                    [actualDrugInventoryId]
                );
                drugInventory = newBatches[0];
            }
        } else {
            // For non-RECEIPT adjustments, drugInventoryId is required
            if (!drugInventoryId) {
                await connection.rollback();
                return res.status(400).json({ error: 'drugInventoryId is required for non-RECEIPT adjustments' });
            }

            // Get current drug inventory
            const [drugInventories] = await connection.execute(
                'SELECT * FROM drug_inventory WHERE drugInventoryId = ?',
                [drugInventoryId]
            );

            if (drugInventories.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Drug inventory not found' });
            }

            drugInventory = drugInventories[0];
            actualDrugInventoryId = drugInventoryId;
            isNewBatch = false;
        }

        // Calculate new quantity based on adjustment type
        let newQuantity = drugInventory.quantity;
        if (adjustmentType === 'RECEIPT') {
            newQuantity += quantity; // Positive for receipts
        } else if (adjustmentType === 'DISPENSATION') {
            newQuantity -= Math.abs(quantity); // Negative for dispensations
        } else if (adjustmentType === 'ADJUSTMENT' || adjustmentType === 'CORRECTION') {
            // Adjustments can be positive or negative
            newQuantity += quantity;
        } else if (['EXPIRY', 'DAMAGE', 'TRANSFER', 'RETURN'].includes(adjustmentType)) {
            // These are typically negative (removing stock)
            newQuantity -= Math.abs(quantity);
        }

        // Ensure quantity doesn't go negative (unless it's an adjustment/correction that explicitly allows it)
        if (newQuantity < 0 && adjustmentType !== 'ADJUSTMENT' && adjustmentType !== 'CORRECTION') {
            await connection.rollback();
            return res.status(400).json({ error: `Adjustment would result in negative quantity. Current: ${drugInventory.quantity}, Adjustment: ${quantity}` });
        }

        if (newQuantity < 0) {
            newQuantity = 0; // Prevent negative quantities
        }

        // Update drug inventory quantity
        let batchStatus = drugInventory.status || 'active';
        let dateExhausted = null;

        if (newQuantity <= 0 && adjustmentType !== 'RECEIPT') {
            batchStatus = 'exhausted';
            dateExhausted = adjustmentDate || new Date().toISOString().split('T')[0];
        } else if (newQuantity > 0 && drugInventory.status === 'exhausted') {
            batchStatus = 'active';
            dateExhausted = null;
        }

        // Update drug inventory (also update originalQuantity for RECEIPT if it's the first receipt)
        if (adjustmentType === 'RECEIPT') {
            // For RECEIPT, also update originalQuantity if it's the first receipt transaction
            const [existingTransactions] = await connection.execute(
                'SELECT COUNT(*) as count FROM drug_inventory_transactions WHERE drugInventoryId = ? AND transactionType = "RECEIPT"',
                [actualDrugInventoryId]
            );

            if (existingTransactions[0].count === 0) {
                // First receipt, update originalQuantity
                await connection.execute(
                    `UPDATE drug_inventory
                     SET quantity = ?,
                         originalQuantity = ?,
                         status = ?,
                         dateExhausted = ?,
                         updatedAt = NOW()
                     WHERE drugInventoryId = ?`,
                    [newQuantity, newQuantity, batchStatus, dateExhausted, actualDrugInventoryId]
                );
            } else {
                // Subsequent receipt
                await connection.execute(
                    `UPDATE drug_inventory
                     SET quantity = ?,
                         status = ?,
                         dateExhausted = ?,
                         updatedAt = NOW()
                     WHERE drugInventoryId = ?`,
                    [newQuantity, batchStatus, dateExhausted, actualDrugInventoryId]
                );
            }
        } else {
            // For other adjustments
            await connection.execute(
                `UPDATE drug_inventory
                 SET quantity = ?,
                     status = ?,
                     dateExhausted = ?,
                     updatedAt = NOW()
                 WHERE drugInventoryId = ?`,
                [newQuantity, batchStatus, dateExhausted, actualDrugInventoryId]
            );
        }

        // Create stock adjustment record
        const adjustmentDateValue = adjustmentDate || new Date().toISOString().split('T')[0];
        const [adjustmentResult] = await connection.execute(
            `INSERT INTO drug_stock_adjustments
             (drugInventoryId, medicationId, adjustmentType, adjustmentDate, quantity, batchNumber, unitPrice, sellPrice,
              manufactureDate, expiryDate, minPrice, location, referenceType, referenceId, referenceNumber, performedBy, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                actualDrugInventoryId,
                medicationId,
                adjustmentType,
                adjustmentDateValue,
                quantity,
                batchNumber || drugInventory.batchNumber,
                unitPrice || drugInventory.unitPrice || 0,
                sellPrice || drugInventory.sellPrice || 0,
                manufactureDate || drugInventory.manufactureDate || null,
                expiryDate || drugInventory.expiryDate || null,
                minPrice || drugInventory.minPrice || null,
                location || drugInventory.location || null,
                referenceType || null,
                referenceId || null,
                referenceNumber || null,
                userId,
                notes || null
            ]
        );

        const adjustmentId = adjustmentResult.insertId;

        // Create transaction record for history
        try {
            const transactionDate = adjustmentDateValue;
            const oldQuantity = isNewBatch ? 0 : drugInventory.quantity;
            const quantityChange = adjustmentType === 'RECEIPT' ? Math.abs(quantity) : quantity; // Positive for receipts
            const quantityBefore = oldQuantity;
            const quantityAfter = newQuantity;
            const balanceAfter = newQuantity;
            const unitPriceForTransaction = unitPrice || drugInventory.unitPrice || 0;
            const sellPriceForTransaction = sellPrice || drugInventory.sellPrice || 0;
            const totalValue = quantityChange * unitPriceForTransaction;
            const totalSellValue = quantityChange * sellPriceForTransaction;

            await connection.execute(
                `INSERT INTO drug_inventory_transactions
                 (drugInventoryId, transactionType, transactionDate, quantityChange, quantityBefore, quantityAfter, balanceAfter,
                  unitPrice, sellPrice, totalValue, totalSellValue, referenceType, referenceId, referenceNumber, performedBy, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    actualDrugInventoryId,
                    adjustmentType,
                    transactionDate,
                    quantityChange,
                    quantityBefore,
                    quantityAfter,
                    balanceAfter,
                    unitPriceForTransaction,
                    sellPriceForTransaction,
                    totalValue,
                    totalSellValue,
                    referenceType || null,
                    referenceId || null,
                    referenceNumber || null,
                    userId,
                    notes || `Stock adjustment: ${adjustmentType}. ${notes || ''}`
                ]
            );
        } catch (transactionError) {
            console.error('Error recording stock adjustment transaction:', transactionError);
            // Don't fail if transaction logging fails
        }

        await connection.commit();

        const storeIdForCheck = drugInventory.storeId || null;
        if (storeIdForCheck) {
            await checkStoreReorderLevels(pool, {
                storeId: storeIdForCheck,
                medicationId,
            }).catch(() => {});
        }

        // Get created adjustment with details
        const [createdAdjustment] = await connection.execute(
            `SELECT
                dsa.*,
                m.name as medicationName,
                m.medicationCode,
                u.firstName as performedByFirstName,
                u.lastName as performedByLastName
             FROM drug_stock_adjustments dsa
             LEFT JOIN medications m ON dsa.medicationId = m.medicationId
             LEFT JOIN users u ON dsa.performedBy = u.userId
             WHERE dsa.adjustmentId = ?`,
            [adjustmentId]
        );

        res.status(201).json(createdAdjustment[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating stock adjustment:', error);
        res.status(500).json({ message: 'Error creating stock adjustment', error: error.message });
    } finally {
        connection.release();
    }
});

// ============================================
// BRANCHES (Multi-branch hospital support)
// ============================================

/**
 * @route GET /api/pharmacy/branches
 * @description Get all branches
 */
router.get('/branches', async (req, res) => {
    try {
        const { search, isActive } = req.query;
        let query = 'SELECT * FROM branches WHERE 1=1';
        const params = [];

        if (isActive !== undefined && isActive !== 'all') {
            const activeFlag = ['true', '1', 'yes'].includes(String(isActive).toLowerCase())
                ? 1
                : 0;
            query += ` AND isActive = ?`;
            params.push(activeFlag);
        } else {
            query += ` AND isActive = 1`;
        }

        if (search) {
            query += ` AND (branchName LIKE ? OR branchCode LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        query += ' ORDER BY isMainBranch DESC, branchName';

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({ message: 'Error fetching branches', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/branches/:id
 * @description Get a single branch by ID
 */
router.get('/branches/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM branches WHERE branchId = ?',
            [req.params.id]
        );

        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Branch not found' });
        }
    } catch (error) {
        console.error('Error fetching branch:', error);
        res.status(500).json({ message: 'Error fetching branch', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/branches
 * @description Create a new branch
 */
router.post('/branches', async (req, res) => {
    try {
        const branchData = req.body;

        // Generate branch code if not provided
        if (!branchData.branchCode) {
            const [count] = await pool.execute('SELECT COUNT(*) as count FROM branches');
            branchData.branchCode = `BR-${String(count[0].count + 1).padStart(3, '0')}`;
        }

        // If setting as main branch, unset other main branches
        if (branchData.isMainBranch) {
            await pool.execute('UPDATE branches SET isMainBranch = 0');
        }

        const [result] = await pool.execute(
            `INSERT INTO branches (branchCode, branchName, address, phone, email, isMainBranch, isActive, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                branchData.branchCode,
                branchData.branchName,
                branchData.address || null,
                branchData.phone || null,
                branchData.email || null,
                branchData.isMainBranch ? 1 : 0,
                branchData.isActive !== undefined ? (branchData.isActive ? 1 : 0) : 1,
                branchData.notes || null
            ]
        );

        const [created] = await pool.execute(
            'SELECT * FROM branches WHERE branchId = ?',
            [result.insertId]
        );

        res.status(201).json(created[0]);
    } catch (error) {
        console.error('Error creating branch:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Branch code already exists', error: error.message });
        }
        res.status(500).json({ message: 'Error creating branch', error: error.message });
    }
});

/**
 * @route PUT /api/pharmacy/branches/:id
 * @description Update a branch
 */
router.put('/branches/:id', async (req, res) => {
    try {
        const branchData = req.body;
        const updates = [];
        const values = [];

        if (branchData.branchName !== undefined) {
            updates.push('branchName = ?');
            values.push(branchData.branchName);
        }
        if (branchData.address !== undefined) {
            updates.push('address = ?');
            values.push(branchData.address || null);
        }
        if (branchData.phone !== undefined) {
            updates.push('phone = ?');
            values.push(branchData.phone || null);
        }
        if (branchData.email !== undefined) {
            updates.push('email = ?');
            values.push(branchData.email || null);
        }
        if (branchData.isMainBranch !== undefined) {
            // If setting as main branch, unset other main branches
            if (branchData.isMainBranch) {
                await pool.execute('UPDATE branches SET isMainBranch = 0 WHERE branchId != ?', [req.params.id]);
            }
            updates.push('isMainBranch = ?');
            values.push(branchData.isMainBranch ? 1 : 0);
        }
        if (branchData.isActive !== undefined) {
            updates.push('isActive = ?');
            values.push(branchData.isActive ? 1 : 0);
        }
        if (branchData.notes !== undefined) {
            updates.push('notes = ?');
            values.push(branchData.notes || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(req.params.id);
        await pool.execute(
            `UPDATE branches SET ${updates.join(', ')}, updatedAt = NOW() WHERE branchId = ?`,
            values
        );

        const [updated] = await pool.execute(
            'SELECT * FROM branches WHERE branchId = ?',
            [req.params.id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating branch:', error);
        res.status(500).json({ message: 'Error updating branch', error: error.message });
    }
});

/**
 * @route DELETE /api/pharmacy/branches/:id
 * @description Delete a branch (soft delete by setting isActive = 0)
 */
router.delete('/branches/:id', async (req, res) => {
    try {
        // Check if branch has stores
        const [stores] = await pool.execute(
            'SELECT COUNT(*) as count FROM drug_stores WHERE branchId = ? AND isActive = 1',
            [req.params.id]
        );

        if (stores[0].count > 0) {
            return res.status(400).json({ message: 'Cannot delete branch with active stores. Please deactivate or delete stores first.' });
        }

        // Soft delete
        await pool.execute(
            'UPDATE branches SET isActive = 0, updatedAt = NOW() WHERE branchId = ?',
            [req.params.id]
        );

        res.status(200).json({ message: 'Branch deactivated successfully' });
    } catch (error) {
        console.error('Error deleting branch:', error);
        res.status(500).json({ message: 'Error deleting branch', error: error.message });
    }
});

// ============================================
// DRUG STORES
// ============================================

/**
 * @route GET /api/pharmacy/drug-stores
 * @description Get all drug stores
 */
router.get('/drug-stores', async (req, res) => {
    try {
        const { branchId, search, isActive, isDispensingStore } = req.query;
        let query = `
            SELECT ds.*,
                   b.branchName,
                   b.branchCode,
                   b.isMainBranch
            FROM drug_stores ds
            LEFT JOIN branches b ON ds.branchId = b.branchId
            WHERE 1=1
        `;
        const params = [];

        // Accept true/1/yes (active), false/0/no (inactive), or all (no filter).
        // Callers historically pass isActive=1; treating only === 'true' as active returned inactive-only rows.
        if (isActive !== undefined && isActive !== 'all') {
            const activeFlag = ['true', '1', 'yes'].includes(String(isActive).toLowerCase())
                ? 1
                : 0;
            query += ` AND ds.isActive = ?`;
            params.push(activeFlag);
        } else {
            query += ` AND ds.isActive = 1`;
        }

        if (branchId) {
            query += ` AND ds.branchId = ?`;
            params.push(branchId);
        }

        if (isDispensingStore !== undefined) {
            const dispensingFlag = ['true', '1', 'yes'].includes(String(isDispensingStore).toLowerCase())
                ? 1
                : 0;
            query += ` AND ds.isDispensingStore = ?`;
            params.push(dispensingFlag);
        }

        if (search) {
            query += ` AND (ds.storeName LIKE ? OR ds.storeCode LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        query += ' ORDER BY b.branchName, ds.storeName';

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching drug stores:', error);
        res.status(500).json({ message: 'Error fetching drug stores', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/drug-stores/:id
 * @description Get a single drug store by ID
 */
router.get('/drug-stores/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT ds.*,
                    b.branchName,
                    b.branchCode,
                    b.isMainBranch
             FROM drug_stores ds
             LEFT JOIN branches b ON ds.branchId = b.branchId
             WHERE ds.storeId = ?`,
            [req.params.id]
        );

        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Drug store not found' });
        }
    } catch (error) {
        console.error('Error fetching drug store:', error);
        res.status(500).json({ message: 'Error fetching drug store', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/drug-stores
 * @description Create a new drug store
 */
router.post('/drug-stores', async (req, res) => {
    try {
        const storeData = req.body;

        // Generate store code if not provided
        if (!storeData.storeCode) {
            const [count] = await pool.execute('SELECT COUNT(*) as count FROM drug_stores');
            storeData.storeCode = `STORE-${String(count[0].count + 1).padStart(4, '0')}`;
        }

        // If setting as dispensing store, unset other dispensing stores for the same branch
        if (storeData.isDispensingStore && storeData.branchId) {
            await pool.execute(
                'UPDATE drug_stores SET isDispensingStore = 0 WHERE branchId = ?',
                [storeData.branchId]
            );
        }

        const [result] = await pool.execute(
            `INSERT INTO drug_stores (storeCode, storeName, branchId, isDispensingStore, location, contactPerson, phone, email, isActive, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                storeData.storeCode,
                storeData.storeName,
                storeData.branchId,
                storeData.isDispensingStore ? 1 : 0,
                storeData.location || null,
                storeData.contactPerson || null,
                storeData.phone || null,
                storeData.email || null,
                storeData.isActive !== undefined ? (storeData.isActive ? 1 : 0) : 1,
                storeData.notes || null
            ]
        );

        const [created] = await pool.execute(
            `SELECT ds.*,
                    b.branchName,
                    b.branchCode,
                    b.isMainBranch
             FROM drug_stores ds
             LEFT JOIN branches b ON ds.branchId = b.branchId
             WHERE ds.storeId = ?`,
            [result.insertId]
        );

        res.status(201).json(created[0]);
    } catch (error) {
        console.error('Error creating drug store:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Store code already exists', error: error.message });
        }
        res.status(500).json({ message: 'Error creating drug store', error: error.message });
    }
});

/**
 * @route PUT /api/pharmacy/drug-stores/:id
 * @description Update a drug store
 */
router.put('/drug-stores/:id', async (req, res) => {
    try {
        const storeData = req.body;
        const updates = [];
        const values = [];

        if (storeData.storeName !== undefined) {
            updates.push('storeName = ?');
            values.push(storeData.storeName);
        }
        if (storeData.branchId !== undefined) {
            updates.push('branchId = ?');
            values.push(storeData.branchId);
        }
        if (storeData.isDispensingStore !== undefined) {
            // If setting as dispensing store, unset other dispensing stores for the same branch
            if (storeData.isDispensingStore && storeData.branchId) {
                await pool.execute(
                    'UPDATE drug_stores SET isDispensingStore = 0 WHERE branchId = ? AND storeId != ?',
                    [storeData.branchId, req.params.id]
                );
            } else if (storeData.isDispensingStore) {
                // Get current branchId if not provided
                const [current] = await pool.execute('SELECT branchId FROM drug_stores WHERE storeId = ?', [req.params.id]);
                if (current.length > 0) {
                    await pool.execute(
                        'UPDATE drug_stores SET isDispensingStore = 0 WHERE branchId = ? AND storeId != ?',
                        [current[0].branchId, req.params.id]
                    );
                }
            }
            updates.push('isDispensingStore = ?');
            values.push(storeData.isDispensingStore ? 1 : 0);
        }
        if (storeData.location !== undefined) {
            updates.push('location = ?');
            values.push(storeData.location || null);
        }
        if (storeData.contactPerson !== undefined) {
            updates.push('contactPerson = ?');
            values.push(storeData.contactPerson || null);
        }
        if (storeData.phone !== undefined) {
            updates.push('phone = ?');
            values.push(storeData.phone || null);
        }
        if (storeData.email !== undefined) {
            updates.push('email = ?');
            values.push(storeData.email || null);
        }
        if (storeData.isActive !== undefined) {
            updates.push('isActive = ?');
            values.push(storeData.isActive ? 1 : 0);
        }
        if (storeData.notes !== undefined) {
            updates.push('notes = ?');
            values.push(storeData.notes || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(req.params.id);
        await pool.execute(
            `UPDATE drug_stores SET ${updates.join(', ')}, updatedAt = NOW() WHERE storeId = ?`,
            values
        );

        const [updated] = await pool.execute(
            `SELECT ds.*,
                    b.branchName,
                    b.branchCode,
                    b.isMainBranch
             FROM drug_stores ds
             LEFT JOIN branches b ON ds.branchId = b.branchId
             WHERE ds.storeId = ?`,
            [req.params.id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating drug store:', error);
        res.status(500).json({ message: 'Error updating drug store', error: error.message });
    }
});

/**
 * @route DELETE /api/pharmacy/drug-stores/:id
 * @description Delete a drug store (soft delete by setting isActive = 0)
 */
router.delete('/drug-stores/:id', async (req, res) => {
    try {
        // Check if store has inventory
        const [inventory] = await pool.execute(
            'SELECT COUNT(*) as count FROM drug_inventory WHERE storeId = ? AND quantity > 0',
            [req.params.id]
        );

        if (inventory[0].count > 0) {
            return res.status(400).json({ message: 'Cannot delete store with inventory. Please transfer or remove inventory first.' });
        }

        // Soft delete
        await pool.execute(
            'UPDATE drug_stores SET isActive = 0, updatedAt = NOW() WHERE storeId = ?',
            [req.params.id]
        );

        res.status(200).json({ message: 'Drug store deactivated successfully' });
    } catch (error) {
        console.error('Error deleting drug store:', error);
        res.status(500).json({ message: 'Error deleting drug store', error: error.message });
    }
});

// ============================================
// DRUG STORE REORDER LEVELS
// ============================================

router.get('/drug-stores/:storeId/reorder-levels', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT rl.*,
                    m.name AS medicationName,
                    m.genericName,
                    m.strength,
                    m.dosageForm,
                    COALESCE((
                        SELECT SUM(di.quantity)
                        FROM drug_inventory di
                        WHERE di.storeId = rl.storeId
                          AND di.medicationId = rl.medicationId
                          AND di.status = 'active'
                          AND di.quantity > 0
                          AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
                    ), 0) AS currentQuantity
             FROM drug_store_reorder_levels rl
             INNER JOIN medications m ON rl.medicationId = m.medicationId
             WHERE rl.storeId = ?
             ORDER BY m.name ASC`,
            [req.params.storeId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching reorder levels:', error);
        res.status(500).json({ message: 'Error fetching reorder levels', error: error.message });
    }
});

router.post('/drug-stores/:storeId/reorder-levels', async (req, res) => {
    try {
        const { medicationId, reorderLevel, reorderQuantity, maxStockLevel, notes } = req.body;
        if (!medicationId || reorderLevel === undefined) {
            return res.status(400).json({ error: 'medicationId and reorderLevel are required' });
        }
        const [result] = await pool.execute(
            `INSERT INTO drug_store_reorder_levels
             (storeId, medicationId, reorderLevel, reorderQuantity, maxStockLevel, notes, isActive)
             VALUES (?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
               reorderLevel = VALUES(reorderLevel),
               reorderQuantity = VALUES(reorderQuantity),
               maxStockLevel = VALUES(maxStockLevel),
               notes = VALUES(notes),
               isActive = 1,
               updatedAt = NOW()`,
            [
                req.params.storeId,
                medicationId,
                reorderLevel,
                reorderQuantity || 0,
                maxStockLevel || null,
                notes || null,
            ]
        );
        const reorderLevelId = result.insertId || null;
        let row;
        if (reorderLevelId) {
            const [rows] = await pool.execute(
                'SELECT * FROM drug_store_reorder_levels WHERE reorderLevelId = ?',
                [reorderLevelId]
            );
            row = rows[0];
        } else {
            const [rows] = await pool.execute(
                'SELECT * FROM drug_store_reorder_levels WHERE storeId = ? AND medicationId = ?',
                [req.params.storeId, medicationId]
            );
            row = rows[0];
        }
        res.status(201).json(row);
    } catch (error) {
        console.error('Error creating reorder level:', error);
        res.status(500).json({ message: 'Error creating reorder level', error: error.message });
    }
});

router.put('/reorder-levels/:id', async (req, res) => {
    try {
        const { reorderLevel, reorderQuantity, maxStockLevel, notes, isActive } = req.body;
        const updates = [];
        const values = [];
        if (reorderLevel !== undefined) {
            updates.push('reorderLevel = ?');
            values.push(reorderLevel);
        }
        if (reorderQuantity !== undefined) {
            updates.push('reorderQuantity = ?');
            values.push(reorderQuantity);
        }
        if (maxStockLevel !== undefined) {
            updates.push('maxStockLevel = ?');
            values.push(maxStockLevel);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }
        if (isActive !== undefined) {
            updates.push('isActive = ?');
            values.push(isActive ? 1 : 0);
        }
        if (!updates.length) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        values.push(req.params.id);
        await pool.execute(
            `UPDATE drug_store_reorder_levels SET ${updates.join(', ')}, updatedAt = NOW() WHERE reorderLevelId = ?`,
            values
        );
        const [rows] = await pool.execute(
            'SELECT * FROM drug_store_reorder_levels WHERE reorderLevelId = ?',
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Reorder level not found' });
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error updating reorder level:', error);
        res.status(500).json({ message: 'Error updating reorder level', error: error.message });
    }
});

router.delete('/reorder-levels/:id', async (req, res) => {
    try {
        const [result] = await pool.execute(
            'DELETE FROM drug_store_reorder_levels WHERE reorderLevelId = ?',
            [req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: 'Reorder level not found' });
        res.status(200).json({ message: 'Reorder level deleted' });
    } catch (error) {
        console.error('Error deleting reorder level:', error);
        res.status(500).json({ message: 'Error deleting reorder level', error: error.message });
    }
});

router.get('/reorder-alerts', async (req, res) => {
    try {
        const { storeId } = req.query;
        const params = [];
        let storeFilter = '';
        if (storeId) {
            storeFilter = ' AND rl.storeId = ?';
            params.push(storeId);
        }
        const [rows] = await pool.execute(
            `SELECT rl.reorderLevelId, rl.storeId, rl.medicationId, rl.reorderLevel, rl.reorderQuantity,
                    ds.storeName, b.branchName, m.name AS medicationName,
                    COALESCE((
                        SELECT SUM(di.quantity)
                        FROM drug_inventory di
                        WHERE di.storeId = rl.storeId
                          AND di.medicationId = rl.medicationId
                          AND di.status = 'active'
                          AND di.quantity > 0
                          AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
                    ), 0) AS currentQuantity
             FROM drug_store_reorder_levels rl
             INNER JOIN drug_stores ds ON rl.storeId = ds.storeId
             LEFT JOIN branches b ON ds.branchId = b.branchId
             INNER JOIN medications m ON rl.medicationId = m.medicationId
             WHERE rl.isActive = 1 AND ds.isActive = 1
             ${storeFilter}
             HAVING currentQuantity <= rl.reorderLevel
             ORDER BY currentQuantity ASC, m.name ASC`,
            params
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching reorder alerts:', error);
        res.status(500).json({ message: 'Error fetching reorder alerts', error: error.message });
    }
});

router.post('/reorder-alerts/check', async (req, res) => {
    try {
        const { storeId, medicationId } = req.body || {};
        const alerts = await checkStoreReorderLevels(pool, { storeId, medicationId });
        res.status(200).json({ alerts, count: alerts.length });
    } catch (error) {
        console.error('Error checking reorder alerts:', error);
        res.status(500).json({ message: 'Error checking reorder alerts', error: error.message });
    }
});

// ============================================
// DRUG STORE TRANSFERS (Branch / store movement)
// ============================================

async function fetchStockTransferById(transferId, executor = pool) {
    const [rows] = await executor.execute(
        `SELECT t.*,
                m.name AS medicationName,
                m.genericName,
                m.strength,
                m.dosageForm,
                fs.storeName AS fromStoreName,
                fs.storeCode AS fromStoreCode,
                fb.branchName AS fromBranchName,
                fb.branchCode AS fromBranchCode,
                ts.storeName AS toStoreName,
                ts.storeCode AS toStoreCode,
                tb.branchName AS toBranchName,
                tb.branchCode AS toBranchCode,
                ru.firstName AS requestedByFirstName,
                ru.lastName AS requestedByLastName,
                au.firstName AS approvedByFirstName,
                au.lastName AS approvedByLastName,
                rcu.firstName AS receivedByFirstName,
                rcu.lastName AS receivedByLastName
         FROM drug_inventory_transfers t
         INNER JOIN medications m ON t.medicationId = m.medicationId
         INNER JOIN drug_stores fs ON t.fromStoreId = fs.storeId
         INNER JOIN branches fb ON fs.branchId = fb.branchId
         INNER JOIN drug_stores ts ON t.toStoreId = ts.storeId
         INNER JOIN branches tb ON ts.branchId = tb.branchId
         LEFT JOIN users ru ON t.requestedBy = ru.userId
         LEFT JOIN users au ON t.approvedBy = au.userId
         LEFT JOIN users rcu ON t.receivedBy = rcu.userId
         WHERE t.transferId = ?`,
        [transferId]
    );
    return rows[0] || null;
}

/**
 * @route GET /api/pharmacy/stock-transfers
 * @description List drug transfers between stores/branches
 */
router.get('/stock-transfers', async (req, res) => {
    try {
        const { status, fromStoreId, toStoreId, branchId, search, page = 1, limit = 50 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const params = [];
        let query = `
            SELECT t.*,
                   m.name AS medicationName,
                   m.genericName,
                   fs.storeName AS fromStoreName,
                   ts.storeName AS toStoreName,
                   fb.branchName AS fromBranchName,
                   tb.branchName AS toBranchName
            FROM drug_inventory_transfers t
            INNER JOIN medications m ON t.medicationId = m.medicationId
            INNER JOIN drug_stores fs ON t.fromStoreId = fs.storeId
            INNER JOIN branches fb ON fs.branchId = fb.branchId
            INNER JOIN drug_stores ts ON t.toStoreId = ts.storeId
            INNER JOIN branches tb ON ts.branchId = tb.branchId
            WHERE 1=1
        `;

        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }
        if (fromStoreId) {
            query += ' AND t.fromStoreId = ?';
            params.push(fromStoreId);
        }
        if (toStoreId) {
            query += ' AND t.toStoreId = ?';
            params.push(toStoreId);
        }
        if (branchId) {
            query += ' AND (fs.branchId = ? OR ts.branchId = ?)';
            params.push(branchId, branchId);
        }
        if (search) {
            query += ' AND (t.transferNumber LIKE ? OR m.name LIKE ? OR t.batchNumber LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        query += ` ORDER BY t.createdAt DESC LIMIT ${Number(limit)} OFFSET ${offset}`;
        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching stock transfers:', error);
        res.status(500).json({ message: 'Error fetching stock transfers', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/stock-transfers/:id
 * @description Get a single stock transfer
 */
router.get('/stock-transfers/:id', async (req, res) => {
    try {
        const transfer = await fetchStockTransferById(req.params.id);
        if (!transfer) return res.status(404).json({ message: 'Stock transfer not found' });
        res.status(200).json(transfer);
    } catch (error) {
        console.error('Error fetching stock transfer:', error);
        res.status(500).json({ message: 'Error fetching stock transfer', error: error.message });
    }
});

/**
 * @route POST /api/pharmacy/stock-transfers
 * @description Request a transfer between drug stores
 */
router.post('/stock-transfers', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            fromStoreId,
            toStoreId,
            medicationId,
            quantity,
            drugInventoryId,
            transferDate,
            notes,
        } = req.body;
        const userId = req.user?.id || req.user?.userId || null;
        const qty = Number(quantity);

        if (!fromStoreId || !toStoreId || !medicationId || !Number.isFinite(qty) || qty <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'fromStoreId, toStoreId, medicationId, and positive quantity are required' });
        }
        if (Number(fromStoreId) === Number(toStoreId)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Source and destination stores must be different' });
        }

        let sourceBatch = null;
        if (drugInventoryId) {
            const [rows] = await connection.execute(
                'SELECT * FROM drug_inventory WHERE drugInventoryId = ? AND storeId = ? AND medicationId = ?',
                [drugInventoryId, fromStoreId, medicationId]
            );
            sourceBatch = rows[0] || null;
            if (!sourceBatch) {
                await connection.rollback();
                return res.status(400).json({ error: 'Selected batch is not available in the source store' });
            }
        } else {
            sourceBatch = await findFifoBatchForStore(connection, medicationId, fromStoreId);
            if (!sourceBatch) {
                await connection.rollback();
                return res.status(400).json({ error: 'No available stock found in the source store for this medication' });
            }
        }

        if ((Number(sourceBatch.quantity) || 0) < qty) {
            await connection.rollback();
            return res.status(400).json({
                error: `Insufficient stock in source store. Available: ${sourceBatch.quantity}, requested: ${qty}`,
            });
        }

        const transferNumber = await generateDocumentNumber('TRF', 'drug_inventory_transfers', 'transferNumber', connection);
        const [result] = await connection.execute(
            `INSERT INTO drug_inventory_transfers
             (transferNumber, fromStoreId, toStoreId, medicationId, drugInventoryId, batchNumber, quantity, unitPrice,
              transferDate, status, requestedBy, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [
                transferNumber,
                fromStoreId,
                toStoreId,
                medicationId,
                sourceBatch.drugInventoryId,
                sourceBatch.batchNumber,
                qty,
                sourceBatch.unitPrice || null,
                transferDate || new Date().toISOString().slice(0, 10),
                userId,
                notes || null,
            ]
        );

        await connection.commit();
        const transfer = await fetchStockTransferById(result.insertId);
        await notifyPharmacyStaff(pool, {
            notificationType: 'store_transfer',
            title: `Transfer requested: ${transfer.transferNumber}`,
            message: `${transfer.quantity} units of ${transfer.medicationName} requested from ${transfer.fromStoreName} to ${transfer.toStoreName}.`,
            priority: 'medium',
            storeId: transfer.toStoreId,
            medicationId: transfer.medicationId,
            referenceType: 'store_transfer',
            referenceId: transfer.transferId,
        }).catch(() => {});
        res.status(201).json(transfer);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating stock transfer:', error);
        res.status(error.status || 500).json({ message: 'Error creating stock transfer', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PATCH /api/pharmacy/stock-transfers/:id/status
 * @description Update transfer workflow: dispatch (in_transit) or receive (completed) or cancel
 */
router.patch('/stock-transfers/:id/status', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { status, notes, drugInventoryId } = req.body || {};
        const userId = req.user?.id || req.user?.userId || null;
        const allowedStatuses = ['in_transit', 'completed', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            await connection.rollback();
            return res.status(400).json({ error: `status must be one of: ${allowedStatuses.join(', ')}` });
        }

        const [rows] = await connection.execute(
            'SELECT * FROM drug_inventory_transfers WHERE transferId = ? FOR UPDATE',
            [req.params.id]
        );
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: 'Stock transfer not found' });
        }
        const transfer = rows[0];

        if (status === 'cancelled') {
            if (transfer.status !== 'pending') {
                await connection.rollback();
                return res.status(400).json({ error: 'Only pending transfers can be cancelled' });
            }
            await connection.execute(
                `UPDATE drug_inventory_transfers
                 SET status = 'cancelled', notes = COALESCE(?, notes), updatedAt = NOW()
                 WHERE transferId = ?`,
                [notes || null, transfer.transferId]
            );
            await connection.commit();
            return res.status(200).json(await fetchStockTransferById(transfer.transferId));
        }

        if (status === 'in_transit') {
            if (transfer.status !== 'pending') {
                await connection.rollback();
                return res.status(400).json({ error: 'Only pending transfers can be dispatched' });
            }

            let batchId = transfer.drugInventoryId;
            if (drugInventoryId) {
                const [batchRows] = await connection.execute(
                    'SELECT drugInventoryId FROM drug_inventory WHERE drugInventoryId = ? AND storeId = ? AND medicationId = ?',
                    [drugInventoryId, transfer.fromStoreId, transfer.medicationId]
                );
                if (!batchRows.length) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'Selected batch is not available in the source store' });
                }
                batchId = batchRows[0].drugInventoryId;
            }

            const deduction = await deductInventoryBatch(connection, {
                drugInventoryId: batchId,
                quantity: transfer.quantity,
                userId,
                referenceType: 'store_transfer',
                referenceId: transfer.transferId,
                referenceNumber: transfer.transferNumber,
                notes: notes || `Dispatched to store ${transfer.toStoreId}`,
            });

            await connection.execute(
                `UPDATE drug_inventory_transfers
                 SET status = 'in_transit',
                     drugInventoryId = ?,
                     approvedBy = ?,
                     unitPrice = ?,
                     batchNumber = ?,
                     notes = COALESCE(?, notes),
                     updatedAt = NOW()
                 WHERE transferId = ?`,
                [
                    batchId,
                    userId,
                    deduction.batch.unitPrice || transfer.unitPrice,
                    deduction.batch.batchNumber,
                    notes || null,
                    transfer.transferId,
                ]
            );
            await checkStoreReorderLevels(connection, {
                storeId: transfer.fromStoreId,
                medicationId: transfer.medicationId,
            });
            await connection.commit();
            return res.status(200).json(await fetchStockTransferById(transfer.transferId));
        }

        if (status === 'completed') {
            if (transfer.status !== 'in_transit') {
                await connection.rollback();
                return res.status(400).json({ error: 'Only in-transit transfers can be received' });
            }

            const [sourceBatchRows] = await connection.execute(
                'SELECT * FROM drug_inventory WHERE drugInventoryId = ?',
                [transfer.drugInventoryId]
            );
            const sourceBatch = sourceBatchRows[0] || {};
            const [toStoreRows] = await connection.execute(
                'SELECT branchId FROM drug_stores WHERE storeId = ?',
                [transfer.toStoreId]
            );
            const destinationBatchNumber = buildTransferBatchNumber(
                transfer.batchNumber || sourceBatch.batchNumber,
                transfer.transferNumber
            );

            const receipt = await receiveInventoryAtStore(connection, {
                medicationId: transfer.medicationId,
                batchNumber: destinationBatchNumber,
                quantity: transfer.quantity,
                unitPrice: transfer.unitPrice || sourceBatch.unitPrice,
                sellPrice: sourceBatch.sellPrice || transfer.unitPrice,
                minPrice: sourceBatch.minPrice,
                manufactureDate: sourceBatch.manufactureDate,
                expiryDate: sourceBatch.expiryDate,
                toStoreId: transfer.toStoreId,
                toBranchId: toStoreRows[0]?.branchId || null,
                userId,
                referenceType: 'store_transfer',
                referenceId: transfer.transferId,
                referenceNumber: transfer.transferNumber,
                notes: notes || `Received from store ${transfer.fromStoreId}`,
                sourceBatchNumber: transfer.batchNumber || sourceBatch.batchNumber,
            });

            const now = new Date();
            await connection.execute(
                `UPDATE drug_inventory_transfers
                 SET status = 'completed',
                     receivedBy = ?,
                     receivedDate = ?,
                     receivedTime = ?,
                     batchNumber = ?,
                     notes = COALESCE(?, notes),
                     updatedAt = NOW()
                 WHERE transferId = ?`,
                [
                    userId,
                    now.toISOString().slice(0, 10),
                    now.toTimeString().slice(0, 8),
                    receipt.batchNumber,
                    notes || null,
                    transfer.transferId,
                ]
            );
            await connection.commit();
            return res.status(200).json(await fetchStockTransferById(transfer.transferId));
        }

        await connection.rollback();
        return res.status(400).json({ error: 'Unsupported status transition' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating stock transfer status:', error);
        res.status(error.status || 500).json({ message: 'Error updating stock transfer status', error: error.message });
    } finally {
        connection.release();
    }
});

// ============================================
// NURSE DRUG PICKUPS (For Admitted Patients)
// ============================================

/**
 * @route GET /api/pharmacy/nurse-pickups/ready
 * @description Get prescriptions ready for pickup by nurses (for admitted patients)
 */
router.get('/nurse-pickups/ready', async (req, res) => {
    try {
        const { admissionId, patientId, status } = req.query;

        let query = `
            SELECT DISTINCT
                p.prescriptionId,
                p.prescriptionNumber,
                p.prescriptionDate,
                p.status as prescriptionStatus,
                p.patientId,
                pt.patientNumber,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                pt.dateOfBirth,
                pt.gender,
                ia.admissionId,
                ia.admissionNumber,
                ia.admissionDate,
                ia.dischargeDate,
                ia.status as admissionStatus,
                dr.firstName as doctorFirstName,
                dr.lastName as doctorLastName,
                dr.username as doctorUsername,
                -- Count pending items
                (SELECT COUNT(*)
                 FROM prescription_items pi
                 WHERE pi.prescriptionId = p.prescriptionId
                 AND pi.status = 'dispensed'
                 AND NOT EXISTS (
                     SELECT 1 FROM nurse_pickup_items npi
                     INNER JOIN nurse_pickups np ON npi.pickupId = np.pickupId
                     WHERE npi.prescriptionItemId = pi.itemId
                     AND np.status = 'picked_up'
                 )
                ) as pendingPickupItems,
                -- Get medication names
                GROUP_CONCAT(DISTINCT pi.medicationName SEPARATOR ', ') as medicationNames
            FROM prescriptions p
            INNER JOIN patients pt ON p.patientId = pt.patientId
            LEFT JOIN admissions ia ON pt.patientId = ia.patientId
                AND (ia.dischargeDate IS NULL OR ia.dischargeDate >= CURDATE())
                AND ia.status = 'admitted'
            INNER JOIN users dr ON p.doctorId = dr.userId
            INNER JOIN prescription_items pi ON p.prescriptionId = pi.prescriptionId
            WHERE p.status = 'dispensed'
            AND pi.status = 'dispensed'
            AND EXISTS (
                SELECT 1 FROM dispensations d
                WHERE d.prescriptionItemId = pi.itemId
            )
            AND NOT EXISTS (
                SELECT 1 FROM nurse_pickup_items npi
                INNER JOIN nurse_pickups np ON npi.pickupId = np.pickupId
                WHERE npi.prescriptionItemId = pi.itemId
                AND np.status = 'picked_up'
            )
        `;

        const params = [];

        if (admissionId) {
            query += ` AND ia.admissionId = ?`;
            params.push(admissionId);
        }

        if (patientId) {
            query += ` AND p.patientId = ?`;
            params.push(patientId);
        }

        // Only show prescriptions for admitted patients
        query += ` AND ia.admissionId IS NOT NULL`;

        query += ` GROUP BY p.prescriptionId, p.prescriptionNumber, p.prescriptionDate, p.status,
                          p.patientId, pt.patientNumber, pt.firstName, pt.lastName, pt.dateOfBirth, pt.gender,
                          ia.admissionId, ia.admissionNumber, ia.admissionDate, ia.dischargeDate, ia.status,
                          dr.firstName, dr.lastName, dr.username
                  HAVING pendingPickupItems > 0
                  ORDER BY p.prescriptionDate DESC, p.prescriptionId DESC`;

        const [rows] = await pool.execute(query, params);

        // Get detailed items for each prescription
        let prescriptionsWithItems = await Promise.all(
            rows.map(async (prescription) => {
                const [items] = await pool.execute(
                    `SELECT
                        pi.itemId,
                        pi.itemId as prescriptionItemId,
                        pi.medicationId,
                        pi.medicationName,
                        pi.dosage,
                        pi.frequency,
                        pi.duration,
                        pi.quantity,
                        pi.instructions,
                        pi.status,
                        d.dispensationId,
                        d.dispensationDate,
                        d.quantityDispensed,
                        d.batchNumber,
                        d.expiryDate,
                        dispenser.firstName as dispensedByFirstName,
                        dispenser.lastName as dispensedByLastName
                    FROM prescription_items pi
                    INNER JOIN dispensations d ON d.prescriptionItemId = pi.itemId
                    LEFT JOIN users dispenser ON d.dispensedBy = dispenser.userId
                    WHERE pi.prescriptionId = ?
                    AND pi.status = 'dispensed'
                    AND NOT EXISTS (
                        SELECT 1 FROM nurse_pickup_items npi
                        INNER JOIN nurse_pickups np ON npi.pickupId = np.pickupId
                        WHERE npi.prescriptionItemId = pi.itemId
                        AND np.status = 'picked_up'
                    )
                    ORDER BY d.dispensationDate DESC`,
                    [prescription.prescriptionId]
                );

                return {
                    ...prescription,
                    items: items,
                    requestingNurses: []
                };
            })
        );

        // Fetch nurse_pickups with status ready_for_pickup (requesting nurse details)
        const [readyPickups] = await pool.execute(
            `SELECT
                np.pickupId,
                np.prescriptionId,
                np.patientId,
                np.admissionId,
                np.notes,
                np.createdAt,
                u.firstName as nurseFirstName,
                u.lastName as nurseLastName,
                u.username as nurseUsername,
                p.prescriptionNumber,
                p.prescriptionDate,
                p.status as prescriptionStatus,
                p.doctorId,
                pt.patientNumber,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                ia.admissionNumber,
                dr.firstName as doctorFirstName,
                dr.lastName as doctorLastName,
                dr.username as doctorUsername
             FROM nurse_pickups np
             INNER JOIN users u ON np.pickedUpBy = u.userId
             INNER JOIN prescriptions p ON np.prescriptionId = p.prescriptionId
             INNER JOIN patients pt ON np.patientId = pt.patientId
             LEFT JOIN admissions ia ON np.admissionId = ia.admissionId
             LEFT JOIN users dr ON p.doctorId = dr.userId
             WHERE np.status = 'ready_for_pickup'
             ORDER BY np.createdAt DESC`
        );

        const prescriptionIdsInReady = new Set(rows.map(r => r.prescriptionId));

        // Attach requesting nurses to existing prescriptions
        for (const pickup of readyPickups) {
            const nurseInfo = {
                pickupId: pickup.pickupId,
                nurseFirstName: pickup.nurseFirstName,
                nurseLastName: pickup.nurseLastName,
                nurseUsername: pickup.nurseUsername
            };
            const idx = prescriptionsWithItems.findIndex(p => p.prescriptionId === pickup.prescriptionId);
            if (idx !== -1) {
                if (!prescriptionsWithItems[idx].requestingNurses) prescriptionsWithItems[idx].requestingNurses = [];
                prescriptionsWithItems[idx].requestingNurses.push(nurseInfo);
            }
        }

        // Add prescriptions that are only in ready_for_pickup (not in dispensed-ready list)
        const addedPrescriptionIds = new Set();
        for (const pickup of readyPickups) {
            if (prescriptionIdsInReady.has(pickup.prescriptionId)) continue;
            if (addedPrescriptionIds.has(pickup.prescriptionId)) continue;
            addedPrescriptionIds.add(pickup.prescriptionId);

            // All ready_for_pickup pickups for this prescription (for requestingNurses)
            const nursesForPrescription = readyPickups
                .filter(p => p.prescriptionId === pickup.prescriptionId)
                .map(p => ({
                    pickupId: p.pickupId,
                    nurseFirstName: p.nurseFirstName,
                    nurseLastName: p.nurseLastName,
                    nurseUsername: p.nurseUsername
                }));

            const [items] = await pool.execute(
                `SELECT
                    npi.prescriptionItemId as itemId,
                    npi.prescriptionItemId,
                    npi.quantityPickedUp as quantityDispensed,
                    pi.medicationName,
                    pi.dosage,
                    pi.frequency,
                    pi.duration,
                    pi.quantity,
                    pi.instructions,
                    pi.status
                 FROM nurse_pickup_items npi
                 INNER JOIN prescription_items pi ON pi.itemId = npi.prescriptionItemId
                 WHERE npi.pickupId = ?`,
                [pickup.pickupId]
            );

            const pendingPickupItems = items.length;
            prescriptionsWithItems.push({
                prescriptionId: pickup.prescriptionId,
                prescriptionNumber: pickup.prescriptionNumber,
                prescriptionDate: pickup.prescriptionDate,
                prescriptionStatus: pickup.prescriptionStatus || 'pending',
                patientId: pickup.patientId,
                patientNumber: pickup.patientNumber,
                patientFirstName: pickup.patientFirstName,
                patientLastName: pickup.patientLastName,
                admissionId: pickup.admissionId,
                admissionNumber: pickup.admissionNumber,
                doctorFirstName: pickup.doctorFirstName,
                doctorLastName: pickup.doctorLastName,
                doctorUsername: pickup.doctorUsername,
                pendingPickupItems,
                items,
                requestingNurses: nursesForPrescription
            });
        }

        res.status(200).json(prescriptionsWithItems);
    } catch (error) {
        console.error('Error fetching prescriptions ready for pickup:', error);
        res.status(500).json({ message: 'Error fetching prescriptions ready for pickup', error: error.message });
    }
});

/**
 * Deduct stock FIFO for a prescription line (same rules as POST /dispensations) and create dispensation row(s).
 * Used when nurse completes pickup but pharmacy never ran dispense, or pickup qty exceeds total already dispensed.
 * @returns {Promise<number|null>} lastDispensationId created in this call (null if nothing deducted)
 */
async function deductInventoryForPrescriptionItemFifo(connection, {
    prescriptionItemId,
    prescriptionItem,
    totalQuantityToDeduct,
    userId,
    patientId,
    prescriptionId,
    notesSuffix = ''
}) {
    let remaining = Number(totalQuantityToDeduct);
    if (!Number.isFinite(remaining) || remaining <= 0) {
        return null;
    }

    const medicationId = prescriptionItem.medicationId;
    if (!medicationId) {
        const err = new Error('Prescription item has no linked medication; cannot deduct inventory');
        err.statusCode = 400;
        throw err;
    }

    let lastDispensationId = null;

    while (remaining > 0) {
        const [oldestBatches] = await connection.execute(
            `SELECT di.* FROM drug_inventory di
             WHERE di.medicationId = ? AND di.quantity > 0 AND di.status = 'active'
               AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
             ORDER BY COALESCE(di.createdAt, NOW()) ASC, di.expiryDate ASC LIMIT 1`,
            [medicationId]
        );

        if (oldestBatches.length === 0) {
            const err = new Error(
                `Insufficient stock for ${prescriptionItem.medicationName || 'medication'}. Need ${remaining} more unit(s).`
            );
            err.statusCode = 400;
            throw err;
        }

        const drugInventory = oldestBatches[0];
        const selectedDrugInventoryId = drugInventory.drugInventoryId;
        const take = Math.min(remaining, Number(drugInventory.quantity));

        let formattedExpiryDate = drugInventory.expiryDate;
        if (formattedExpiryDate && typeof formattedExpiryDate === 'string' && formattedExpiryDate.includes('T')) {
            formattedExpiryDate = formattedExpiryDate.split('T')[0];
        }

        const dispenseNotes = notesSuffix || 'Nurse pickup — FIFO stock deduction';

        const [dispensationResult] = await connection.execute(
            `INSERT INTO dispensations
            (prescriptionItemId, dispensationDate, quantityDispensed, batchNumber, expiryDate, dispensedBy, notes)
            VALUES (?, CURDATE(), ?, ?, ?, ?, ?)`,
            [
                prescriptionItemId,
                take,
                drugInventory.batchNumber,
                formattedExpiryDate || null,
                userId,
                dispenseNotes
            ]
        );

        const dispensationId = dispensationResult.insertId;
        lastDispensationId = dispensationId;

        const oldQuantity = drugInventory.quantity;
        const newQuantity = oldQuantity - take;

        if (newQuantity <= 0) {
            await connection.execute(
                `UPDATE drug_inventory SET quantity = 0, status = 'exhausted', dateExhausted = CURDATE(), updatedAt = NOW() WHERE drugInventoryId = ?`,
                [selectedDrugInventoryId]
            );
        } else {
            await connection.execute(
                'UPDATE drug_inventory SET quantity = ?, updatedAt = NOW() WHERE drugInventoryId = ?',
                [newQuantity, selectedDrugInventoryId]
            );
        }

        const transactionDate = new Date().toISOString().split('T')[0];
        const unitPrice = drugInventory.unitPrice || 0;
        const sellPrice = drugInventory.sellPrice || 0;

        await connection.execute(
            `INSERT INTO drug_inventory_transactions
            (drugInventoryId, patientId, prescriptionId, dispensationId, transactionType, transactionDate,
             quantityChange, quantityBefore, quantityAfter, balanceAfter, unitPrice, sellPrice,
             totalValue, totalSellValue, referenceType, referenceId, referenceNumber, performedBy, notes)
            VALUES (?, ?, ?, ?, 'DISPENSATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispensation', ?, ?, ?, ?)`,
            [
                selectedDrugInventoryId,
                patientId,
                prescriptionId,
                dispensationId,
                transactionDate,
                -take,
                oldQuantity,
                newQuantity,
                newQuantity,
                unitPrice,
                sellPrice,
                take * unitPrice,
                take * sellPrice,
                dispensationId,
                `DISP-${dispensationId}`,
                userId,
                `Dispensed ${take} units (pickup path). Batch: ${drugInventory.batchNumber}`
            ]
        );

        try {
            const expForAdj = drugInventory.expiryDate || new Date(Date.now() + 31536000000).toISOString().split('T')[0];
            await connection.execute(
                `INSERT INTO drug_stock_adjustments
                (drugInventoryId, medicationId, adjustmentType, adjustmentDate, quantity, batchNumber, unitPrice, sellPrice,
                 expiryDate, location, patientId, prescriptionId, dispensationId, referenceType, referenceId, referenceNumber, performedBy, notes)
                VALUES (?, ?, 'DISPENSATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispensation', ?, ?, ?, ?)`,
                [
                    selectedDrugInventoryId,
                    drugInventory.medicationId,
                    transactionDate,
                    -take,
                    drugInventory.batchNumber || 'UNKNOWN',
                    unitPrice,
                    sellPrice,
                    expForAdj,
                    drugInventory.location || null,
                    patientId,
                    prescriptionId,
                    dispensationId,
                    dispensationId,
                    `DISP-${dispensationId}`,
                    userId,
                    `Dispensed ${take} units (nurse pickup path)`
                ]
            );
        } catch (adjError) {
            console.error('Adjustment log failed (pickup FIFO):', adjError.message);
        }

        remaining -= take;
    }

    const [sumRows] = await connection.execute(
        `SELECT COALESCE(SUM(quantityDispensed), 0) AS total FROM dispensations WHERE prescriptionItemId = ?`,
        [prescriptionItemId]
    );
    const totalDispensedForItem = parseFloat(sumRows[0].total) || 0;
    if (totalDispensedForItem >= parseFloat(prescriptionItem.quantity)) {
        await connection.execute('UPDATE prescription_items SET status = "dispensed", updatedAt = NOW() WHERE itemId = ?', [
            prescriptionItemId
        ]);
    }

    const [pendingItems] = await connection.execute(
        'SELECT COUNT(*) as count FROM prescription_items WHERE prescriptionId = ? AND status = "pending"',
        [prescriptionId]
    );
    if (pendingItems[0].count === 0) {
        await connection.execute('UPDATE prescriptions SET status = "dispensed", updatedAt = NOW() WHERE prescriptionId = ?', [
            prescriptionId
        ]);
    }

    if (patientId) {
        const [remainingPendingItems] = await connection.execute(
            `SELECT COUNT(*) as count
             FROM prescription_items pi
             INNER JOIN prescriptions p ON pi.prescriptionId = p.prescriptionId
             WHERE p.patientId = ? AND pi.status = 'pending'`,
            [patientId]
        );

        if (remainingPendingItems[0].count === 0) {
            const [pharmacyQueues] = await connection.execute(
                `SELECT queueId FROM queue_entries
                 WHERE patientId = ? AND servicePoint = 'pharmacy'
                 AND status NOT IN ('completed', 'cancelled')
                 ORDER BY queueId DESC
                 LIMIT 1`,
                [patientId]
            );

            if (pharmacyQueues.length > 0) {
                await connection.execute(
                    `UPDATE queue_entries
                     SET status = 'completed', endTime = NOW(), updatedAt = NOW(),
                         notes = CONCAT(COALESCE(notes, ''), ' - All medications dispensed')
                     WHERE queueId = ?`,
                    [pharmacyQueues[0].queueId]
                );
            }
        }
    }

    return lastDispensationId;
}

/**
 * Ensure dispensations + inventory reflect quantityPickedUp before recording pickup lines.
 * If pharmacy already dispensed enough, only links existing rows (no extra stock movement).
 */
async function resolveDispensationForNursePickup(connection, {
    prescriptionItemId,
    quantityPickedUp,
    dispensationId: requestedDispensationId,
    prescriptionItem,
    patientId,
    prescriptionId,
    userId
}) {
    const qty = Number(quantityPickedUp);

    if (requestedDispensationId) {
        const [rows] = await connection.execute(
            'SELECT dispensationId, prescriptionItemId FROM dispensations WHERE dispensationId = ?',
            [requestedDispensationId]
        );
        if (rows.length === 0) {
            const err = new Error('Invalid dispensationId for pickup');
            err.statusCode = 400;
            throw err;
        }
        if (Number(rows[0].prescriptionItemId) !== Number(prescriptionItemId)) {
            const err = new Error('Dispensation does not match prescription item');
            err.statusCode = 400;
            throw err;
        }
    }

    const [sumRow] = await connection.execute(
        `SELECT COALESCE(SUM(quantityDispensed), 0) AS total FROM dispensations WHERE prescriptionItemId = ?`,
        [prescriptionItemId]
    );
    const already = parseFloat(sumRow[0].total) || 0;
    const need = qty - already;

    if (need > 0.00001) {
        await deductInventoryForPrescriptionItemFifo(connection, {
            prescriptionItemId,
            prescriptionItem,
            totalQuantityToDeduct: need,
            userId,
            patientId,
            prescriptionId,
            notesSuffix: 'Stock deducted at nurse pickup (shortfall vs prior dispensations)'
        });
    }

    if (requestedDispensationId && need <= 0.00001) {
        return requestedDispensationId;
    }

    const [latest] = await connection.execute(
        `SELECT dispensationId FROM dispensations WHERE prescriptionItemId = ? ORDER BY dispensationDate DESC, dispensationId DESC LIMIT 1`,
        [prescriptionItemId]
    );
    if (latest.length === 0) {
        const err = new Error(
            'No dispensation recorded for this line. Stock could not be adjusted — check medication link and inventory.'
        );
        err.statusCode = 400;
        throw err;
    }
    return latest[0].dispensationId;
}

/**
 * @route POST /api/pharmacy/nurse-pickups
 * @description Create a nurse pickup record (nurse picks up drugs for one or more patients)
 */
router.post('/nurse-pickups', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { pickups } = req.body; // Array of { prescriptionId, items: [{ prescriptionItemId, dispensationId, quantityPickedUp }], notes }
        const userId = req.user?.id || req.user?.userId || 1;

        if (!pickups || !Array.isArray(pickups) || pickups.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Pickups array is required and must not be empty' });
        }

        const createdPickups = [];

        for (const pickup of pickups) {
            const { prescriptionId, items, notes, admissionId } = pickup;

            if (!prescriptionId || !items || !Array.isArray(items) || items.length === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Each pickup must have prescriptionId and items array' });
            }

            // Get prescription details
            const [prescriptions] = await connection.execute(
                `SELECT p.*, pt.patientId
                 FROM prescriptions p
                 INNER JOIN patients pt ON p.patientId = pt.patientId
                 WHERE p.prescriptionId = ?`,
                [prescriptionId]
            );

            if (prescriptions.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: `Prescription ${prescriptionId} not found` });
            }

            const prescription = prescriptions[0];
            const patientId = prescription.patientId;

            // Get admission ID if not provided
            let actualAdmissionId = admissionId;
            if (!actualAdmissionId) {
                const [admissions] = await connection.execute(
                    `SELECT admissionId FROM admissions
                     WHERE patientId = ?
                     AND (dischargeDate IS NULL OR dischargeDate >= CURDATE())
                     AND status = 'admitted'
                     ORDER BY admissionDate DESC LIMIT 1`,
                    [patientId]
                );
                if (admissions.length > 0) {
                    actualAdmissionId = admissions[0].admissionId;
                }
            }

            // If nurse already created a pending request, update it to picked_up instead of creating a duplicate
            const [existing] = await connection.execute(
                `SELECT pickupId FROM nurse_pickups
                 WHERE prescriptionId = ? AND (admissionId = ? OR (admissionId IS NULL AND ? IS NULL)) AND status = 'pending'
                 LIMIT 1`,
                [prescriptionId, actualAdmissionId || null, actualAdmissionId || null]
            );

            let pickupId;
            const isExistingPickup = existing && existing.length > 0;
            if (isExistingPickup) {
                pickupId = existing[0].pickupId;
                await connection.execute(
                    `UPDATE nurse_pickups SET status = 'picked_up', recordedPickupBy = ?, pickupDate = NOW(), notes = COALESCE(?, notes), updatedAt = NOW() WHERE pickupId = ?`,
                    [userId, notes || null, pickupId]
                );
            } else {
                // Create new pickup record (no prior nurse request; pharmacist records pickup)
                const [pickupResult] = await connection.execute(
                    `INSERT INTO nurse_pickups
                     (prescriptionId, patientId, admissionId, pickedUpBy, recordedPickupBy, pickupDate, status, notes)
                     VALUES (?, ?, ?, ?, ?, NOW(), 'picked_up', ?)`,
                    [prescriptionId, patientId, actualAdmissionId || null, userId, userId, notes || null]
                );
                pickupId = pickupResult.insertId;
            }

            // Collect invoice items for billing
            const invoiceItems = [];
            let totalInvoiceAmount = 0;

            // Create pickup items and collect pricing information
            for (const item of items) {
                const { prescriptionItemId, dispensationId, quantityPickedUp, notes: itemNotes } = item;

                if (!prescriptionItemId || !quantityPickedUp) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'Each item must have prescriptionItemId and quantityPickedUp' });
                }

                // Verify the prescription item belongs to the prescription
                const [prescriptionItems] = await connection.execute(
                    'SELECT * FROM prescription_items WHERE itemId = ? AND prescriptionId = ?',
                    [prescriptionItemId, prescriptionId]
                );

                if (prescriptionItems.length === 0) {
                    await connection.rollback();
                    return res.status(400).json({ error: `Prescription item ${prescriptionItemId} does not belong to prescription ${prescriptionId}` });
                }

                const prescriptionItem = prescriptionItems[0];

                let resolvedDispensationId;
                try {
                    resolvedDispensationId = await resolveDispensationForNursePickup(connection, {
                        prescriptionItemId,
                        quantityPickedUp,
                        dispensationId,
                        prescriptionItem,
                        patientId,
                        prescriptionId,
                        userId
                    });
                } catch (resolveErr) {
                    await connection.rollback();
                    const code = resolveErr.statusCode || 500;
                    return res.status(code).json({
                        error: resolveErr.message || 'Could not apply inventory for nurse pickup'
                    });
                }

                // Get pricing from original prescription invoice or drug inventory
                let unitPrice = 0;
                let drugInventoryId = null;
                let description = prescriptionItem.medicationName || 'Medication';

                // Try to get price from original prescription invoice
                const [originalInvoiceItems] = await connection.execute(
                    `SELECT ii.unitPrice, ii.drugInventoryId, ii.description
                     FROM invoice_items ii
                     INNER JOIN invoices i ON ii.invoiceId = i.invoiceId
                     WHERE i.patientId = ?
                     AND i.notes LIKE CONCAT('%Prescription: ', ?, '%')
                     AND ii.description LIKE CONCAT('%', ?, '%')
                     ORDER BY i.invoiceDate DESC
                     LIMIT 1`,
                    [patientId, prescription.prescriptionNumber, prescriptionItem.medicationName]
                );

                if (originalInvoiceItems.length > 0) {
                    unitPrice = parseFloat(originalInvoiceItems[0].unitPrice) || 0;
                    drugInventoryId = originalInvoiceItems[0].drugInventoryId;
                    description = originalInvoiceItems[0].description || description;
                } else {
                    // Fallback: Get price from drug inventory via dispensation (resolved after stock sync)
                    if (resolvedDispensationId) {
                        const [dispensations] = await connection.execute(
                            `SELECT d.*, di.sellPrice, di.drugInventoryId
                             FROM dispensations d
                             LEFT JOIN drug_inventory di ON di.batchNumber = d.batchNumber AND di.medicationId = ?
                             WHERE d.dispensationId = ?
                             LIMIT 1`,
                            [prescriptionItem.medicationId, resolvedDispensationId]
                        );

                        if (dispensations.length > 0 && dispensations[0].sellPrice) {
                            unitPrice = parseFloat(dispensations[0].sellPrice) || 0;
                            drugInventoryId = dispensations[0].drugInventoryId;
                        } else {
                            // Last resort: Get from drug_inventory by medicationId
                            const [drugInventory] = await connection.execute(
                                `SELECT sellPrice, drugInventoryId
                                 FROM drug_inventory
                                 WHERE medicationId = ?
                                 AND quantity > 0
                                 AND status = 'active'
                                 ORDER BY expiryDate ASC, createdAt ASC
                                 LIMIT 1`,
                                [prescriptionItem.medicationId]
                            );

                            if (drugInventory.length > 0) {
                                unitPrice = parseFloat(drugInventory[0].sellPrice) || 0;
                                drugInventoryId = drugInventory[0].drugInventoryId;
                            }
                        }
                    }
                }

                const totalPrice = unitPrice * quantityPickedUp;
                totalInvoiceAmount += totalPrice;

                // Store invoice item data
                invoiceItems.push({
                    description: `${description} (${prescriptionItem.dosage || ''})`,
                    quantity: quantityPickedUp,
                    unitPrice: unitPrice,
                    totalPrice: totalPrice,
                    drugInventoryId: drugInventoryId
                });

                if (isExistingPickup) {
                    await connection.execute(
                        `UPDATE nurse_pickup_items SET dispensationId = ?, quantityPickedUp = ?, notes = COALESCE(?, notes) WHERE pickupId = ? AND prescriptionItemId = ?`,
                        [resolvedDispensationId || null, quantityPickedUp || 1, itemNotes || null, pickupId, prescriptionItemId]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO nurse_pickup_items
                         (pickupId, prescriptionItemId, dispensationId, quantityPickedUp, notes)
                         VALUES (?, ?, ?, ?, ?)`,
                        [pickupId, prescriptionItemId, resolvedDispensationId || null, quantityPickedUp, itemNotes || null]
                    );
                }

                // Record in drug history for audit trail (inventory reduced at dispense or during resolveDispensationForNursePickup)
                // Get dispensation details to find drug inventory batch
                if (resolvedDispensationId) {
                    const [dispensations] = await connection.execute(
                        `SELECT d.*, di.drugInventoryId, di.quantity as currentQuantity, di.unitPrice, di.sellPrice
                         FROM dispensations d
                         LEFT JOIN drug_inventory di ON di.batchNumber = d.batchNumber AND di.medicationId = ?
                         WHERE d.dispensationId = ?
                         LIMIT 1`,
                        [prescriptionItem.medicationId, resolvedDispensationId]
                    );

                    if (dispensations.length > 0 && dispensations[0].drugInventoryId) {
                        const disp = dispensations[0];
                        const transactionDate = new Date().toISOString().split('T')[0];
                        const currentQuantity = disp.currentQuantity || 0;
                        const unitPrice = disp.unitPrice || 0;
                        const sellPrice = disp.sellPrice || 0;

                        try {
                            // Record in drug_inventory_transactions (for audit trail, no quantity change)
                            await connection.execute(
                                `INSERT INTO drug_inventory_transactions
                                (drugInventoryId, patientId, prescriptionId, dispensationId, transactionType, transactionDate,
                                 quantityChange, quantityBefore, quantityAfter, balanceAfter, unitPrice, sellPrice,
                                 totalValue, totalSellValue, referenceType, referenceId, referenceNumber, performedBy, notes)
                                VALUES (?, ?, ?, ?, 'TRANSFER', ?, 0, ?, ?, ?, ?, ?, 0, 0, 'nurse_pickup', ?, ?, ?, ?)`,
                                [
                                    disp.drugInventoryId,
                                    patientId,
                                    prescriptionId,
                                    resolvedDispensationId,
                                    transactionDate,
                                    currentQuantity, // quantityBefore (no change)
                                    currentQuantity, // quantityAfter (no change)
                                    currentQuantity, // balanceAfter (no change)
                                    unitPrice,
                                    sellPrice,
                                    pickupId,
                                    `NP-${pickupId}`,
                                    userId,
                                    `Nurse pickup: ${quantityPickedUp} units picked up by nurse. Batch: ${disp.batchNumber || 'N/A'}`
                                ]
                            );

                            // Record in drug_stock_adjustments for drug history
                            await connection.execute(
                                `INSERT INTO drug_stock_adjustments
                                (drugInventoryId, medicationId, adjustmentType, adjustmentDate, quantity, batchNumber, unitPrice, sellPrice,
                                 expiryDate, location, patientId, prescriptionId, dispensationId, referenceType, referenceId, referenceNumber, performedBy, notes)
                                VALUES (?, ?, 'TRANSFER', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'nurse_pickup', ?, ?, ?, ?)`,
                                [
                                    disp.drugInventoryId,
                                    prescriptionItem.medicationId,
                                    transactionDate,
                                    disp.batchNumber || null,
                                    unitPrice,
                                    sellPrice,
                                    disp.expiryDate || null,
                                    null, // location
                                    patientId,
                                    prescriptionId,
                                    resolvedDispensationId,
                                    pickupId,
                                    `NP-${pickupId}`,
                                    userId,
                                    `Nurse pickup: ${quantityPickedUp} units. Batch: ${disp.batchNumber || 'N/A'}`
                                ]
                            );
                        } catch (historyError) {
                            console.error('Error recording nurse pickup in drug history:', historyError);
                            // Don't fail the transaction if history recording fails
                        }
                    }
                }
            }

            // Create invoice for the pickup if there are items with pricing
            let invoiceId = null;
            if (invoiceItems.length > 0 && totalInvoiceAmount > 0) {
                // Generate invoice number
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

                // Check for duplicates and retry if needed
                let attempts = 0;
                while (attempts < 100) {
                    try {
                        const [invResult] = await connection.execute(
                            `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, totalAmount, balance, status, notes, createdBy)
                             VALUES (?, ?, CURDATE(), ?, ?, 'pending', ?, ?)`,
                            [
                                invoiceNumber,
                                patientId,
                                totalInvoiceAmount,
                                totalInvoiceAmount,
                                `Nurse Pickup - Prescription: ${prescription.prescriptionNumber}${actualAdmissionId ? `, Admission: ${actualAdmissionId}` : ''}`,
                                userId || null
                            ]
                        );

                        invoiceId = invResult.insertId;

                        // Insert invoice items
                        for (const invItem of invoiceItems) {
                            await connection.execute(
                                `INSERT INTO invoice_items (invoiceId, description, quantity, unitPrice, totalPrice, drugInventoryId)
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [
                                    invoiceId,
                                    invItem.description,
                                    invItem.quantity,
                                    invItem.unitPrice,
                                    invItem.totalPrice,
                                    invItem.drugInventoryId || null
                                ]
                            );
                        }

                        break; // Success, exit retry loop
                    } catch (insertError) {
                        if (insertError.code === 'ER_DUP_ENTRY' && insertError.sqlMessage.includes('invoiceNumber')) {
                            // Duplicate invoice number, try next number
                            nextNum++;
                            invoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;
                            attempts++;
                        } else {
                            throw insertError; // Re-throw if it's not a duplicate key error
                        }
                    }
                }

                if (attempts >= 100) {
                    await connection.rollback();
                    return res.status(500).json({ error: 'Failed to generate unique invoice number after 100 attempts' });
                }
            }

            // Check if all dispensed prescription items have been picked up and update prescription status
            // Count total dispensed prescription items (only items that are dispensed should be picked up)
            const [totalDispensedItems] = await connection.execute(
                'SELECT COUNT(*) as total FROM prescription_items WHERE prescriptionId = ? AND status = "dispensed"',
                [prescriptionId]
            );
            const totalDispensedItemsCount = totalDispensedItems[0]?.total || 0;

            // Count dispensed items that have been picked up (via nurse_pickup_items)
            const [pickedUpItems] = await connection.execute(
                `SELECT COUNT(DISTINCT npi.prescriptionItemId) as pickedUpCount
                 FROM nurse_pickup_items npi
                 INNER JOIN nurse_pickups np ON npi.pickupId = np.pickupId
                 INNER JOIN prescription_items pi ON npi.prescriptionItemId = pi.itemId
                 WHERE np.prescriptionId = ?
                 AND np.status = 'picked_up'
                 AND pi.status = 'dispensed'`,
                [prescriptionId]
            );
            const pickedUpItemsCount = pickedUpItems[0]?.pickedUpCount || 0;

            // If all dispensed items have been picked up, update prescription status
            if (totalDispensedItemsCount > 0 && pickedUpItemsCount >= totalDispensedItemsCount) {
                await connection.execute(
                    'UPDATE prescriptions SET status = "picked_up", updatedAt = NOW() WHERE prescriptionId = ?',
                    [prescriptionId]
                );
            }

            // Get created pickup with details
            const [createdPickup] = await connection.execute(
                `SELECT
                    np.*,
                    p.prescriptionNumber,
                    pt.patientNumber,
                    pt.firstName as patientFirstName,
                    pt.lastName as patientLastName,
                    u.firstName as nurseFirstName,
                    u.lastName as nurseLastName,
                    ia.admissionNumber
                 FROM nurse_pickups np
                 INNER JOIN prescriptions p ON np.prescriptionId = p.prescriptionId
                 INNER JOIN patients pt ON np.patientId = pt.patientId
                 INNER JOIN users u ON np.pickedUpBy = u.userId
                 LEFT JOIN admissions ia ON np.admissionId = ia.admissionId
                 WHERE np.pickupId = ?`,
                [pickupId]
            );

            // Get pickup items
            const [pickupItems] = await connection.execute(
                `SELECT
                    npi.*,
                    pi.medicationName,
                    pi.dosage,
                    pi.frequency,
                    d.quantityDispensed,
                    d.batchNumber
                 FROM nurse_pickup_items npi
                 INNER JOIN prescription_items pi ON npi.prescriptionItemId = pi.itemId
                 LEFT JOIN dispensations d ON npi.dispensationId = d.dispensationId
                 WHERE npi.pickupId = ?`,
                [pickupId]
            );

            createdPickups.push({
                ...createdPickup[0],
                items: pickupItems,
                invoiceId: invoiceId || null
            });
        }

        await connection.commit();
        res.status(201).json({ pickups: createdPickups });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating nurse pickup:', error);
        res.status(500).json({ message: 'Error creating nurse pickup', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route GET /api/pharmacy/nurse-pickups
 * @description Get nurse pickup history
 */
router.get('/nurse-pickups', async (req, res) => {
    try {
        const { nurseId, patientId, admissionId, startDate, endDate, status, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                np.pickupId,
                np.prescriptionId,
                np.patientId,
                np.admissionId,
                np.pickedUpBy,
                np.recordedPickupBy,
                np.pickupDate,
                np.status,
                np.notes,
                np.createdAt,
                p.prescriptionNumber,
                p.prescriptionDate,
                pt.patientNumber,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                u.firstName as nurseFirstName,
                u.lastName as nurseLastName,
                u.username as nurseUsername,
                ph.firstName as pharmacistFirstName,
                ph.lastName as pharmacistLastName,
                ph.username as pharmacistUsername,
                ia.admissionNumber,
                (SELECT COUNT(*) FROM nurse_pickup_items WHERE pickupId = np.pickupId) as itemCount
            FROM nurse_pickups np
            INNER JOIN prescriptions p ON np.prescriptionId = p.prescriptionId
            INNER JOIN patients pt ON np.patientId = pt.patientId
            INNER JOIN users u ON np.pickedUpBy = u.userId
            LEFT JOIN users ph ON np.recordedPickupBy = ph.userId
            LEFT JOIN admissions ia ON np.admissionId = ia.admissionId
            WHERE 1=1
        `;

        const params = [];

        if (nurseId) {
            query += ` AND np.pickedUpBy = ?`;
            params.push(nurseId);
        }

        if (patientId) {
            query += ` AND np.patientId = ?`;
            params.push(patientId);
        }

        if (admissionId) {
            query += ` AND np.admissionId = ?`;
            params.push(admissionId);
        }

        if (status) {
            query += ` AND np.status = ?`;
            params.push(status);
        }

        if (startDate) {
            query += ` AND DATE(np.pickupDate) >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND DATE(np.pickupDate) <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY np.pickupDate DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);

        // Get items for each pickup
        const pickupsWithItems = await Promise.all(
            rows.map(async (pickup) => {
                const [items] = await pool.execute(
                    `SELECT
                        npi.*,
                        pi.medicationName,
                        pi.dosage,
                        pi.frequency,
                        pi.duration,
                        d.quantityDispensed,
                        d.batchNumber,
                        d.expiryDate
                     FROM nurse_pickup_items npi
                     INNER JOIN prescription_items pi ON npi.prescriptionItemId = pi.itemId
                     LEFT JOIN dispensations d ON npi.dispensationId = d.dispensationId
                     WHERE npi.pickupId = ?`,
                    [pickup.pickupId]
                );

                return {
                    ...pickup,
                    items: items
                };
            })
        );

        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total
            FROM nurse_pickups np
            INNER JOIN prescriptions p ON np.prescriptionId = p.prescriptionId
            INNER JOIN patients pt ON np.patientId = pt.patientId
            INNER JOIN users u ON np.pickedUpBy = u.userId
            LEFT JOIN admissions ia ON np.admissionId = ia.admissionId
            WHERE 1=1
        `;
        const countParams = [];

        if (nurseId) {
            countQuery += ` AND np.pickedUpBy = ?`;
            countParams.push(nurseId);
        }
        if (patientId) {
            countQuery += ` AND np.patientId = ?`;
            countParams.push(patientId);
        }
        if (admissionId) {
            countQuery += ` AND np.admissionId = ?`;
            countParams.push(admissionId);
        }
        if (status) {
            countQuery += ` AND np.status = ?`;
            countParams.push(status);
        }
        if (startDate) {
            countQuery += ` AND DATE(np.pickupDate) >= ?`;
            countParams.push(startDate);
        }
        if (endDate) {
            countQuery += ` AND DATE(np.pickupDate) <= ?`;
            countParams.push(endDate);
        }

        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult && countResult.length > 0 ? (countResult[0].total || 0) : 0;

        res.status(200).json({
            pickups: pickupsWithItems,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching nurse pickups:', error);
        res.status(500).json({ message: 'Error fetching nurse pickups', error: error.message });
    }
});

/**
 * @route GET /api/pharmacy/nurse-pickups/:id
 * @description Get a single nurse pickup by ID
 */
router.get('/nurse-pickups/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [pickups] = await pool.execute(
            `SELECT
                np.*,
                p.prescriptionNumber,
                p.prescriptionDate,
                pt.patientNumber,
                pt.firstName as patientFirstName,
                pt.lastName as patientLastName,
                u.firstName as nurseFirstName,
                u.lastName as nurseLastName,
                u.username as nurseUsername,
                ph.firstName as pharmacistFirstName,
                ph.lastName as pharmacistLastName,
                ph.username as pharmacistUsername,
                ia.admissionNumber
             FROM nurse_pickups np
             INNER JOIN prescriptions p ON np.prescriptionId = p.prescriptionId
             INNER JOIN patients pt ON np.patientId = pt.patientId
             INNER JOIN users u ON np.pickedUpBy = u.userId
             LEFT JOIN users ph ON np.recordedPickupBy = ph.userId
             LEFT JOIN admissions ia ON np.admissionId = ia.admissionId
             WHERE np.pickupId = ?`,
            [id]
        );

        if (pickups.length === 0) {
            return res.status(404).json({ message: 'Nurse pickup not found' });
        }

        const pickup = pickups[0];

        // Get pickup items
        const [items] = await pool.execute(
            `SELECT
                npi.*,
                pi.medicationName,
                pi.dosage,
                pi.frequency,
                pi.duration,
                pi.quantity,
                pi.instructions,
                d.quantityDispensed,
                d.batchNumber,
                d.expiryDate,
                d.dispensationDate
             FROM nurse_pickup_items npi
             INNER JOIN prescription_items pi ON npi.prescriptionItemId = pi.itemId
             LEFT JOIN dispensations d ON npi.dispensationId = d.dispensationId
             WHERE npi.pickupId = ?`,
            [id]
        );

        res.status(200).json({
            ...pickup,
            items: items
        });
    } catch (error) {
        console.error('Error fetching nurse pickup:', error);
        res.status(500).json({ message: 'Error fetching nurse pickup', error: error.message });
    }
});

/**
 * @route PATCH /api/pharmacy/nurse-pickups/:id
 * @description Update nurse pickup status (e.g. pending -> ready_for_pickup when pharmacy has dispensed).
 * Only pharmacist (pharmacy) can call this. When cancelling a picked_up pickup, quantities are returned to inventory.
 */
router.patch('/nurse-pickups/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['ready_for_pickup', 'picked_up', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Allowed: ready_for_pickup, picked_up, cancelled' });
        }

        const [existing] = await connection.execute(
            'SELECT pickupId, status, prescriptionId FROM nurse_pickups WHERE pickupId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Nurse pickup not found' });
        }

        const current = existing[0];
        if (current.status !== 'pending' && status === 'ready_for_pickup') {
            return res.status(400).json({ message: 'Only pending requests can be marked as ready for pickup' });
        }

        if (status === 'cancelled' && current.status === 'picked_up') {
            await connection.beginTransaction();
            try {
                // Return quantities to inventory for each pickup item that has a dispensation
                const [items] = await connection.execute(
                    `SELECT npi.dispensationId, npi.quantityPickedUp, npi.prescriptionItemId, pi.medicationId
                     FROM nurse_pickup_items npi
                     INNER JOIN prescription_items pi ON pi.itemId = npi.prescriptionItemId
                     WHERE npi.pickupId = ? AND npi.dispensationId IS NOT NULL`,
                    [id]
                );
                for (const row of items) {
                    const [disp] = await connection.execute(
                        'SELECT batchNumber, quantityDispensed FROM dispensations WHERE dispensationId = ?',
                        [row.dispensationId]
                    );
                    if (disp.length === 0) continue;
                    const qtyToReturn = row.quantityPickedUp || disp[0].quantityDispensed || 0;
                    if (qtyToReturn <= 0) continue;
                    const [diRows] = await connection.execute(
                        `SELECT drugInventoryId, quantity, status FROM drug_inventory
                         WHERE medicationId = ? AND batchNumber = ? LIMIT 1`,
                        [row.medicationId, disp[0].batchNumber]
                    );
                    if (diRows.length === 0) continue;
                    const di = diRows[0];
                    const newQty = (di.quantity || 0) + qtyToReturn;
                    await connection.execute(
                        'UPDATE drug_inventory SET quantity = ?, updatedAt = NOW() WHERE drugInventoryId = ?',
                        [newQty, di.drugInventoryId]
                    );
                    if (di.status === 'exhausted' && newQty > 0) {
                        await connection.execute(
                            "UPDATE drug_inventory SET status = 'active', dateExhausted = NULL, updatedAt = NOW() WHERE drugInventoryId = ?",
                            [di.drugInventoryId]
                        ).catch(() => {});
                    }
                    const userId = req.user?.id || req.user?.userId || null;
                    await connection.execute(
                        `INSERT INTO drug_inventory_transactions
                         (drugInventoryId, transactionType, transactionDate, quantityChange, quantityBefore, quantityAfter, balanceAfter, performedBy, notes)
                         VALUES (?, 'RETURN', CURDATE(), ?, ?, ?, ?, ?, ?)`,
                        [di.drugInventoryId, qtyToReturn, di.quantity, newQty, newQty, userId, `Nurse pickup cancelled - returned ${qtyToReturn} units to inventory`]
                    );
                }
                // Revert prescription status from picked_up back to dispensed
                await connection.execute(
                    'UPDATE prescriptions SET status = "dispensed", updatedAt = NOW() WHERE prescriptionId = ?',
                    [current.prescriptionId]
                );
                await connection.execute(
                    'UPDATE nurse_pickups SET status = ?, recordedPickupBy = NULL, updatedAt = NOW() WHERE pickupId = ?',
                    [status, id]
                );
                await connection.commit();
            } catch (err) {
                await connection.rollback();
                throw err;
            }
        } else {
            await connection.execute(
                'UPDATE nurse_pickups SET status = ?, updatedAt = NOW() WHERE pickupId = ?',
                [status, id]
            );
        }

        res.status(200).json({ message: 'Nurse pickup updated', pickupId: id, status });
    } catch (error) {
        console.error('Error updating nurse pickup:', error);
        res.status(500).json({ message: 'Error updating nurse pickup', error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
