// Billing routes
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { resolveChargeRate } = require('../lib/chargeRateResolver');
const { notifyPaymentReceived } = require('../lib/patientSms');
const mpesaRoutes = require('./mpesaRoutes');

// Cloudsasa M-Pesa STK (initiate + public callback) — docs/MPESA_STK_INTEGRATION_GUIDE.md
router.use('/mpesa', mpesaRoutes);

/**
 * Resolve unit price for an invoice line item (uses shared resolver; no ward override).
 * @param {object} connection - DB connection (same transaction)
 * @param {number} patientId - Patient ID
 * @param {object} item - { chargeId, quantity, description } (quantity default 1)
 * @param {string} asOfDate - Date for effective rate (YYYY-MM-DD)
 * @returns {Promise<{ unitPrice: number, totalPrice: number }>}
 */
async function resolveLineItemPrice(connection, patientId, item, asOfDate) {
    return resolveChargeRate(connection, patientId, item, asOfDate, {});
}

// Service charges
/**
 * @route GET /api/billing/charges
 * @description Get all service charges (optionally filtered by status)
 */
router.get('/charges', async (req, res) => {
    try {
        const { status, category, department, search, chargeType } = req.query;
        let query = 'SELECT * FROM service_charges WHERE 1=1';
        const params = [];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        } else {
            // Default: show all (both Active and Inactive)
            query += ' AND (status = "Active" OR status = "Inactive")';
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (department) {
            query += ' AND department = ?';
            params.push(department);
        }

        if (chargeType) {
            query += ' AND chargeType = ?';
            params.push(chargeType);
        }

        if (search) {
            query += ' AND (name LIKE ? OR chargeCode LIKE ? OR description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ' ORDER BY name ASC';

        const [rows] = await pool.query(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching charges:', error);
        res.status(500).json({ message: 'Error fetching charges', error: error.message });
    }
});

/**
 * @route GET /api/billing/charges/:id
 * @description Get a single service charge by ID
 */
router.get('/charges/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM service_charges WHERE chargeId = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Service charge not found' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching charge:', error);
        res.status(500).json({ message: 'Error fetching charge', error: error.message });
    }
});

/**
 * @route POST /api/billing/charges
 * @description Create a new service charge
 */
router.post('/charges', async (req, res) => {
    try {
        const { chargeCode, name, category, department, cost, description, status = 'Active', chargeType = 'Service', duration, unit } = req.body;

        if (!name || !cost) {
            return res.status(400).json({ error: 'Name and cost are required' });
        }

        // Generate charge code if not provided
        let finalChargeCode = chargeCode;
        if (!finalChargeCode) {
            // Generate code from name (e.g., "General Consultation" -> "GEN-CONS")
            const codeParts = name.toUpperCase().split(' ').slice(0, 2).map(part => part.substring(0, 3));
            finalChargeCode = codeParts.join('-');

            // Ensure uniqueness
            let counter = 1;
            let [existing] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeCode = ?', [finalChargeCode]);
            while (existing.length > 0) {
                finalChargeCode = `${codeParts.join('-')}-${counter}`;
                [existing] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeCode = ?', [finalChargeCode]);
                counter++;
            }
        } else {
            // Check if code already exists
            const [existing] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeCode = ?', [finalChargeCode]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Charge code already exists' });
            }
        }

        const [result] = await pool.query(
            'INSERT INTO service_charges (chargeCode, name, category, department, cost, description, status, chargeType, duration, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [finalChargeCode, name, category || null, department || null, cost, description || null, status, chargeType, duration || null, unit || null]
        );

        const [newCharge] = await pool.query('SELECT * FROM service_charges WHERE chargeId = ?', [result.insertId]);
        res.status(201).json(newCharge[0]);
    } catch (error) {
        console.error('Error creating charge:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Charge code already exists' });
        }
        res.status(500).json({ message: 'Error creating charge', error: error.message });
    }
});

/**
 * @route PUT /api/billing/charges/:id
 * @description Update a service charge
 */
router.put('/charges/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { chargeCode, name, category, department, cost, description, status, chargeType, duration, unit } = req.body;

        // Check if charge exists
        const [existing] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeId = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Service charge not found' });
        }

        // Check for duplicate charge code if it's being changed
        if (chargeCode) {
            const [duplicate] = await pool.query(
                'SELECT chargeId FROM service_charges WHERE chargeCode = ? AND chargeId != ?',
                [chargeCode, id]
            );
            if (duplicate.length > 0) {
                return res.status(400).json({ error: 'Charge code already exists' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (chargeCode !== undefined) { updates.push('chargeCode = ?'); values.push(chargeCode); }
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (category !== undefined) { updates.push('category = ?'); values.push(category); }
        if (department !== undefined) { updates.push('department = ?'); values.push(department); }
        if (cost !== undefined) { updates.push('cost = ?'); values.push(cost); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (chargeType !== undefined) { updates.push('chargeType = ?'); values.push(chargeType); }
        if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
        if (unit !== undefined) { updates.push('unit = ?'); values.push(unit); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        await pool.query(
            `UPDATE service_charges SET ${updates.join(', ')}, updatedAt = NOW() WHERE chargeId = ?`,
            values
        );

        const [updated] = await pool.query('SELECT * FROM service_charges WHERE chargeId = ?', [id]);
        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating charge:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Charge code already exists' });
        }
        res.status(500).json({ message: 'Error updating charge', error: error.message });
    }
});

/**
 * @route DELETE /api/billing/charges/:id
 * @description Delete (deactivate) a service charge
 */
router.delete('/charges/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if charge is used in any invoices
        const [invoices] = await pool.query(
            'SELECT COUNT(*) as count FROM invoice_items WHERE chargeId = ?',
            [id]
        );

        if (invoices[0].count > 0) {
            // Soft delete by setting status to Inactive
            await pool.query(
                'UPDATE service_charges SET status = "Inactive", updatedAt = NOW() WHERE chargeId = ?',
                [id]
            );
            return res.status(200).json({ message: 'Service charge deactivated (used in invoices)' });
        }

        // Hard delete if not used
        const [result] = await pool.query('DELETE FROM service_charges WHERE chargeId = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Service charge not found' });
        }

        res.status(200).json({ message: 'Service charge deleted successfully' });
    } catch (error) {
        console.error('Error deleting charge:', error);
        res.status(500).json({ message: 'Error deleting charge', error: error.message });
    }
});

// Invoices
router.get('/invoices', async (req, res) => {
    try {
        const { patientId, status } = req.query;
        let query = `SELECT i.*,
                            p.firstName as patientFirstName,
                            p.lastName as patientLastName,
                            p.patientNumber,
                            p.phone as patientPhone
                     FROM invoices i
                     LEFT JOIN patients p ON i.patientId = p.patientId
                     WHERE 1=1`;
        const params = [];
        if (patientId) {
            query += ' AND i.patientId = ?';
            params.push(patientId);
        }
        if (status) {
            query += ' AND i.status = ?';
            params.push(status);
        }
        query += ' ORDER BY i.invoiceDate DESC';
        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ message: 'Error fetching invoices', error: error.message });
    }
});

/**
 * @route GET /api/billing/invoices/:id
 * @description Get a single invoice by ID with items
 */
router.get('/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get invoice
        const [invoices] = await pool.execute(
            `SELECT i.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    p.patientNumber, p.phone as patientPhone
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.invoiceId = ?`,
            [id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Get invoice items with medication names for prescription items
        const [items] = await pool.execute(
            `SELECT
                ii.*,
                sc.name as chargeName,
                sc.chargeCode,
                m.name as medicationName
             FROM invoice_items ii
             LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
             LEFT JOIN drug_inventory di ON ii.drugInventoryId = di.drugInventoryId
             LEFT JOIN medications m ON di.medicationId = m.medicationId
             WHERE ii.invoiceId = ?
             ORDER BY ii.itemId`,
            [id]
        );

        // Update description for prescription items to use actual medication name
        const updatedItems = items.map((item) => {
            // If description contains "Prescription Item:" and we have medicationName, update it
            if (item.description && item.description.includes('Prescription Item:') && item.medicationName) {
                // Extract the medication name from description or use the joined medicationName
                const currentName = item.description.replace('Prescription Item: ', '').trim();
                // If current name is 'Unknown' or empty, use the medicationName from join
                if (currentName === 'Unknown' || !currentName || currentName === '') {
                    return {
                        ...item,
                        description: `Prescription Item: ${item.medicationName}`
                    };
                }
            }
            return item;
        });

        res.status(200).json({
            ...invoices[0],
            items: updatedItems
        });
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({ message: 'Error fetching invoice', error: error.message });
    }
});

/**
 * @route GET /api/billing/invoices/patient/:patientId/pending
 * @description Get pending invoices for a patient
 */
router.get('/invoices/patient/:patientId/pending', async (req, res) => {
    try {
        const { patientId } = req.params;

        const [invoices] = await pool.execute(
            `SELECT i.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    p.patientNumber
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.patientId = ? AND i.status IN ('pending', 'partial')
             ORDER BY i.invoiceDate DESC`,
            [patientId]
        );

        // Get items for each invoice with medication names
        const invoicesWithItems = await Promise.all(invoices.map(async (invoice) => {
            const [items] = await pool.execute(
                `SELECT
                    ii.*,
                    sc.name as chargeName,
                    sc.chargeCode,
                    m.name as medicationName
                 FROM invoice_items ii
                 LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
                 LEFT JOIN drug_inventory di ON ii.drugInventoryId = di.drugInventoryId
                 LEFT JOIN medications m ON di.medicationId = m.medicationId
                 WHERE ii.invoiceId = ?
                 ORDER BY ii.itemId`,
                [invoice.invoiceId]
            );

            // Update description for prescription items to use actual medication name
            const updatedItems = items.map((item) => {
                if (item.description && item.description.includes('Prescription Item:') && item.medicationName) {
                    const currentName = item.description.replace('Prescription Item: ', '').trim();
                    if (currentName === 'Unknown' || !currentName || currentName === '') {
                        return {
                            ...item,
                            description: `Prescription Item: ${item.medicationName}`
                        };
                    }
                }
                return item;
            });
            return {
                ...invoice,
                items: updatedItems
            };
        }));

        res.status(200).json(invoicesWithItems);
    } catch (error) {
        console.error('Error fetching pending invoices:', error);
        res.status(500).json({ message: 'Error fetching pending invoices', error: error.message });
    }
});

/**
 * @route POST /api/billing/invoices
 * @description Create a new invoice
 */
