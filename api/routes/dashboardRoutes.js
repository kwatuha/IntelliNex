// Dashboard statistics routes
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * @route GET /api/dashboard/stats
 * @description Get comprehensive dashboard statistics
 */
router.get('/stats', async (req, res) => {
    try {
        // Get total patients
        const [patientCount] = await pool.query('SELECT COUNT(*) as total FROM patients WHERE voided = 0');
        const totalPatients = patientCount[0]?.total || 0;

        // Get today's appointments
        const today = new Date().toISOString().split('T')[0];
        const [appointmentCount] = await pool.query(
            'SELECT COUNT(*) as total FROM appointments WHERE appointmentDate = ?',
            [today]
        );
        const todayAppointments = appointmentCount[0]?.total || 0;

        // Get active queue entries
        const [queueCount] = await pool.query(
            'SELECT COUNT(*) as total FROM queue_entries WHERE status IN (?, ?, ?)',
            ['waiting', 'called', 'serving']
        ).catch(() => [[{ total: 0 }]]);
        const activeQueue = queueCount[0]?.total || 0;

        // Get total employees
        const [employeeCount] = await pool.query(
            'SELECT COUNT(*) as total FROM employees WHERE status = ?',
            ['active']
        );
        const totalEmployees = employeeCount[0]?.total || 0;

        // Get total departments
        const [deptCount] = await pool.query(
            'SELECT COUNT(*) as total FROM departments WHERE isActive = TRUE'
        );
        const totalDepartments = deptCount[0]?.total || 0;

        // Get monthly revenue (from invoices)
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const [revenueData] = await pool.query(`
            SELECT COALESCE(SUM(totalAmount), 0) as total
            FROM invoices
            WHERE MONTH(createdAt) = ? AND YEAR(createdAt) = ? AND status = 'paid'
        `, [currentMonth, currentYear]);
        const monthlyRevenue = parseFloat(revenueData[0]?.total || 0);

        // Get pending invoices
        const [pendingInvoices] = await pool.query(
            'SELECT COUNT(*) as total FROM invoices WHERE status = ?',
            ['pending']
        );
        const pendingInvoicesCount = pendingInvoices[0]?.total || 0;

        // Get low stock items
        const [lowStock] = await pool.query(`
            SELECT COUNT(*) as total
            FROM inventory_items
            WHERE quantity <= reorderLevel AND status = 'Active'
        `);
        const lowStockItems = lowStock[0]?.total || 0;

        // Get inpatients (active admissions that are not ICU or maternity)
        const [inpatients] = await pool.query(`
            SELECT COUNT(*) as total
            FROM admissions a
            LEFT JOIN icu_admissions icu ON a.admissionId = icu.admissionId
            LEFT JOIN maternity_admissions mat ON a.admissionId = mat.admissionId
            WHERE a.dischargeDate IS NULL 
            AND a.status = 'admitted'
            AND icu.icuAdmissionId IS NULL
            AND mat.maternityAdmissionId IS NULL
        `);
        const inpatientsCount = inpatients[0]?.total || 0;

        // Get ICU patients (active ICU admissions)
        const [icuPatients] = await pool.query(`
            SELECT COUNT(*) as total
            FROM icu_admissions icu
            INNER JOIN admissions a ON icu.admissionId = a.admissionId
            WHERE a.dischargeDate IS NULL AND a.status = 'admitted'
        `);
        const icuPatientsCount = icuPatients[0]?.total || 0;

        // Get maternity patients (active maternity admissions)
        const [maternityPatients] = await pool.query(`
            SELECT COUNT(*) as total
            FROM maternity_admissions mat
            INNER JOIN admissions a ON mat.admissionId = a.admissionId
            WHERE a.dischargeDate IS NULL AND a.status = 'admitted'
        `);
        const maternityPatientsCount = maternityPatients[0]?.total || 0;

        res.status(200).json({
            totalPatients,
            todayAppointments,
            activeQueue,
            totalEmployees,
            totalDepartments,
            monthlyRevenue,
            pendingInvoices: pendingInvoicesCount,
            lowStockItems,
            inpatients: inpatientsCount,
            icuPatients: icuPatientsCount,
            maternityPatients: maternityPatientsCount,
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Error fetching dashboard statistics', error: error.message });
    }
});

/**
 * @route GET /api/dashboard/recent-activities
 * @description Get recent system activities
 */
router.get('/recent-activities', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // Get recent appointments
        const [recentAppointments] = await pool.query(`
            SELECT 
                a.*,
                CONCAT(p.firstName, ' ', p.lastName) as patientName,
                p.patientNumber
            FROM appointments a
            LEFT JOIN patients p ON a.patientId = p.patientId
            ORDER BY a.createdAt DESC
            LIMIT ?
        `, [limit]);

        // Get recent patients
        const [recentPatients] = await pool.query(`
            SELECT 
                patientId,
                firstName,
                lastName,
                patientNumber,
                createdAt
            FROM patients
            WHERE voided = 0
            ORDER BY createdAt DESC
            LIMIT ?
        `, [limit]);

        res.status(200).json({
            appointments: recentAppointments,
            patients: recentPatients,
        });
    } catch (error) {
        console.error('Error fetching recent activities:', error);
        res.status(500).json({ message: 'Error fetching recent activities', error: error.message });
    }
});