router.post('/invoices', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { invoiceNumber, patientId, invoiceDate, dueDate, items, notes, status = 'pending' } = req.body;
        const userId = req.user?.id;

        if (!patientId || !items || items.length === 0) {
            return res.status(400).json({ error: 'Patient and items are required' });
        }

        const asOfDate = (invoiceDate || new Date().toISOString().split('T')[0]).toString().slice(0, 10);
        const resolvedItems = [];
        for (const item of items) {
            if (item.chargeId) {
                const { unitPrice, totalPrice } = await resolveLineItemPrice(connection, patientId, item, asOfDate);
                resolvedItems.push({
                    chargeId: item.chargeId,
                    description: item.description || '',
                    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
                    unitPrice,
                    totalPrice
                });
            } else {
                const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
                const up = parseFloat(item.unitPrice) || 0;
                resolvedItems.push({
                    chargeId: item.chargeId || null,
                    description: item.description || '',
                    quantity: qty,
                    unitPrice: up,
                    totalPrice: parseFloat(item.totalPrice) || Math.round(up * qty * 100) / 100
                });
            }
        }

        // Generate invoice number if not provided
        // Use same approach as triage numbers to avoid duplicates in concurrent scenarios
        let finalInvoiceNumber = invoiceNumber;
        if (!finalInvoiceNumber) {
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
            finalInvoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;

            // Check if this number already exists (safety check for race conditions)
            let attempts = 0;
            while (attempts < 100) {
                const [existing] = await connection.execute(
                    'SELECT invoiceId FROM invoices WHERE invoiceNumber = ?',
                    [finalInvoiceNumber]
                );

                if (existing.length === 0) {
                    break; // Number is available
                }
                // Number exists, try next one
                nextNum++;
                finalInvoiceNumber = `${datePrefix}${String(nextNum).padStart(4, '0')}`;
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
        }

        // Calculate total amount from resolved items
        const totalAmount = resolvedItems.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);

        // Insert invoice (with retry on duplicate key error)
        let result;
        try {
            [result] = await connection.execute(
                `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, dueDate, totalAmount, balance, status, notes, createdBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    finalInvoiceNumber,
                    patientId,
                    invoiceDate || new Date().toISOString().split('T')[0],
                    dueDate || null,
                    totalAmount,
                    totalAmount, // balance = totalAmount initially
                    status,
                    notes || null,
                    userId || null
                ]
            );
        } catch (insertError) {
            // Handle duplicate key error - find next available number
            if (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062) {
                const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
                const datePrefix = `INV-${today}-`;

                        // Get max number and find next available
                        const [maxResult] = await connection.execute(
                            `SELECT MAX(CAST(SUBSTRING_INDEX(invoiceNumber, '-', -1) AS UNSIGNED)) as maxNum
                             FROM invoices
                             WHERE invoiceNumber LIKE CONCAT(?, '%')`,
                            [datePrefix]
                        );

                let retryNum = (maxResult[0]?.maxNum || 0) + 1;
                let foundAvailable = false;
                let retryAttempts = 0;

                while (!foundAvailable && retryAttempts < 100) {
                    const testNumber = `${datePrefix}${String(retryNum).padStart(4, '0')}`;
                    const [existing] = await connection.execute(
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

                if (!foundAvailable) {
                    await connection.rollback();
                    connection.release();
                    return res.status(500).json({
                        message: 'Failed to generate unique invoice number',
                        error: 'Please try again.'
                    });
                }

                // Retry insert with new number
                [result] = await connection.execute(
                    `INSERT INTO invoices (invoiceNumber, patientId, invoiceDate, dueDate, totalAmount, balance, status, notes, createdBy)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        finalInvoiceNumber,
                        patientId,
                        invoiceDate || new Date().toISOString().split('T')[0],
                        dueDate || null,
                        totalAmount,
                        totalAmount,
                        status,
                        notes || null,
                        userId || null
                    ]
                );
            } else {
                throw insertError; // Re-throw if it's not a duplicate key error
            }
        }

        const invoiceId = result.insertId;

        // Insert invoice items (using resolved prices)
        for (const item of resolvedItems) {
            await connection.execute(
                `INSERT INTO invoice_items (invoiceId, chargeId, description, quantity, unitPrice, totalPrice)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    invoiceId,
                    item.chargeId || null,
                    item.description || '',
                    item.quantity || 1,
                    item.unitPrice || 0,
                    item.totalPrice || 0
                ]
            );
        }

        await connection.commit();

        // Get the created invoice with items
        const [invoices] = await connection.execute(
            `SELECT i.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    p.patientNumber, p.phone as patientPhone, p.patientType, p.insuranceCompanyId, p.insuranceNumber
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.invoiceId = ?`,
            [invoiceId]
        );

        const [itemsData] = await connection.execute(
            `SELECT ii.*, sc.name as chargeName, sc.chargeCode
             FROM invoice_items ii
             LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
             WHERE ii.invoiceId = ?
             ORDER BY ii.itemId`,
            [invoiceId]
        );

        // Check if patient has active insurance and can create claim
        let insuranceInfo = null;
        if (invoices[0].patientType === 'insurance') {
            const [activeInsurance] = await connection.execute(
                `SELECT pi.*, ip.providerName, ip.providerCode
                 FROM patient_insurance pi
                 LEFT JOIN insurance_providers ip ON pi.providerId = ip.providerId
                 WHERE pi.patientId = ?
                   AND pi.isActive = 1
                   AND (pi.coverageEndDate IS NULL OR pi.coverageEndDate >= CURDATE())
                 ORDER BY pi.coverageStartDate DESC
                 LIMIT 1`,
                [patientId]
            );

            if (activeInsurance.length > 0) {
                insuranceInfo = {
                    patientInsuranceId: activeInsurance[0].patientInsuranceId,
                    providerName: activeInsurance[0].providerName,
                    providerCode: activeInsurance[0].providerCode,
                    policyNumber: activeInsurance[0].policyNumber,
                    memberId: activeInsurance[0].memberId,
                    canCreateClaim: true
                };
            } else {
                // Patient marked as insurance but no active policy found
                insuranceInfo = {
                    canCreateClaim: false,
                    reason: 'No active insurance policy found. Please create an insurance policy for this patient.'
                };
            }
        }

        res.status(201).json({
            ...invoices[0],
            items: itemsData,
            insuranceInfo: insuranceInfo
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating invoice:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Invoice number already exists' });
        }
        res.status(500).json({ message: 'Error creating invoice', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/billing/invoices/:id
 * @description Update an invoice
 */
router.put('/invoices/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { invoiceDate, dueDate, items, notes, status } = req.body;

        // Check if invoice exists and get patientId for rate resolution
        const [existing] = await connection.execute('SELECT invoiceId, patientId, invoiceDate FROM invoices WHERE invoiceId = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }
        const patientId = existing[0].patientId;
        const asOfDate = (invoiceDate ?? existing[0].invoiceDate ?? new Date().toISOString().split('T')[0]).toString().slice(0, 10);

        // Build update query
        const updates = [];
        const values = [];

        if (invoiceDate !== undefined) { updates.push('invoiceDate = ?'); values.push(invoiceDate); }
        if (dueDate !== undefined) { updates.push('dueDate = ?'); values.push(dueDate); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }

        // If items are provided, resolve prices and update them
        if (items && items.length > 0) {
            const resolvedItems = [];
            for (const item of items) {
                if (item.chargeId) {
                    const { unitPrice, totalPrice } = await resolveLineItemPrice(connection, patientId, item, asOfDate);
                    resolvedItems.push({
                        chargeId: item.chargeId,
                        description: item.description || '',
                        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
                        unitPrice,
                        totalPrice
                    });
                } else {
                    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
                    const up = parseFloat(item.unitPrice) || 0;
                    resolvedItems.push({
                        chargeId: item.chargeId || null,
                        description: item.description || '',
                        quantity: qty,
                        unitPrice: up,
                        totalPrice: parseFloat(item.totalPrice) || Math.round(up * qty * 100) / 100
                    });
                }
            }

            const totalAmount = resolvedItems.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);

            // Get current paid amount
            const [current] = await connection.execute('SELECT paidAmount FROM invoices WHERE invoiceId = ?', [id]);
            const paidAmount = parseFloat(current[0]?.paidAmount || 0);
            const balance = totalAmount - paidAmount;

            updates.push('totalAmount = ?');
            values.push(totalAmount);
            updates.push('balance = ?');
            values.push(balance);

            // Delete existing items
            await connection.execute('DELETE FROM invoice_items WHERE invoiceId = ?', [id]);

            // Insert new items (using resolved prices)
            for (const item of resolvedItems) {
                await connection.execute(
                    `INSERT INTO invoice_items (invoiceId, chargeId, description, quantity, unitPrice, totalPrice)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        item.chargeId || null,
                        item.description || '',
                        item.quantity || 1,
                        item.unitPrice || 0,
                        item.totalPrice || 0
                    ]
                );
            }
        }

        if (updates.length > 0) {
            values.push(id);
            await connection.execute(
                `UPDATE invoices SET ${updates.join(', ')}, updatedAt = NOW() WHERE invoiceId = ?`,
                values
            );
        }

        await connection.commit();

        // Get updated invoice
        const [invoices] = await connection.execute(
            `SELECT i.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    p.patientNumber, p.phone as patientPhone
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.invoiceId = ?`,
            [id]
        );

        const [itemsData] = await connection.execute(
            `SELECT ii.*, sc.name as chargeName, sc.chargeCode
             FROM invoice_items ii
             LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
             WHERE ii.invoiceId = ?
             ORDER BY ii.itemId`,
            [id]
        );

        res.status(200).json({
            ...invoices[0],
            items: itemsData
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating invoice:', error);
        res.status(500).json({ message: 'Error updating invoice', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route DELETE /api/billing/invoices/:id
 * @description Delete (cancel) an invoice
 */
router.delete('/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if invoice exists
        const [existing] = await pool.execute('SELECT invoiceId, status FROM invoices WHERE invoiceId = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // If invoice is paid, don't allow deletion - mark as cancelled instead
        if (existing[0].status === 'paid') {
            await pool.execute('UPDATE invoices SET status = "cancelled", updatedAt = NOW() WHERE invoiceId = ?', [id]);
            return res.status(200).json({ message: 'Invoice cancelled (was already paid)' });
        }

        // Otherwise, delete it (items will be deleted via CASCADE)
        await pool.execute('DELETE FROM invoices WHERE invoiceId = ?', [id]);

        res.status(200).json({ message: 'Invoice deleted successfully' });
    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({ message: 'Error deleting invoice', error: error.message });
    }
});

/**
 * @route POST /api/billing/invoices/:id/payment
 * @description Record a payment against an invoice
 */
router.post('/invoices/:id/payment', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { paymentAmount, paymentDate, paymentMethod, referenceNumber, notes, batchReceiptNumber } = req.body;
        const userId = req.user?.id;

        if (!paymentAmount || paymentAmount <= 0) {
            return res.status(400).json({ error: 'Payment amount is required and must be greater than 0' });
        }

        // Get current invoice
        const [invoices] = await connection.execute('SELECT * FROM invoices WHERE invoiceId = ?', [id]);
        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];
        const currentPaid = parseFloat(invoice.paidAmount || 0);
        const newPaid = currentPaid + parseFloat(paymentAmount);
        const outstanding = parseFloat(invoice.totalAmount) - newPaid;

        // Determine new status
        let newStatus = invoice.status;
        if (outstanding <= 0) {
            newStatus = 'paid';
        } else if (newPaid > 0 && newPaid < parseFloat(invoice.totalAmount)) {
            newStatus = 'partial';
        }

        // Update invoice
        // If batchReceiptNumber is provided, store it in notes or reference
        let updatedNotes = notes || '';
        let updatedReference = referenceNumber || '';
        if (batchReceiptNumber) {
            updatedNotes = updatedNotes ? `${updatedNotes} | Batch Receipt: ${batchReceiptNumber}` : `Batch Receipt: ${batchReceiptNumber}`;
            if (!updatedReference) {
                updatedReference = batchReceiptNumber;
            }
        }

        // Update invoice with payment details
        // Store batch receipt number in notes if provided
        let updateQuery = `UPDATE invoices
            SET paidAmount = ?, balance = ?, status = ?, paymentMethod = ?, updatedAt = NOW()`;
        const updateParams = [newPaid, outstanding, newStatus, paymentMethod || invoice.paymentMethod];

        if (batchReceiptNumber) {
            // Append batch receipt to notes
            const currentNotes = invoice.notes || '';
            const batchNote = `Batch Receipt: ${batchReceiptNumber}`;
            const updatedNotes = currentNotes ? `${currentNotes} | ${batchNote}` : batchNote;
            updateQuery += `, notes = ?`;
            updateParams.push(updatedNotes);

            // Also set paymentReference if it's empty
            if (!referenceNumber) {
                updateQuery += `, paymentReference = ?`;
                updateParams.push(batchReceiptNumber);
            }
        } else if (referenceNumber) {
            updateQuery += `, paymentReference = ?`;
            updateParams.push(referenceNumber);
        }

        if (notes && !batchReceiptNumber) {
            updateQuery += `, notes = ?`;
            updateParams.push(notes);
        }

        updateQuery += ` WHERE invoiceId = ?`;
        updateParams.push(id);

        await connection.execute(updateQuery, updateParams);

        // If invoice is fully paid, check if we need to create queue entries
        if (newStatus === 'paid') {
            // Check if it's a prescription invoice - create pharmacy queue entry
            if (invoice.notes && invoice.notes.includes('Drug payment - Prescription:')) {
                try {
                    // Extract prescription number from notes (format: "Drug payment - Prescription: PRES-XXXXX" or "PRESC-XXXXX")
                    const prescMatch = invoice.notes.match(/Prescription:\s*([A-Z0-9-]+)/i);
                    let prescriptionNumber = null;
                    let prescription = null;

                    if (prescMatch && prescMatch[1]) {
                        prescriptionNumber = prescMatch[1].trim();
                        console.log(`[PHARMACY QUEUE] Extracted prescription number from invoice notes: ${prescriptionNumber}`);

                        // Find the prescription by prescription number
                        const [prescriptions] = await connection.execute(
                            'SELECT prescriptionId, patientId, status FROM prescriptions WHERE prescriptionNumber = ?',
                            [prescriptionNumber]
                        );

                        if (prescriptions.length > 0) {
                            prescription = prescriptions[0];
                            console.log(`[PHARMACY QUEUE] Found prescription ${prescriptionNumber} for patient ${prescription.patientId}, status: ${prescription.status}`);
                        } else {
                            console.log(`[PHARMACY QUEUE] Prescription ${prescriptionNumber} not found by number, trying to find by patient and invoice`);
                        }
                    }

                    // Fallback: If prescription not found by number, try to find pending prescriptions for this patient
                    if (!prescription) {
                        console.log(`[PHARMACY QUEUE] Attempting fallback: Finding pending prescriptions for patient ${invoice.patientId}`);
                        const [pendingPrescriptions] = await connection.execute(
                            `SELECT p.prescriptionId, p.prescriptionNumber, p.patientId, p.status
                             FROM prescriptions p
                             INNER JOIN invoice_items ii ON ii.description LIKE CONCAT('%Prescription Item:%')
                             INNER JOIN invoices i ON i.invoiceId = ii.invoiceId
                             WHERE i.invoiceId = ? AND p.patientId = ? AND p.status = 'pending'
                             ORDER BY p.prescriptionDate DESC
                             LIMIT 1`,
                            [id, invoice.patientId]
                        );

                        if (pendingPrescriptions.length > 0) {
                            prescription = pendingPrescriptions[0];
                            prescriptionNumber = prescription.prescriptionNumber;
                            console.log(`[PHARMACY QUEUE] Found prescription via fallback: ${prescriptionNumber} for patient ${prescription.patientId}`);
                        } else {
                            // Last resort: Find any pending prescription for this patient
                            const [anyPending] = await connection.execute(
                                `SELECT prescriptionId, prescriptionNumber, patientId, status
                                 FROM prescriptions
                                 WHERE patientId = ? AND status = 'pending'
                                 ORDER BY prescriptionDate DESC
                                 LIMIT 1`,
                                [invoice.patientId]
                            );

                            if (anyPending.length > 0) {
                                prescription = anyPending[0];
                                prescriptionNumber = prescription.prescriptionNumber;
                                console.log(`[PHARMACY QUEUE] Found pending prescription via last resort: ${prescriptionNumber} for patient ${prescription.patientId}`);
                            }
                        }
                    }

                    if (prescription && prescription.status === 'pending') {
                        // Check if pharmacy queue entry already exists for this patient
                        const [existingQueue] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'pharmacy'
                             AND status NOT IN ('completed', 'cancelled')`,
                            [prescription.patientId]
                        );

                        if (existingQueue.length === 0) {
                            // Generate ticket number for pharmacy queue
                            const [pharmacyCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "pharmacy"'
                            );
                            const pharmacyTicketNum = pharmacyCount[0].count + 1;
                            const pharmacyTicketNumber = `P-${String(pharmacyTicketNum).padStart(3, '0')}`;

                            // Create pharmacy queue entry
                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, 'pharmacy', 'normal', 'waiting', ?, ?)`,
                                [
                                    prescription.patientId,
                                    pharmacyTicketNumber,
                                    prescriptionNumber ? `Prescription: ${prescriptionNumber}` : `Invoice: ${invoice.invoiceNumber}`,
                                    userId || null
                                ]
                            );
                            console.log(`[PHARMACY QUEUE] Successfully created pharmacy queue entry for patient ${prescription.patientId} with ticket ${pharmacyTicketNumber}`);
                        } else {
                            console.log(`[PHARMACY QUEUE] Patient ${prescription.patientId} already exists in pharmacy queue (queueId: ${existingQueue[0].queueId})`);
                        }
                    } else if (prescription) {
                        console.log(`[PHARMACY QUEUE] Prescription ${prescriptionNumber || prescription.prescriptionId} is not pending (status: ${prescription.status}) - skipping pharmacy queue addition`);
                    } else {
                        console.log(`[PHARMACY QUEUE] No pending prescription found for patient ${invoice.patientId} - cannot create pharmacy queue entry`);
                    }
                } catch (pharmacyQueueError) {
                    console.error('[PHARMACY QUEUE] Error creating pharmacy queue entry:', pharmacyQueueError);
                    console.error('[PHARMACY QUEUE] Error stack:', pharmacyQueueError.stack);
                    // Don't fail the payment if pharmacy queue creation fails
                }
            }

            // Check if it's a lab test invoice - create laboratory queue entry
            if (invoice.notes && invoice.notes.includes('Lab payment - Order:')) {
                try {
                    // Extract lab order number from notes (format: "Lab payment - Order: LAB-XXXXXX")
                    const labOrderMatch = invoice.notes.match(/Order:\s*([A-Z0-9-]+)/i);
                    let labOrderNumber = null;
                    let labOrder = null;

                    if (labOrderMatch && labOrderMatch[1]) {
                        labOrderNumber = labOrderMatch[1].trim();
                        console.log(`[LABORATORY QUEUE] Extracted lab order number from invoice notes: ${labOrderNumber}`);

                        // Find the lab order by order number
                        const [labOrders] = await connection.execute(
                            'SELECT orderId, orderNumber, patientId, status FROM lab_test_orders WHERE orderNumber = ?',
                            [labOrderNumber]
                        );

                        if (labOrders.length > 0) {
                            labOrder = labOrders[0];
                            console.log(`[LABORATORY QUEUE] Found lab order ${labOrderNumber} for patient ${labOrder.patientId}, status: ${labOrder.status}`);
                        } else {
                            console.log(`[LABORATORY QUEUE] Lab order ${labOrderNumber} not found by number, trying to find by patient and invoice`);
                        }
                    }

                    // Fallback: If lab order not found by number, try to find pending lab orders for this patient
                    if (!labOrder) {
                        console.log(`[LABORATORY QUEUE] Attempting fallback: Finding pending lab orders for patient ${invoice.patientId}`);
                        const [pendingLabOrders] = await connection.execute(
                            `SELECT lo.orderId, lo.orderNumber, lo.patientId, lo.status
                             FROM lab_test_orders lo
                             INNER JOIN invoice_items ii ON ii.description LIKE CONCAT('%Lab Test:%')
                             INNER JOIN invoices i ON i.invoiceId = ii.invoiceId
                             WHERE i.invoiceId = ? AND lo.patientId = ? AND lo.status IN ('pending', 'awaiting_payment')
                             ORDER BY lo.orderDate DESC
                             LIMIT 1`,
                            [id, invoice.patientId]
                        );

                        if (pendingLabOrders.length > 0) {
                            labOrder = pendingLabOrders[0];
                            labOrderNumber = labOrder.orderNumber;
                            console.log(`[LABORATORY QUEUE] Found lab order via fallback: ${labOrderNumber} for patient ${labOrder.patientId}`);
                        } else {
                            // Last resort: Find any pending lab order for this patient
                            const [anyPending] = await connection.execute(
                                `SELECT orderId, orderNumber, patientId, status
                                 FROM lab_test_orders
                                 WHERE patientId = ? AND status IN ('pending', 'awaiting_payment')
                                 ORDER BY orderDate DESC
                                 LIMIT 1`,
                                [invoice.patientId]
                            );

                            if (anyPending.length > 0) {
                                labOrder = anyPending[0];
                                labOrderNumber = labOrder.orderNumber;
                                console.log(`[LABORATORY QUEUE] Found pending lab order via last resort: ${labOrderNumber} for patient ${labOrder.patientId}`);
                            }
                        }
                    }

                    if (labOrder && (labOrder.status === 'pending' || labOrder.status === 'awaiting_payment')) {
                        // Check if laboratory queue entry already exists for this patient
                        const [existingQueue] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'laboratory'
                             AND status NOT IN ('completed', 'cancelled')`,
                            [labOrder.patientId]
                        );

                        if (existingQueue.length === 0) {
                            // Generate ticket number for laboratory queue
                            const [labCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "laboratory"'
                            );
                            const labTicketNum = labCount[0].count + 1;
                            const labTicketNumber = `LAB-${String(labTicketNum).padStart(3, '0')}`;

                            // Create laboratory queue entry
                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, 'laboratory', 'normal', 'waiting', ?, ?)`,
                                [
                                    labOrder.patientId,
                                    labTicketNumber,
                                    labOrderNumber ? `Lab Order: ${labOrderNumber}` : `Invoice: ${invoice.invoiceNumber}`,
                                    userId || null
                                ]
                            );
                            console.log(`[LABORATORY QUEUE] Successfully created laboratory queue entry for patient ${labOrder.patientId} with ticket ${labTicketNumber}`);
                            await connection.execute(
                                `UPDATE lab_test_orders SET status = 'pending' WHERE orderNumber = ? AND status = 'awaiting_payment'`,
                                [labOrderNumber || labOrder.orderNumber]
                            );
                        } else {
                            console.log(`[LABORATORY QUEUE] Patient ${labOrder.patientId} already exists in laboratory queue (queueId: ${existingQueue[0].queueId})`);
                            await connection.execute(
                                `UPDATE lab_test_orders SET status = 'pending' WHERE orderNumber = ? AND status = 'awaiting_payment'`,
                                [labOrderNumber || labOrder.orderNumber]
                            );
                        }
                    } else if (labOrder) {
                        console.log(`[LABORATORY QUEUE] Lab order ${labOrderNumber || labOrder.orderId} wrong status for queue (status: ${labOrder.status}) - skipping`);
                    } else {
                        console.log(`[LABORATORY QUEUE] No pending lab order found for patient ${invoice.patientId} - cannot create laboratory queue entry`);
                    }
                } catch (laboratoryQueueError) {
                    console.error('[LABORATORY QUEUE] Error creating laboratory queue entry:', laboratoryQueueError);
                    console.error('[LABORATORY QUEUE] Error stack:', laboratoryQueueError.stack);
                    // Don't fail the payment if laboratory queue creation fails
                }
            }

            // Radiology invoice paid → radiology queue (patient ready for imaging)
            if (invoice.notes && String(invoice.notes).includes('Radiology payment - Order:')) {
                try {
                    const radOrderMatch = invoice.notes.match(/Order:\s*([A-Z0-9-]+)/i);
                    let radOrderNumber = null;
                    let radOrder = null;

                    if (radOrderMatch && radOrderMatch[1]) {
                        radOrderNumber = radOrderMatch[1].trim();
                        console.log(`[RADIOLOGY QUEUE] Extracted radiology order number from invoice notes: ${radOrderNumber}`);

                        const [radOrders] = await connection.execute(
                            'SELECT orderId, orderNumber, patientId, status, priority FROM radiology_exam_orders WHERE orderNumber = ?',
                            [radOrderNumber]
                        );

                        if (radOrders.length > 0) {
                            radOrder = radOrders[0];
                            console.log(`[RADIOLOGY QUEUE] Found radiology order ${radOrderNumber} for patient ${radOrder.patientId}, status: ${radOrder.status}`);
                        }
                    }

                    if (!radOrder) {
                        const [pendingRad] = await connection.execute(
                            `SELECT ro.orderId, ro.orderNumber, ro.patientId, ro.status, ro.priority
                             FROM radiology_exam_orders ro
                             INNER JOIN invoice_items ii ON ii.description LIKE CONCAT('%Radiology Exam:%')
                             INNER JOIN invoices i ON i.invoiceId = ii.invoiceId
                             WHERE i.invoiceId = ? AND ro.patientId = ? AND ro.status IN ('pending', 'awaiting_payment')
                             ORDER BY ro.orderDate DESC
                             LIMIT 1`,
                            [id, invoice.patientId]
                        );
                        if (pendingRad.length > 0) {
                            radOrder = pendingRad[0];
                            radOrderNumber = radOrder.orderNumber;
                            console.log(`[RADIOLOGY QUEUE] Found radiology order via fallback: ${radOrderNumber}`);
                        } else {
                            const [anyPending] = await connection.execute(
                                `SELECT orderId, orderNumber, patientId, status, priority
                                 FROM radiology_exam_orders
                                 WHERE patientId = ? AND status IN ('pending', 'awaiting_payment')
                                 ORDER BY orderDate DESC
                                 LIMIT 1`,
                                [invoice.patientId]
                            );
                            if (anyPending.length > 0) {
                                radOrder = anyPending[0];
                                radOrderNumber = radOrder.orderNumber;
                                console.log(`[RADIOLOGY QUEUE] Found radiology order via last resort: ${radOrderNumber}`);
                            }
                        }
                    }

                    if (radOrder && (radOrder.status === 'pending' || radOrder.status === 'awaiting_payment')) {
                        const [existingRadQ] = await connection.execute(
                            `SELECT queueId FROM queue_entries
                             WHERE patientId = ? AND servicePoint = 'radiology'
                             AND status NOT IN ('completed', 'cancelled')`,
                            [radOrder.patientId]
                        );

                        if (existingRadQ.length === 0) {
                            const [radCount] = await connection.execute(
                                'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "radiology"'
                            );
                            const radTicketNum = (radCount[0]?.count || 0) + 1;
                            const radTicketNumber = `RX-${String(radTicketNum).padStart(3, '0')}`;
                            const radQueuePriority =
                                radOrder.priority === 'stat' || radOrder.priority === 'urgent' ? 'urgent' : 'normal';

                            await connection.execute(
                                `INSERT INTO queue_entries
                                (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                VALUES (?, ?, 'radiology', ?, 'waiting', ?, ?)`,
                                [
                                    radOrder.patientId,
                                    radTicketNumber,
                                    radQueuePriority,
                                    radOrderNumber ? `Radiology Order: ${radOrderNumber}` : `Invoice: ${invoice.invoiceNumber}`,
                                    userId || null
                                ]
                            );
                            console.log(`[RADIOLOGY QUEUE] Successfully created radiology queue entry for patient ${radOrder.patientId} with ticket ${radTicketNumber}`);
                            await connection.execute(
                                `UPDATE radiology_exam_orders SET status = 'pending' WHERE orderNumber = ? AND status = 'awaiting_payment'`,
                                [radOrderNumber || radOrder.orderNumber]
                            );
                        } else {
                            console.log(`[RADIOLOGY QUEUE] Patient ${radOrder.patientId} already in radiology queue (queueId: ${existingRadQ[0].queueId})`);
                            await connection.execute(
                                `UPDATE radiology_exam_orders SET status = 'pending' WHERE orderNumber = ? AND status = 'awaiting_payment'`,
                                [radOrderNumber || radOrder.orderNumber]
                            );
                        }
                    } else if (radOrder) {
                        console.log(`[RADIOLOGY QUEUE] Radiology order ${radOrderNumber || radOrder.orderId} wrong status for queue (status: ${radOrder.status}) - skipping`);
                    } else {
                        console.log(`[RADIOLOGY QUEUE] No radiology order found for patient ${invoice.patientId} - cannot create radiology queue entry`);
                    }
                } catch (radiologyQueueError) {
                    console.error('[RADIOLOGY QUEUE] Error creating radiology queue entry:', radiologyQueueError);
                    console.error('[RADIOLOGY QUEUE] Error stack:', radiologyQueueError.stack);
                }
            }

            // Procedure invoice paid → procedure queue (patient ready for procedure)
            if (invoice.notes && String(invoice.notes).includes('Procedure payment')) {
                try {
                    const [existingProcQ] = await connection.execute(
                        `SELECT queueId FROM queue_entries
                         WHERE patientId = ? AND servicePoint = 'procedure'
                         AND status NOT IN ('completed', 'cancelled')`,
                        [invoice.patientId]
                    );
                    if (existingProcQ.length === 0) {
                        const [procCount] = await connection.execute(
                            'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "procedure"'
                        );
                        const procTicketNum = (procCount[0]?.count || 0) + 1;
                        const procTicket = `PR-${String(procTicketNum).padStart(3, '0')}`;
                        const procNotes = invoice.notes.length > 500 ? `${String(invoice.notes).slice(0, 497)}...` : invoice.notes;
                        await connection.execute(
                            `INSERT INTO queue_entries
                            (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                            VALUES (?, ?, 'procedure', 'normal', 'waiting', ?, ?)`,
                            [invoice.patientId, procTicket, `Paid — ${procNotes}`, userId || null]
                        );
                        console.log(`[PROCEDURE QUEUE] Created procedure queue for patient ${invoice.patientId} ticket ${procTicket}`);
                    }
                } catch (procedureQueueError) {
                    console.error('[PROCEDURE QUEUE] Error:', procedureQueueError);
                }
            }

            // Check if it's a consultation fee invoice from triage - create consultation queue entry
            if (invoice.notes && invoice.notes.includes('Consultation charge from triage')) {
                try {
                    // Extract triage number from notes (format: "Consultation charge from triage TRI-XXXXXX")
                    const triageMatch = invoice.notes.match(/triage\s+([A-Z0-9-]+)/i);
                    if (triageMatch && triageMatch[1]) {
                        const triageNumber = triageMatch[1].trim();

                        // Find the triage assessment to get assigned doctor and priority
                        const [triageAssessments] = await connection.execute(
                            `SELECT triageId, patientId, assignedToDoctorId, assignedToDepartment,
                             triageCategory, triagedBy
                             FROM triage_assessments
                             WHERE triageNumber = ?`,
                            [triageNumber]
                        );

                        if (triageAssessments.length > 0) {
                            const triage = triageAssessments[0];

                            // Determine queue priority based on triage category
                            let queuePriority = 'normal';
                            if (triage.triageCategory === 'red') queuePriority = 'emergency';
                            else if (triage.triageCategory === 'yellow') queuePriority = 'urgent';

                            // Check if consultation queue entry already exists for this patient today
                            const [existingConsultation] = await connection.execute(
                                `SELECT queueId FROM queue_entries
                                 WHERE patientId = ? AND servicePoint = 'consultation'
                                 AND DATE(arrivalTime) = CURDATE()
                                 AND status NOT IN ('completed', 'cancelled')`,
                                [triage.patientId]
                            );

                            if (existingConsultation.length === 0) {
                                // Generate ticket number for consultation queue
                                const [consultationCount] = await connection.execute(
                                    'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "consultation"'
                                );
                                const consultationTicketNum = consultationCount[0].count + 1;
                                const consultationTicketNumber = `CON-${String(consultationTicketNum).padStart(3, '0')}`;

                                // Create consultation queue entry
                                await connection.execute(
                                    `INSERT INTO queue_entries
                                    (patientId, doctorId, ticketNumber, servicePoint, priority, status, notes, createdBy)
                                    VALUES (?, ?, ?, 'consultation', ?, 'waiting', ?, ?)`,
                                    [
                                        triage.patientId,
                                        triage.assignedToDoctorId || null,
                                        consultationTicketNumber,
                                        queuePriority,
                                        `Triage: ${triageNumber}${triage.assignedToDepartment ? ` - ${triage.assignedToDepartment}` : ''}`,
                                        userId || triage.triagedBy || null
                                    ]
                                );
                            }
                        }
                    }
                } catch (consultationQueueError) {
                    console.error('Error creating consultation queue entry:', consultationQueueError);
                    // Don't fail the payment if consultation queue creation fails
                }
            }
        }

        // Check if all pending invoices for this patient are now paid
        // If so, automatically complete cashier queue entries for this patient
        try {
            // Get all invoices for this patient (excluding draft and cancelled)
            // Only consider invoices that require payment (pending or partial status, or balance > 0)
            const [allPatientInvoices] = await connection.execute(
                `SELECT invoiceId, invoiceNumber, status, balance, totalAmount, paidAmount
                 FROM invoices
                 WHERE patientId = ?
                   AND status NOT IN ('draft', 'cancelled')`,
                [invoice.patientId]
            );

            // Check if all invoices are fully paid (status = 'paid' OR balance <= 0)
            let allInvoicesPaid = false;
            if (allPatientInvoices.length > 0) {
                // Check if every invoice is either:
                // 1. Status is 'paid', OR
                // 2. Balance is 0 or negative (fully paid)
                allInvoicesPaid = allPatientInvoices.every((inv) => {
                    const balance = parseFloat(inv.balance || 0);
                    const status = (inv.status || '').toLowerCase();
                    // Invoice is considered paid if status is 'paid' OR balance is 0 or less
                    return status === 'paid' || balance <= 0;
                });
            }

            // Only complete cashier queue if there were invoices and all are paid
            // (If no invoices, don't complete queue - might have been added for other reason)
            if (allPatientInvoices.length > 0 && allInvoicesPaid) {
                // Find all active cashier queue entries for this patient
                const [cashierQueues] = await connection.execute(
                    `SELECT queueId, ticketNumber, status
                     FROM queue_entries
                     WHERE patientId = ?
                       AND servicePoint = 'cashier'
                       AND status NOT IN ('completed', 'cancelled')`,
                    [invoice.patientId]
                );

                // Complete all cashier queue entries for this patient
                if (cashierQueues.length > 0) {
                    for (const queueEntry of cashierQueues) {
                        try {
                            await connection.execute(
                                `UPDATE queue_entries
                                 SET status = 'completed', endTime = NOW(), updatedAt = NOW()
                                 WHERE queueId = ?`,
                                [queueEntry.queueId]
                            );
                            console.log(`✅ Automatically completed cashier queue entry ${queueEntry.queueId} (ticket: ${queueEntry.ticketNumber}) for patient ${invoice.patientId} - all ${allPatientInvoices.length} invoice(s) paid`);
                        } catch (queueError) {
                            console.error(`Error completing cashier queue entry ${queueEntry.queueId}:`, queueError);
                            // Continue with other queue entries even if one fails
                        }
                    }
                }
            }
        } catch (queueCheckError) {
            console.error('Error checking and completing cashier queue after payment:', queueCheckError);
            // Don't fail the payment if queue check/completion fails - payment is already recorded
        }

        await connection.commit();

        // Get updated invoice
        const [updated] = await connection.execute(
            `SELECT i.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    p.patientNumber, p.phone as patientPhone
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.invoiceId = ?`,
            [id]
        );

        const [items] = await connection.execute(
            `SELECT ii.*, sc.name as chargeName, sc.chargeCode
             FROM invoice_items ii
             LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
             WHERE ii.invoiceId = ?
             ORDER BY ii.itemId`,
            [id]
        );

        if (invoice.patientId) {
            notifyPaymentReceived(invoice.patientId, {
                amount: paymentAmount,
                invoiceNumber: updated[0]?.invoiceNumber || invoice.invoiceNumber,
                balance: outstanding,
                paymentMethod: paymentMethod || invoice.paymentMethod,
            });
        }

        res.status(200).json({
            ...updated[0],
            items: items
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error recording payment:', error);
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route GET /api/billing/patients/:patientId/payments
 * @description Get all payments for a patient, grouped by batch receipt number
 */
router.get('/patients/:patientId/payments', async (req, res) => {
    try {
        const { patientId } = req.params;

        // Get all paid invoices for this patient
        const [invoices] = await pool.execute(`
            SELECT
                i.invoiceId,
                i.invoiceNumber,
                i.invoiceDate,
                i.totalAmount,
                i.paidAmount,
                i.paymentMethod,
                i.updatedAt,
                i.notes
            FROM invoices i
            WHERE i.patientId = ?
              AND i.status IN ('paid', 'partial')
              AND i.paidAmount > 0
            ORDER BY i.updatedAt DESC
        `, [patientId]);

        // Group invoices by batch receipt number
        const paymentBatches = new Map();
        const singlePayments = [];

        for (const invoice of invoices) {
            // Extract batch receipt number from notes
            const batchMatch = invoice.notes?.match(/Batch Receipt:\s*([A-Z0-9-]+)/);
            const batchReceiptNumber = batchMatch ? batchMatch[1] : null;

            if (batchReceiptNumber) {
                // Group by batch receipt number
                if (!paymentBatches.has(batchReceiptNumber)) {
                    // Extract payment date from updatedAt (when payment was made)
                    const paymentDate = invoice.updatedAt
                        ? (invoice.updatedAt instanceof Date
                            ? invoice.updatedAt.toISOString().split('T')[0]
                            : invoice.updatedAt.toString().split('T')[0])
                        : new Date().toISOString().split('T')[0];

                    paymentBatches.set(batchReceiptNumber, {
                        batchReceiptNumber,
                        paymentDate: paymentDate,
                        paymentMethod: invoice.paymentMethod || 'Cash',
                        invoices: [],
                        totalAmount: 0
                    });
                }
                const batch = paymentBatches.get(batchReceiptNumber);

                // Extract batch amount from notes
                let batchAmount = parseFloat(invoice.paidAmount || 0);
                const amountMatch = invoice.notes?.match(/Batch Amount:\s*([\d.]+)/);
                if (amountMatch) {
                    batchAmount = parseFloat(amountMatch[1]);
                }

                batch.invoices.push({
                    invoiceId: invoice.invoiceId,
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceDate: invoice.invoiceDate,
                    totalAmount: invoice.totalAmount,
                    amountPaid: batchAmount
                });
                batch.totalAmount += batchAmount;
            } else {
                // Single invoice payment (not part of a batch)
                // Extract payment date from updatedAt (when payment was made)
                const paymentDate = invoice.updatedAt
                    ? (invoice.updatedAt instanceof Date
                        ? invoice.updatedAt.toISOString().split('T')[0]
                        : invoice.updatedAt.toString().split('T')[0])
                    : new Date().toISOString().split('T')[0];

                singlePayments.push({
                    batchReceiptNumber: null,
                    paymentDate: paymentDate,
                    paymentMethod: invoice.paymentMethod || 'Cash',
                    invoices: [{
                        invoiceId: invoice.invoiceId,
                        invoiceNumber: invoice.invoiceNumber,
                        invoiceDate: invoice.invoiceDate,
                        totalAmount: invoice.totalAmount,
                        amountPaid: parseFloat(invoice.paidAmount || 0)
                    }],
                    totalAmount: parseFloat(invoice.paidAmount || 0)
                });
            }
        }

        // Combine batches and single payments, sort by date
        const allPayments = [
            ...Array.from(paymentBatches.values()),
            ...singlePayments
        ].sort((a, b) => {
            const dateA = new Date(a.paymentDate).getTime();
            const dateB = new Date(b.paymentDate).getTime();
            return dateB - dateA; // Most recent first
        });

        res.status(200).json(allPayments);
    } catch (error) {
        console.error('Error fetching patient payments:', error);
        res.status(500).json({ message: 'Error fetching patient payments', error: error.message });
    }
});

/**
 * @route GET /api/billing/payments
 * @description Get all payments across all patients, grouped by batch receipt number
 */
router.get('/payments', async (req, res) => {
    try {
        const { patientId, startDate, endDate } = req.query;

        // Get all paid invoices
        let query = `
            SELECT
                i.invoiceId,
                i.invoiceNumber,
                i.invoiceDate,
                i.totalAmount,
                i.paidAmount,
                i.paymentMethod,
                i.updatedAt,
                i.notes,
                i.patientId,
                p.firstName as patientFirstName,
                p.lastName as patientLastName,
                p.patientNumber
            FROM invoices i
            LEFT JOIN patients p ON i.patientId = p.patientId
            WHERE i.status IN ('paid', 'partial')
              AND i.paidAmount > 0
        `;
        const params = [];

        if (patientId) {
            query += ' AND i.patientId = ?';
            params.push(patientId);
        }

        if (startDate) {
            query += ' AND DATE(i.updatedAt) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND DATE(i.updatedAt) <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY i.updatedAt DESC';

        const [invoices] = await pool.execute(query, params);

        // Group invoices by batch receipt number
        const paymentBatches = new Map();
        const singlePayments = [];

        for (const invoice of invoices) {
            // Extract batch receipt number from notes
            const batchMatch = invoice.notes?.match(/Batch Receipt:\s*([A-Z0-9-]+)/);
            const batchReceiptNumber = batchMatch ? batchMatch[1] : null;

            if (batchReceiptNumber) {
                // Group by batch receipt number
                if (!paymentBatches.has(batchReceiptNumber)) {
                    // Extract payment date from updatedAt (when payment was made)
                    const paymentDate = invoice.updatedAt
                        ? (invoice.updatedAt instanceof Date
                            ? invoice.updatedAt.toISOString().split('T')[0]
                            : invoice.updatedAt.toString().split('T')[0])
                        : new Date().toISOString().split('T')[0];

                    paymentBatches.set(batchReceiptNumber, {
                        batchReceiptNumber,
                        paymentDate: paymentDate,
                        paymentMethod: invoice.paymentMethod || 'Cash',
                        patientId: invoice.patientId,
                        patientFirstName: invoice.patientFirstName,
                        patientLastName: invoice.patientLastName,
                        patientNumber: invoice.patientNumber,
                        invoices: [],
                        totalAmount: 0
                    });
                }
                const batch = paymentBatches.get(batchReceiptNumber);

                // Extract batch amount from notes
                let batchAmount = parseFloat(invoice.paidAmount || 0);
                const amountMatch = invoice.notes?.match(/Batch Amount:\s*([\d.]+)/);
                if (amountMatch) {
                    batchAmount = parseFloat(amountMatch[1]);
                }

                batch.invoices.push({
                    invoiceId: invoice.invoiceId,
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceDate: invoice.invoiceDate,
                    totalAmount: invoice.totalAmount,
                    amountPaid: batchAmount
                });
                batch.totalAmount += batchAmount;
            } else {
                // Single invoice payment (not part of a batch)
                // Extract payment date from updatedAt (when payment was made)
                const paymentDate = invoice.updatedAt
                    ? (invoice.updatedAt instanceof Date
                        ? invoice.updatedAt.toISOString().split('T')[0]
                        : invoice.updatedAt.toString().split('T')[0])
                    : new Date().toISOString().split('T')[0];

                singlePayments.push({
                    batchReceiptNumber: null,
                    paymentDate: paymentDate,
                    paymentMethod: invoice.paymentMethod || 'Cash',
                    patientId: invoice.patientId,
                    patientFirstName: invoice.patientFirstName,
                    patientLastName: invoice.patientLastName,
                    patientNumber: invoice.patientNumber,
                    invoices: [{
                        invoiceId: invoice.invoiceId,
                        invoiceNumber: invoice.invoiceNumber,
                        invoiceDate: invoice.invoiceDate,
                        totalAmount: invoice.totalAmount,
                        amountPaid: parseFloat(invoice.paidAmount || 0)
                    }],
                    totalAmount: parseFloat(invoice.paidAmount || 0)
                });
            }
        }

        // Combine batches and single payments, sort by date
        const allPayments = [
            ...Array.from(paymentBatches.values()),
            ...singlePayments
        ].sort((a, b) => {
            const dateA = new Date(a.paymentDate).getTime();
            const dateB = new Date(b.paymentDate).getTime();
            return dateB - dateA; // Most recent first
        });

        res.status(200).json(allPayments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Error fetching payments', error: error.message });
    }
});

/**
 * @route GET /api/billing/payment-batches/:batchReceiptNumber
 * @description Get payment batch receipt by batch receipt number
 */
router.get('/payment-batches/:batchReceiptNumber', async (req, res) => {
    try {
        const { batchReceiptNumber } = req.params;
        const { patientId } = req.query;

        // Find all invoices that were paid with this batch receipt number
        // The batch receipt number is stored in the invoice notes
        let query = `
            SELECT DISTINCT
                i.invoiceId,
                i.invoiceNumber,
                i.invoiceDate,
                i.totalAmount,
                i.paidAmount,
                i.paymentMethod,
                i.updatedAt,
                p.patientId,
                p.firstName as patientFirstName,
                p.lastName as patientLastName,
                p.patientNumber
            FROM invoices i
            INNER JOIN patients p ON i.patientId = p.patientId
            WHERE i.notes LIKE ?
        `;
        const params = [`%Batch Receipt: ${batchReceiptNumber}%`];

        if (patientId) {
            query += ' AND i.patientId = ?';
            params.push(patientId);
        }

        query += ' ORDER BY i.invoiceDate DESC, i.invoiceNumber';

        const [invoices] = await pool.execute(query, params);

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Payment batch not found' });
        }

        // Get payment details from the first invoice (they should all have the same payment method/date)
        const firstInvoice = invoices[0];
        // Extract payment date from updatedAt (when payment was made)
        const paymentDate = firstInvoice.updatedAt
            ? (firstInvoice.updatedAt instanceof Date
                ? firstInvoice.updatedAt.toISOString().split('T')[0]
                : firstInvoice.updatedAt.toString().split('T')[0])
            : new Date().toISOString().split('T')[0];

        // Extract reference number from notes if available
        // Look for reference number in the notes or use batch receipt number
        const referenceNumber = batchReceiptNumber;

        // Get invoice items for each invoice
        const invoicesWithItems = await Promise.all(invoices.map(async (inv) => {
            const [items] = await pool.execute(
                `SELECT
                    ii.*,
                    sc.name as chargeName,
                    sc.chargeCode,
                    m.name as medicationName
                 FROM invoice_items ii
                 LEFT JOIN service_charges sc ON ii.chargeId = sc.chargeId
                 LEFT JOIN drug_inventory di ON ii.drugInventoryId = di.drugInventoryId
                 LEFT JOIN medications m ON di.medicationId = m.medicationId
                 WHERE ii.invoiceId = ?
                 ORDER BY ii.itemId`,
                [inv.invoiceId]
            );

            // Update description for prescription items to use actual medication name
            const updatedItems = items.map((item) => {
                if (item.description && item.description.includes('Prescription Item:') && item.medicationName) {
                    const currentName = item.description.replace('Prescription Item: ', '').trim();
                    if (currentName === 'Unknown' || !currentName || currentName === '') {
                        return {
                            ...item,
                            description: `Prescription Item: ${item.medicationName}`
                        };
                    }
                }
                return item;
            });

            // Extract batch amount from notes if available
            let batchAmount = parseFloat(inv.paidAmount || 0);
            if (inv.notes) {
                const batchAmountMatch = inv.notes.match(/Batch Amount:\s*([\d.]+)/);
                if (batchAmountMatch) {
                    batchAmount = parseFloat(batchAmountMatch[1]);
                }
            }

            return {
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                totalAmount: inv.totalAmount,
                amountPaid: batchAmount,
                items: updatedItems
            };
        }));

        res.status(200).json({
            batchReceiptNumber,
            paymentDate,
            paymentMethod: firstInvoice.paymentMethod || 'Cash',
            referenceNumber,
            patientId: firstInvoice.patientId,
            patientName: `${firstInvoice.patientFirstName} ${firstInvoice.patientLastName}`,
            patientNumber: firstInvoice.patientNumber,
            invoices: invoicesWithItems,
            totalAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount || 0), 0)
        });
    } catch (error) {
        console.error('Error fetching payment batch:', error);
        res.status(500).json({ message: 'Error fetching payment batch', error: error.message });
    }
});

/**
 * @route GET /api/billing/invoices/:id/payments
 * @description Get payment history for an invoice
 */
router.get('/invoices/:id/payments', async (req, res) => {
    try {
        const { id } = req.params;

        // Get payments from payments table if it exists
        const [payments] = await pool.execute(`
            SELECT
                p.paymentId,
                p.paymentNumber,
                p.paymentDate,
                p.amount,
                p.referenceNumber,
                p.notes,
                pm.methodName as paymentMethod,
                CONCAT(u.firstName, ' ', u.lastName) as receivedBy
            FROM payments p
            LEFT JOIN payment_methods pm ON p.paymentMethodId = pm.methodId
            LEFT JOIN users u ON p.receivedBy = u.userId
            WHERE p.invoiceId = ?
            ORDER BY p.paymentDate DESC, p.createdAt DESC
        `, [id]).catch(async () => {
            // If payments table doesn't exist or query fails, return empty array
            // In this case, payment info is stored in the invoice itself
            return [[], []];
        });

        // If no payments found in payments table, check if invoice has payment info
        if (payments.length === 0) {
            const [invoice] = await pool.execute(
                'SELECT paidAmount, paymentMethod, paymentDate, updatedAt FROM invoices WHERE invoiceId = ?',
                [id]
            );

            if (invoice.length > 0 && parseFloat(invoice[0].paidAmount || 0) > 0) {
                // Return a single payment record based on invoice data
                return res.status(200).json([{
                    paymentId: null,
                    paymentNumber: invoice[0].invoiceNumber || `PAY-${id}`,
                    paymentDate: invoice[0].paymentDate || invoice[0].updatedAt,
                    amount: invoice[0].paidAmount,
                    referenceNumber: null,
                    notes: null,
                    paymentMethod: invoice[0].paymentMethod || 'Cash',
                    receivedBy: null
                }]);
            }
        }

        res.status(200).json(payments);
    } catch (error) {
        console.error('Error fetching invoice payments:', error);
        res.status(500).json({ message: 'Error fetching invoice payments', error: error.message });
    }
});

/**
 * @route GET /api/billing/invoices/stats/summary
 * @description Get summary statistics for invoices
 */
router.get('/invoices/stats/summary', async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT
                COUNT(*) as totalInvoices,
                SUM(CASE WHEN status = 'pending' THEN totalAmount ELSE 0 END) as pendingAmount,
                SUM(CASE WHEN status = 'paid' THEN totalAmount ELSE 0 END) as paidAmount,
                SUM(CASE WHEN status = 'partial' THEN balance ELSE 0 END) as partialAmount,
                SUM(CASE WHEN status = 'pending' AND dueDate IS NOT NULL AND dueDate < CURDATE() THEN balance ELSE 0 END) as overdueAmount,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount,
                COUNT(CASE WHEN status = 'paid' THEN 1 END) as paidCount,
                SUM(CASE WHEN status = 'paid' AND MONTH(invoiceDate) = MONTH(CURDATE()) AND YEAR(invoiceDate) = YEAR(CURDATE()) THEN totalAmount ELSE 0 END) as paidThisMonthAmount,
                COUNT(CASE WHEN status = 'paid' AND MONTH(invoiceDate) = MONTH(CURDATE()) AND YEAR(invoiceDate) = YEAR(CURDATE()) THEN 1 END) as paidThisMonthCount
            FROM invoices
            WHERE status != 'cancelled'
        `);

        res.status(200).json(stats[0] || {
            totalInvoices: 0,
            pendingAmount: 0,
            paidAmount: 0,
            partialAmount: 0,
            overdueAmount: 0,
            pendingCount: 0,
            paidCount: 0,
            paidThisMonthAmount: 0,
            paidThisMonthCount: 0,
        });
    } catch (error) {
        console.error('Error fetching invoice stats:', error);
        res.status(500).json({ message: 'Error fetching invoice stats', error: error.message });
    }
});

// Mobile Payment Logs Routes
/**
 * @route GET /api/billing/mobile-payment-logs
 * @description Get all mobile payment logs (optionally filtered)
 */
router.get('/mobile-payment-logs', async (req, res) => {
    try {
        const { search, mobileProvider, startDate, endDate, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
            SELECT mpl.*,
                   u.firstName as createdByFirstName,
                   u.lastName as createdByLastName
            FROM mobile_payment_logs mpl
            LEFT JOIN users u ON mpl.createdBy = u.userId
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (mpl.name LIKE ? OR mpl.refNo LIKE ? OR mpl.phoneNumber LIKE ? OR mpl.accountNumber LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (mobileProvider) {
            query += ` AND mpl.mobileProvider = ?`;
            params.push(mobileProvider);
        }

        if (startDate) {
            query += ` AND DATE(mpl.transactionDate) >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND DATE(mpl.transactionDate) <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY mpl.transactionDate DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [rows] = await pool.execute(query, params);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) as total FROM mobile_payment_logs mpl WHERE 1=1`;
        const countParams = [];

        if (search) {
            countQuery += ` AND (mpl.name LIKE ? OR mpl.refNo LIKE ? OR mpl.phoneNumber LIKE ? OR mpl.accountNumber LIKE ?)`;
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (mobileProvider) {
            countQuery += ` AND mpl.mobileProvider = ?`;
            countParams.push(mobileProvider);
        }

        if (startDate) {
            countQuery += ` AND DATE(mpl.transactionDate) >= ?`;
            countParams.push(startDate);
        }

        if (endDate) {
            countQuery += ` AND DATE(mpl.transactionDate) <= ?`;
            countParams.push(endDate);
        }

        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0].total;

        res.status(200).json({
            data: rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching mobile payment logs:', error);
        res.status(500).json({ message: 'Error fetching mobile payment logs', error: error.message });
    }
});

/**
 * @route GET /api/billing/mobile-payment-logs/:id
 * @description Get a single mobile payment log by ID
 */
router.get('/mobile-payment-logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(
            `SELECT mpl.*,
                    u.firstName as createdByFirstName,
                    u.lastName as createdByLastName
             FROM mobile_payment_logs mpl
             LEFT JOIN users u ON mpl.createdBy = u.userId
             WHERE mpl.logId = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Mobile payment log not found' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching mobile payment log:', error);
        res.status(500).json({ message: 'Error fetching mobile payment log', error: error.message });
    }
});

/**
 * @route POST /api/billing/mobile-payment-logs
 * @description Create a new mobile payment log
 */
router.post('/mobile-payment-logs', async (req, res) => {
    try {
        const { name, amount, refNo, phoneNumber, mobileProvider, accountNumber, transactionDate, notes } = req.body;
        const userId = req.user?.id;

        if (!name || !amount || !refNo || !phoneNumber || !mobileProvider || !transactionDate) {
            return res.status(400).json({ error: 'Name, amount, refNo, phoneNumber, mobileProvider, and transactionDate are required' });
        }

        // Check if refNo already exists
        const [existing] = await pool.execute(
            'SELECT logId FROM mobile_payment_logs WHERE refNo = ?',
            [refNo]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Reference number already exists' });
        }

        const [result] = await pool.execute(
            `INSERT INTO mobile_payment_logs
             (name, amount, refNo, phoneNumber, mobileProvider, accountNumber, transactionDate, notes, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                parseFloat(amount),
                refNo,
                phoneNumber,
                mobileProvider,
                accountNumber || null,
                transactionDate,
                notes || null,
                userId || null
            ]
        );

        const [newLog] = await pool.execute(
            `SELECT mpl.*,
                    u.firstName as createdByFirstName,
                    u.lastName as createdByLastName
             FROM mobile_payment_logs mpl
             LEFT JOIN users u ON mpl.createdBy = u.userId
             WHERE mpl.logId = ?`,
            [result.insertId]
        );

        res.status(201).json(newLog[0]);
    } catch (error) {
        console.error('Error creating mobile payment log:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Reference number already exists' });
        }
        res.status(500).json({ message: 'Error creating mobile payment log', error: error.message });
    }
});

/**
 * @route PUT /api/billing/mobile-payment-logs/:id
 * @description Update a mobile payment log
 */
router.put('/mobile-payment-logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, refNo, phoneNumber, mobileProvider, accountNumber, transactionDate, notes } = req.body;

        // Check if log exists
        const [existing] = await pool.execute(
            'SELECT logId FROM mobile_payment_logs WHERE logId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Mobile payment log not found' });
        }

        // Check if refNo already exists (excluding current record)
        if (refNo) {
            const [refCheck] = await pool.execute(
                'SELECT logId FROM mobile_payment_logs WHERE refNo = ? AND logId != ?',
                [refNo, id]
            );

            if (refCheck.length > 0) {
                return res.status(400).json({ error: 'Reference number already exists' });
            }
        }

        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (amount !== undefined) { updates.push('amount = ?'); values.push(parseFloat(amount)); }
        if (refNo !== undefined) { updates.push('refNo = ?'); values.push(refNo); }
        if (phoneNumber !== undefined) { updates.push('phoneNumber = ?'); values.push(phoneNumber); }
        if (mobileProvider !== undefined) { updates.push('mobileProvider = ?'); values.push(mobileProvider); }
        if (accountNumber !== undefined) { updates.push('accountNumber = ?'); values.push(accountNumber || null); }
        if (transactionDate !== undefined) { updates.push('transactionDate = ?'); values.push(transactionDate); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        await pool.execute(
            `UPDATE mobile_payment_logs SET ${updates.join(', ')}, updatedAt = NOW() WHERE logId = ?`,
            values
        );

        const [updated] = await pool.execute(
            `SELECT mpl.*,
                    u.firstName as createdByFirstName,
                    u.lastName as createdByLastName
             FROM mobile_payment_logs mpl
             LEFT JOIN users u ON mpl.createdBy = u.userId
             WHERE mpl.logId = ?`,
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating mobile payment log:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Reference number already exists' });
        }
        res.status(500).json({ message: 'Error updating mobile payment log', error: error.message });
    }
});

/**
 * @route DELETE /api/billing/mobile-payment-logs/:id
 * @description Delete a mobile payment log
 */
router.delete('/mobile-payment-logs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if log exists
        const [existing] = await pool.execute(
            'SELECT logId FROM mobile_payment_logs WHERE logId = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Mobile payment log not found' });
        }

        await pool.execute('DELETE FROM mobile_payment_logs WHERE logId = ?', [id]);

        res.status(200).json({
            message: 'Mobile payment log deleted successfully',
            logId: id
        });
    } catch (error) {
        console.error('Error deleting mobile payment log:', error);
        res.status(500).json({ message: 'Error deleting mobile payment log', error: error.message });
    }
});

// Specialist Charges Routes
/**
 * @route GET /api/billing/specialist-charges
 * @description Get all specialist charges (optionally filtered)
 */
router.get('/specialist-charges', async (req, res) => {
    try {
        const { chargeId, doctorId, search } = req.query;
        let query = `
            SELECT sc.*,
                   ch.chargeCode, ch.name as chargeName,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName
            FROM specialist_charges sc
            LEFT JOIN service_charges ch ON sc.chargeId = ch.chargeId
            LEFT JOIN users u ON sc.doctorId = u.userId
            WHERE 1=1
        `;
        const params = [];

        if (chargeId) {
            query += ' AND sc.chargeId = ?';
            params.push(chargeId);
        }

        if (doctorId) {
            query += ' AND sc.doctorId = ?';
            params.push(doctorId);
        }

        if (search) {
            query += ' AND (ch.name LIKE ? OR u.firstName LIKE ? OR u.lastName LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ' ORDER BY sc.effectiveFrom DESC, sc.createdAt DESC';

        const [rows] = await pool.query(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching specialist charges:', error);
        res.status(500).json({ message: 'Error fetching specialist charges', error: error.message });
    }
});

/**
 * @route GET /api/billing/specialist-charges/:id
 * @description Get a single specialist charge by ID
 */
router.get('/specialist-charges/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT sc.*,
                   ch.chargeCode, ch.name as chargeName,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName
            FROM specialist_charges sc
            LEFT JOIN service_charges ch ON sc.chargeId = ch.chargeId
            LEFT JOIN users u ON sc.doctorId = u.userId
            WHERE sc.specialistChargeId = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Specialist charge not found' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching specialist charge:', error);
        res.status(500).json({ message: 'Error fetching specialist charge', error: error.message });
    }
});

/**
 * @route POST /api/billing/specialist-charges
 * @description Create a new specialist charge
 */
router.post('/specialist-charges', async (req, res) => {
    try {
        const { chargeId, doctorId, amount, effectiveFrom, effectiveTo } = req.body;

        if (!chargeId || !doctorId || !amount || !effectiveFrom) {
            return res.status(400).json({ error: 'Charge, doctor, amount, and effectiveFrom date are required' });
        }

        // Check if charge exists
        const [chargeCheck] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeId = ?', [chargeId]);
        if (chargeCheck.length === 0) {
            return res.status(400).json({ error: 'Service charge not found' });
        }

        // Check if doctor exists
        const [doctorCheck] = await pool.query('SELECT userId FROM users WHERE userId = ?', [doctorId]);
        if (doctorCheck.length === 0) {
            return res.status(400).json({ error: 'Doctor not found' });
        }

        const [result] = await pool.query(
            'INSERT INTO specialist_charges (chargeId, doctorId, amount, effectiveFrom, effectiveTo) VALUES (?, ?, ?, ?, ?)',
            [chargeId, doctorId, amount, effectiveFrom, effectiveTo || null]
        );

        const [newCharge] = await pool.query(`
            SELECT sc.*,
                   ch.chargeCode, ch.name as chargeName,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName
            FROM specialist_charges sc
            LEFT JOIN service_charges ch ON sc.chargeId = ch.chargeId
            LEFT JOIN users u ON sc.doctorId = u.userId
            WHERE sc.specialistChargeId = ?
        `, [result.insertId]);

        res.status(201).json(newCharge[0]);
    } catch (error) {
        console.error('Error creating specialist charge:', error);
        res.status(500).json({ message: 'Error creating specialist charge', error: error.message });
    }
});

/**
 * @route PUT /api/billing/specialist-charges/:id
 * @description Update a specialist charge
 */
router.put('/specialist-charges/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { chargeId, doctorId, amount, effectiveFrom, effectiveTo } = req.body;

        // Check if specialist charge exists
        const [existing] = await pool.query('SELECT specialistChargeId FROM specialist_charges WHERE specialistChargeId = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Specialist charge not found' });
        }

        // Check if charge exists (if being updated)
        if (chargeId) {
            const [chargeCheck] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeId = ?', [chargeId]);
            if (chargeCheck.length === 0) {
                return res.status(400).json({ error: 'Service charge not found' });
            }
        }

        // Check if doctor exists (if being updated)
        if (doctorId) {
            const [doctorCheck] = await pool.query('SELECT userId FROM users WHERE userId = ?', [doctorId]);
            if (doctorCheck.length === 0) {
                return res.status(400).json({ error: 'Doctor not found' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (chargeId !== undefined) { updates.push('chargeId = ?'); values.push(chargeId); }
        if (doctorId !== undefined) { updates.push('doctorId = ?'); values.push(doctorId); }
        if (amount !== undefined) { updates.push('amount = ?'); values.push(amount); }
        if (effectiveFrom !== undefined) { updates.push('effectiveFrom = ?'); values.push(effectiveFrom); }
        if (effectiveTo !== undefined) { updates.push('effectiveTo = ?'); values.push(effectiveTo || null); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        await pool.query(
            `UPDATE specialist_charges SET ${updates.join(', ')}, updatedAt = NOW() WHERE specialistChargeId = ?`,
            values
        );

        const [updated] = await pool.query(`
            SELECT sc.*,
                   ch.chargeCode, ch.name as chargeName,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName
            FROM specialist_charges sc
            LEFT JOIN service_charges ch ON sc.chargeId = ch.chargeId
            LEFT JOIN users u ON sc.doctorId = u.userId
            WHERE sc.specialistChargeId = ?
        `, [id]);

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating specialist charge:', error);
        res.status(500).json({ message: 'Error updating specialist charge', error: error.message });
    }
});

/**
 * @route DELETE /api/billing/specialist-charges/:id
 * @description Delete a specialist charge
 */
router.delete('/specialist-charges/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query('DELETE FROM specialist_charges WHERE specialistChargeId = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Specialist charge not found' });
        }

        res.status(200).json({ message: 'Specialist charge deleted successfully' });
    } catch (error) {
        console.error('Error deleting specialist charge:', error);
        res.status(500).json({ message: 'Error deleting specialist charge', error: error.message });
    }
});

// Consumables Charges Routes
/**
 * @route GET /api/billing/consumables-charges
 * @description Get all consumables charges (optionally filtered)
 */
router.get('/consumables-charges', async (req, res) => {
    try {
        const { chargeId, search } = req.query;
        let query = `
            SELECT cc.*,
                   ch.chargeCode, ch.name as chargeName
            FROM consumables_charges cc
            LEFT JOIN service_charges ch ON cc.chargeId = ch.chargeId
            WHERE 1=1
        `;
        const params = [];

        if (chargeId) {
            query += ' AND cc.chargeId = ?';
            params.push(chargeId);
        }

        if (search) {
            query += ' AND (ch.name LIKE ? OR ch.chargeCode LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        query += ' ORDER BY cc.effectiveFrom DESC, cc.createdAt DESC';

        const [rows] = await pool.query(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching consumables charges:', error);
        res.status(500).json({ message: 'Error fetching consumables charges', error: error.message });
    }
});

/**
 * @route GET /api/billing/consumables-charges/:id
 * @description Get a single consumables charge by ID
 */
router.get('/consumables-charges/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT cc.*,
                   ch.chargeCode, ch.name as chargeName
            FROM consumables_charges cc
            LEFT JOIN service_charges ch ON cc.chargeId = ch.chargeId
            WHERE cc.consumableChargeId = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Consumables charge not found' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching consumables charge:', error);
        res.status(500).json({ message: 'Error fetching consumables charge', error: error.message });
    }
});

/**
 * @route POST /api/billing/consumables-charges
 * @description Create a new consumables charge
 */
router.post('/consumables-charges', async (req, res) => {
    try {
        const { chargeId, amount, effectiveFrom, effectiveTo } = req.body;

        if (!chargeId || !amount || !effectiveFrom) {
            return res.status(400).json({ error: 'Charge, amount, and effectiveFrom date are required' });
        }

        // Check if charge exists
        const [chargeCheck] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeId = ?', [chargeId]);
        if (chargeCheck.length === 0) {
            return res.status(400).json({ error: 'Service charge not found' });
        }

        const [result] = await pool.query(
            'INSERT INTO consumables_charges (chargeId, amount, effectiveFrom, effectiveTo) VALUES (?, ?, ?, ?)',
            [chargeId, amount, effectiveFrom, effectiveTo || null]
        );

        const [newCharge] = await pool.query(`
            SELECT cc.*,
                   ch.chargeCode, ch.name as chargeName
            FROM consumables_charges cc
            LEFT JOIN service_charges ch ON cc.chargeId = ch.chargeId
            WHERE cc.consumableChargeId = ?
        `, [result.insertId]);

        res.status(201).json(newCharge[0]);
    } catch (error) {
        console.error('Error creating consumables charge:', error);
        res.status(500).json({ message: 'Error creating consumables charge', error: error.message });
    }
});

/**
 * @route PUT /api/billing/consumables-charges/:id
 * @description Update a consumables charge
 */
router.put('/consumables-charges/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { chargeId, amount, effectiveFrom, effectiveTo } = req.body;

        // Check if consumables charge exists
        const [existing] = await pool.query('SELECT consumableChargeId FROM consumables_charges WHERE consumableChargeId = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Consumables charge not found' });
        }

        // Check if charge exists (if being updated)
        if (chargeId) {
            const [chargeCheck] = await pool.query('SELECT chargeId FROM service_charges WHERE chargeId = ?', [chargeId]);
            if (chargeCheck.length === 0) {
                return res.status(400).json({ error: 'Service charge not found' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (chargeId !== undefined) { updates.push('chargeId = ?'); values.push(chargeId); }
        if (amount !== undefined) { updates.push('amount = ?'); values.push(amount); }
        if (effectiveFrom !== undefined) { updates.push('effectiveFrom = ?'); values.push(effectiveFrom); }
        if (effectiveTo !== undefined) { updates.push('effectiveTo = ?'); values.push(effectiveTo || null); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        await pool.query(
            `UPDATE consumables_charges SET ${updates.join(', ')}, updatedAt = NOW() WHERE consumableChargeId = ?`,
            values
        );

        const [updated] = await pool.query(`
            SELECT cc.*,
                   ch.chargeCode, ch.name as chargeName
            FROM consumables_charges cc
            LEFT JOIN service_charges ch ON cc.chargeId = ch.chargeId
            WHERE cc.consumableChargeId = ?
        `, [id]);

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating consumables charge:', error);
        res.status(500).json({ message: 'Error updating consumables charge', error: error.message });
    }
});

/**
 * @route DELETE /api/billing/consumables-charges/:id
 * @description Delete a consumables charge
 */
router.delete('/consumables-charges/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query('DELETE FROM consumables_charges WHERE consumableChargeId = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Consumables charge not found' });
        }

        res.status(200).json({ message: 'Consumables charge deleted successfully' });
    } catch (error) {
        console.error('Error deleting consumables charge:', error);
        res.status(500).json({ message: 'Error deleting consumables charge', error: error.message });
    }
});

// ============================================
// INSURANCE CLAIM INTEGRATION
// ============================================

/**
 * @route GET /api/billing/invoices/:id/insurance-info
 * @description Get insurance information for an invoice's patient
 */
router.get('/invoices/:id/insurance-info', async (req, res) => {
    try {
        const { id } = req.params;

        // Get invoice and patient info
        const [invoices] = await pool.execute(
            `SELECT i.*, p.patientId, p.patientType, p.insuranceCompanyId, p.insuranceNumber
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.invoiceId = ?`,
            [id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        // Check if patient has active insurance
        if (invoice.patientType !== 'insurance') {
            return res.status(200).json({
                hasInsurance: false,
                reason: 'Patient is not registered as insurance patient'
            });
        }

        // Get active insurance policy
        const [activeInsurance] = await pool.execute(
            `SELECT pi.*, ip.providerName, ip.providerCode, ip.providerId
             FROM patient_insurance pi
             LEFT JOIN insurance_providers ip ON pi.providerId = ip.providerId
             WHERE pi.patientId = ?
               AND pi.isActive = 1
               AND (pi.coverageEndDate IS NULL OR pi.coverageEndDate >= CURDATE())
             ORDER BY pi.coverageStartDate DESC
             LIMIT 1`,
            [invoice.patientId]
        );

        // Check if claim already exists for this invoice
        const [existingClaim] = await pool.execute(
            'SELECT claimId, claimNumber, status FROM insurance_claims WHERE invoiceId = ?',
            [id]
        );

        if (activeInsurance.length > 0) {
            res.status(200).json({
                hasInsurance: true,
                canCreateClaim: existingClaim.length === 0,
                patientInsurance: {
                    patientInsuranceId: activeInsurance[0].patientInsuranceId,
                    providerName: activeInsurance[0].providerName,
                    providerCode: activeInsurance[0].providerCode,
                    providerId: activeInsurance[0].providerId,
                    policyNumber: activeInsurance[0].policyNumber,
                    memberId: activeInsurance[0].memberId,
                    memberName: activeInsurance[0].memberName,
                    relationship: activeInsurance[0].relationship,
                    coverageStartDate: activeInsurance[0].coverageStartDate,
                    coverageEndDate: activeInsurance[0].coverageEndDate
                },
                existingClaim: existingClaim.length > 0 ? existingClaim[0] : null
            });
        } else {
            res.status(200).json({
                hasInsurance: false,
                canCreateClaim: false,
                reason: 'Patient is marked as insurance but no active insurance policy found. Please create an insurance policy for this patient.',
                patientInsuranceId: invoice.insuranceCompanyId ? {
                    providerId: invoice.insuranceCompanyId,
                    insuranceNumber: invoice.insuranceNumber
                } : null
            });
        }
    } catch (error) {
        console.error('Error fetching insurance info:', error);
        res.status(500).json({ message: 'Error fetching insurance info', error: error.message });
    }
});

/**
 * @route POST /api/billing/invoices/:id/create-claim
 * @description Create an insurance claim from an invoice
 */
router.post('/invoices/:id/create-claim', async (req, res) => {
    const connection = await pool.getConnection();
    const userId = req.user?.id;

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { authorizationId, notes } = req.body;

        // Get invoice details
        const [invoices] = await connection.execute(
            `SELECT i.*, p.patientId, p.patientType
             FROM invoices i
             LEFT JOIN patients p ON i.patientId = p.patientId
             WHERE i.invoiceId = ?`,
            [id]
        );

        if (invoices.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        if (invoice.patientType !== 'insurance') {
            await connection.rollback();
            return res.status(400).json({ error: 'Patient is not registered as insurance patient' });
        }

        // Check if claim already exists
        const [existingClaim] = await connection.execute(
            'SELECT claimId FROM insurance_claims WHERE invoiceId = ?',
            [id]
        );

        if (existingClaim.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Claim already exists for this invoice' });
        }

        // Get active insurance policy
        const [activeInsurance] = await connection.execute(
            `SELECT pi.*, ip.providerId
             FROM patient_insurance pi
             LEFT JOIN insurance_providers ip ON pi.providerId = ip.providerId
             WHERE pi.patientId = ?
               AND pi.isActive = 1
               AND (pi.coverageEndDate IS NULL OR pi.coverageEndDate >= CURDATE())
             ORDER BY pi.coverageStartDate DESC
             LIMIT 1`,
            [invoice.patientId]
        );

        if (activeInsurance.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'No active insurance policy found for this patient',
                suggestion: 'Please create an insurance policy for this patient first'
            });
        }

        const patientInsurance = activeInsurance[0];

        // Generate claim number
        const datePrefix = new Date().toISOString().slice(0, 7).replace('-', '');
        let claimNumber = '';
        let attempts = 0;
        let foundAvailable = false;

        while (!foundAvailable && attempts < 100) {
            const num = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            claimNumber = `CLM-${datePrefix}-${num}`;

            const [existing] = await connection.execute(
                'SELECT claimId FROM insurance_claims WHERE claimNumber = ?',
                [claimNumber]
            );

            if (existing.length === 0) {
                foundAvailable = true;
            } else {
                attempts++;
            }
        }

        if (!foundAvailable) {
            await connection.rollback();
            return res.status(500).json({ error: 'Failed to generate unique claim number' });
        }

        // Create claim
        const [claimResult] = await connection.execute(
            `INSERT INTO insurance_claims (
                claimNumber, invoiceId, patientInsuranceId, authorizationId, claimDate, claimAmount, status, notes, createdBy
            )
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
            [
                claimNumber,
                id,
                patientInsurance.patientInsuranceId,
                authorizationId || null,
                invoice.invoiceDate || new Date().toISOString().split('T')[0],
                invoice.totalAmount,
                notes || null,
                userId || null
            ]
        );

        const claimId = claimResult.insertId;

        // Initialize requirements for this claim
        const providerId = patientInsurance.providerId;
        const [templates] = await connection.execute(
            'SELECT templateId FROM claim_requirement_templates WHERE providerId = ? AND isActive = 1',
            [providerId]
        );

        if (templates.length > 0) {
            const templateId = templates[0].templateId;
            const [requirements] = await connection.execute(
                'SELECT requirementId FROM claim_requirements WHERE templateId = ? AND isActive = 1',
                [templateId]
            );

            // Initialize requirement completions (all false)
            for (const req of requirements) {
                await connection.execute(
                    `INSERT INTO claim_requirement_completions (claimId, requirementId, isCompleted)
                     VALUES (?, ?, 0)`,
                    [claimId, req.requirementId]
                );
            }
        }

        await connection.commit();

        // Fetch the created claim with all details
        const [newClaim] = await pool.execute(`
            SELECT ic.*,
                   i.invoiceNumber, i.totalAmount as invoiceAmount,
                   pi.policyNumber, pi.memberId,
                   p.patientNumber, p.firstName, p.lastName,
                   ip.providerName, ip.providerCode
            FROM insurance_claims ic
            LEFT JOIN invoices i ON ic.invoiceId = i.invoiceId
            LEFT JOIN patient_insurance pi ON ic.patientInsuranceId = pi.patientInsuranceId
            LEFT JOIN patients p ON pi.patientId = p.patientId
            LEFT JOIN insurance_providers ip ON pi.providerId = ip.providerId
            WHERE ic.claimId = ?
        `, [claimId]);

        res.status(201).json(newClaim[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating claim from invoice:', error);
        res.status(500).json({ message: 'Error creating claim from invoice', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route POST /api/billing/invoices/:id/create-pharmacy-queue
 * @description Manually create pharmacy queue entry for a paid prescription invoice
 */
router.post('/invoices/:id/create-pharmacy-queue', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const userId = req.user?.id;

        // Get the invoice
        const [invoices] = await connection.execute('SELECT * FROM invoices WHERE invoiceId = ?', [id]);
        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        // Check if invoice is paid
        if (invoice.status !== 'paid') {
            return res.status(400).json({
                message: 'Invoice must be paid before creating pharmacy queue entry',
                invoiceStatus: invoice.status
            });
        }

        // Check if it's a prescription invoice
        if (!invoice.notes || !invoice.notes.includes('Drug payment - Prescription:')) {
            return res.status(400).json({
                message: 'This invoice is not a prescription invoice',
                invoiceNotes: invoice.notes
            });
        }

        // Find pending prescriptions for this patient
        const [pendingPrescriptions] = await connection.execute(
            `SELECT prescriptionId, prescriptionNumber, patientId, status
             FROM prescriptions
             WHERE patientId = ? AND status = 'pending'
             ORDER BY prescriptionDate DESC
             LIMIT 1`,
            [invoice.patientId]
        );

        if (pendingPrescriptions.length === 0) {
            return res.status(400).json({
                message: 'Patient has no pending prescriptions',
                patientId: invoice.patientId
            });
        }

        const prescription = pendingPrescriptions[0];

        // Check if pharmacy queue entry already exists
        const [existingQueue] = await connection.execute(
            `SELECT queueId FROM queue_entries
             WHERE patientId = ? AND servicePoint = 'pharmacy'
             AND status NOT IN ('completed', 'cancelled')`,
            [prescription.patientId]
        );

        if (existingQueue.length > 0) {
            await connection.commit();
            connection.release();
            return res.status(200).json({
                message: 'Patient already exists in pharmacy queue',
                queueId: existingQueue[0].queueId,
                patientId: prescription.patientId
            });
        }

        // Generate ticket number for pharmacy queue
        const [pharmacyCount] = await connection.execute(
            'SELECT COUNT(*) as count FROM queue_entries WHERE DATE(arrivalTime) = CURDATE() AND servicePoint = "pharmacy"'
        );
        const pharmacyTicketNum = pharmacyCount[0].count + 1;
        const pharmacyTicketNumber = `P-${String(pharmacyTicketNum).padStart(3, '0')}`;

        // Create pharmacy queue entry
        await connection.execute(
            `INSERT INTO queue_entries
            (patientId, ticketNumber, servicePoint, priority, status, notes, createdBy)
            VALUES (?, ?, 'pharmacy', 'normal', 'waiting', ?, ?)`,
            [
                prescription.patientId,
                pharmacyTicketNumber,
                `Prescription: ${prescription.prescriptionNumber}`,
                userId || null
            ]
        );

        await connection.commit();

        // Get the created queue entry
        const [queueEntry] = await connection.execute(
            `SELECT q.*,
                    p.firstName as patientFirstName, p.lastName as patientLastName,
                    p.patientNumber
             FROM queue_entries q
             LEFT JOIN patients p ON q.patientId = p.patientId
             WHERE q.patientId = ? AND q.servicePoint = 'pharmacy'
             AND q.ticketNumber = ?
             ORDER BY q.queueId DESC
             LIMIT 1`,
            [prescription.patientId, pharmacyTicketNumber]
        );

        connection.release();
        res.status(201).json({
            message: 'Pharmacy queue entry created successfully',
            queueEntry: queueEntry[0],
            prescription: {
                prescriptionId: prescription.prescriptionId,
                prescriptionNumber: prescription.prescriptionNumber
            }
        });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error creating pharmacy queue entry:', error);
        res.status(500).json({ message: 'Error creating pharmacy queue entry', error: error.message });
    }
});

module.exports = router;