/**
 * @route GET /api/dashboard/facility-performance
 * @description Cross-facility (branch) performance for multi-site demos / HQ reporting.
 * Query: days=30 (lookback), branchId=optional filter
 */
router.get('/facility-performance', async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
        const branchFilter = req.query.branchId && req.query.branchId !== 'all'
            ? Number(req.query.branchId)
            : null;

        const [branches] = await pool.query(
            `SELECT branchId, branchCode, branchName, isMainBranch, isActive
             FROM branches
             WHERE isActive = 1
             ORDER BY isMainBranch DESC, branchName ASC`
        );

        const branchIds = branchFilter
            ? branches.filter((b) => Number(b.branchId) === branchFilter).map((b) => b.branchId)
            : branches.map((b) => b.branchId);

        if (!branchIds.length) {
            return res.json({ days, generatedAt: new Date().toISOString(), facilities: [], totals: {} });
        }

        const ph = branchIds.map(() => '?').join(',');
        const sinceExpr = `DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`;

        const [patientRows] = await pool.query(
            `SELECT registeredBranchId AS branchId,
                    COUNT(*) AS patientsRegistered,
                    SUM(CASE WHEN DATE(createdAt) = CURDATE() THEN 1 ELSE 0 END) AS patientsToday,
                    SUM(CASE WHEN createdAt >= ${sinceExpr} THEN 1 ELSE 0 END) AS patientsPeriod
             FROM patients
             WHERE voided = 0 AND registeredBranchId IN (${ph})
             GROUP BY registeredBranchId`,
            branchIds
        );

        const [queueRows] = await pool.query(
            `SELECT branchId,
                    SUM(CASE WHEN status IN ('waiting','called','serving') THEN 1 ELSE 0 END) AS activeQueue,
                    SUM(CASE WHEN DATE(arrivalTime) = CURDATE() THEN 1 ELSE 0 END) AS queueToday,
                    SUM(CASE WHEN arrivalTime >= ${sinceExpr} THEN 1 ELSE 0 END) AS queuePeriod,
                    SUM(CASE WHEN status = 'completed' AND arrivalTime >= ${sinceExpr} THEN 1 ELSE 0 END) AS queueCompletedPeriod
             FROM queue_entries
             WHERE branchId IN (${ph})
             GROUP BY branchId`,
            branchIds
        );

        const [invoiceRows] = await pool.query(
            `SELECT branchId,
                    COUNT(*) AS invoicesPeriod,
                    COALESCE(SUM(totalAmount), 0) AS billedPeriod,
                    COALESCE(SUM(paidAmount), 0) AS collectedPeriod,
                    SUM(CASE WHEN status IN ('pending','partial') THEN 1 ELSE 0 END) AS openInvoices,
                    COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN balance ELSE 0 END), 0) AS outstandingBalance
             FROM invoices
             WHERE COALESCE(voided, 0) = 0
               AND branchId IN (${ph})
               AND invoiceDate >= ${sinceExpr}
             GROUP BY branchId`,
            branchIds
        );

        const [encounterRows] = await pool.query(
            `SELECT branchId, COUNT(*) AS encountersPeriod
             FROM medical_records
             WHERE branchId IN (${ph}) AND visitDate >= ${sinceExpr}
             GROUP BY branchId`,
            branchIds
        );

        const [rxRows] = await pool.query(
            `SELECT branchId, COUNT(*) AS prescriptionsPeriod
             FROM prescriptions
             WHERE branchId IN (${ph}) AND prescriptionDate >= ${sinceExpr}
             GROUP BY branchId`,
            branchIds
        );

        const [labRows] = await pool.query(
            `SELECT branchId, COUNT(*) AS labOrdersPeriod
             FROM lab_test_orders
             WHERE branchId IN (${ph}) AND orderDate >= ${sinceExpr}
             GROUP BY branchId`,
            branchIds
        );

        const [stockRows] = await pool.query(
            `SELECT di.branchId,
                    COUNT(DISTINCT di.medicationId) AS medicationsInStock,
                    COALESCE(SUM(di.quantity), 0) AS totalUnits
             FROM drug_inventory di
             WHERE di.status = 'active' AND di.quantity > 0 AND di.branchId IN (${ph})
             GROUP BY di.branchId`,
            branchIds
        );

        const [storeRows] = await pool.query(
            `SELECT branchId, COUNT(*) AS storeCount
             FROM drug_stores
             WHERE isActive = 1 AND branchId IN (${ph})
             GROUP BY branchId`,
            branchIds
        );

        const [telemedicineRows] = await pool.query(
            `SELECT branchId,
                    COUNT(DISTINCT CASE WHEN startedAt >= ${sinceExpr} THEN sessionId END) AS telemedicineSessionsPeriod,
                    COUNT(DISTINCT CASE WHEN DATE(startedAt) = CURDATE() THEN sessionId END) AS telemedicineToday,
                    COUNT(DISTINCT CASE WHEN status = 'in_progress' THEN sessionId END) AS telemedicineActive,
                    COUNT(DISTINCT CASE
                      WHEN status = 'ended' AND startedAt >= ${sinceExpr} THEN sessionId
                    END) AS telemedicineCompletedPeriod,
                    COUNT(DISTINCT CASE
                      WHEN startedAt >= ${sinceExpr} THEN patientId
                    END) AS telemedicinePatientsPeriod,
                    ROUND(AVG(CASE
                      WHEN startedAt >= ${sinceExpr} AND endedAt IS NOT NULL
                      THEN TIMESTAMPDIFF(MINUTE, startedAt, endedAt)
                    END), 1) AS telemedicineAverageMinutes
             FROM telemedicine_sessions
             WHERE branchId IN (${ph})
             GROUP BY branchId`,
            branchIds
        ).catch(() => [[]]);

        const [transferRows] = await pool.query(
            `SELECT fs.branchId AS fromBranchId, ts.branchId AS toBranchId, t.status, COUNT(*) AS c
             FROM drug_inventory_transfers t
             INNER JOIN drug_stores fs ON t.fromStoreId = fs.storeId
             INNER JOIN drug_stores ts ON t.toStoreId = ts.storeId
             WHERE t.transferDate >= ${sinceExpr}
               AND (fs.branchId IN (${ph}) OR ts.branchId IN (${ph}))
             GROUP BY fs.branchId, ts.branchId, t.status`,
            [...branchIds, ...branchIds]
        ).catch(() => [[]]);

        const indexBy = (rows, key = 'branchId') => {
            const map = {};
            for (const row of rows || []) map[Number(row[key])] = row;
            return map;
        };

        const patients = indexBy(patientRows);
        const queues = indexBy(queueRows);
        const invoices = indexBy(invoiceRows);
        const encounters = indexBy(encounterRows);
        const prescriptions = indexBy(rxRows);
        const labs = indexBy(labRows);
        const stock = indexBy(stockRows);
        const stores = indexBy(storeRows);
        const telemedicine = indexBy(telemedicineRows);

        const facilities = branches
            .filter((b) => branchIds.includes(b.branchId))
            .map((b) => {
                const id = Number(b.branchId);
                const p = patients[id] || {};
                const q = queues[id] || {};
                const inv = invoices[id] || {};
                const enc = encounters[id] || {};
                const rx = prescriptions[id] || {};
                const lab = labs[id] || {};
                const st = stock[id] || {};
                const so = stores[id] || {};
                const tm = telemedicine[id] || {};
                const transfersOut = (transferRows || [])
                    .filter((t) => Number(t.fromBranchId) === id)
                    .reduce((s, t) => s + Number(t.c || 0), 0);
                const transfersIn = (transferRows || [])
                    .filter((t) => Number(t.toBranchId) === id)
                    .reduce((s, t) => s + Number(t.c || 0), 0);
                const transfersPending = (transferRows || [])
                    .filter((t) => (Number(t.fromBranchId) === id || Number(t.toBranchId) === id) && t.status === 'pending')
                    .reduce((s, t) => s + Number(t.c || 0), 0);

                return {
                    branchId: id,
                    branchCode: b.branchCode,
                    branchName: b.branchName,
                    isMainBranch: Boolean(b.isMainBranch),
                    patientsRegistered: Number(p.patientsRegistered || 0),
                    patientsToday: Number(p.patientsToday || 0),
                    patientsPeriod: Number(p.patientsPeriod || 0),
                    activeQueue: Number(q.activeQueue || 0),
                    queueToday: Number(q.queueToday || 0),
                    queuePeriod: Number(q.queuePeriod || 0),
                    queueCompletedPeriod: Number(q.queueCompletedPeriod || 0),
                    encountersPeriod: Number(enc.encountersPeriod || 0),
                    prescriptionsPeriod: Number(rx.prescriptionsPeriod || 0),
                    labOrdersPeriod: Number(lab.labOrdersPeriod || 0),
                    invoicesPeriod: Number(inv.invoicesPeriod || 0),
                    billedPeriod: Number(inv.billedPeriod || 0),
                    collectedPeriod: Number(inv.collectedPeriod || 0),
                    openInvoices: Number(inv.openInvoices || 0),
                    outstandingBalance: Number(inv.outstandingBalance || 0),
                    medicationsInStock: Number(st.medicationsInStock || 0),
                    stockUnits: Number(st.totalUnits || 0),
                    storeCount: Number(so.storeCount || 0),
                    telemedicineSessionsPeriod: Number(tm.telemedicineSessionsPeriod || 0),
                    telemedicineToday: Number(tm.telemedicineToday || 0),
                    telemedicineActive: Number(tm.telemedicineActive || 0),
                    telemedicineCompletedPeriod: Number(tm.telemedicineCompletedPeriod || 0),
                    telemedicinePatientsPeriod: Number(tm.telemedicinePatientsPeriod || 0),
                    telemedicineAverageMinutes: Number(tm.telemedicineAverageMinutes || 0),
                    transfersOut,
                    transfersIn,
                    transfersPending,
                };
            });

        const sum = (key) => facilities.reduce((s, f) => s + Number(f[key] || 0), 0);
        const totals = {
            patientsRegistered: sum('patientsRegistered'),
            patientsToday: sum('patientsToday'),
            patientsPeriod: sum('patientsPeriod'),
            activeQueue: sum('activeQueue'),
            queueToday: sum('queueToday'),
            encountersPeriod: sum('encountersPeriod'),
            prescriptionsPeriod: sum('prescriptionsPeriod'),
            labOrdersPeriod: sum('labOrdersPeriod'),
            billedPeriod: sum('billedPeriod'),
            collectedPeriod: sum('collectedPeriod'),
            outstandingBalance: sum('outstandingBalance'),
            openInvoices: sum('openInvoices'),
            stockUnits: sum('stockUnits'),
            telemedicineSessionsPeriod: sum('telemedicineSessionsPeriod'),
            telemedicineToday: sum('telemedicineToday'),
            telemedicineActive: sum('telemedicineActive'),
            telemedicineCompletedPeriod: sum('telemedicineCompletedPeriod'),
            telemedicinePatientsPeriod: sum('telemedicinePatientsPeriod'),
        };

        res.json({
            days,
            generatedAt: new Date().toISOString(),
            facilities,
            totals,
            transfers: transferRows || [],
        });
    } catch (error) {
        console.error('Error fetching facility performance:', error);
        res.status(500).json({ message: 'Error fetching facility performance', error: error.message });
    }
});

module.exports = router;

