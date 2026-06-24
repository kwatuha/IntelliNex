// Notification routes - Drug inventory notifications
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';
const PHARMACY_STAFF_ROLES = ['admin', 'pharmacist', 'pharmacy', 'system administrator'];

function getAuthUser(req) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded?.user || decoded || null;
    } catch {
        return null;
    }
}

function isChemistUser(user) {
    const roleName = String(user?.roleName || user?.role || '').toLowerCase();
    return roleName === 'chemist' || roleName.includes('chemist') || roleName.includes('external_pharmacy');
}

async function getChemistIdForUser(userId) {
    if (!userId) return null;
    const [rows] = await pool.execute(
        `SELECT chemistId FROM external_chemist_users
         WHERE userId = ? AND isActive = 1
         ORDER BY isPrimary DESC, chemistUserId ASC
         LIMIT 1`,
        [userId]
    );
    return rows[0]?.chemistId || null;
}

/**
 * @route GET /api/notifications/drug-notifications
 * @description Get all drug notifications with optional filters
 */
router.get('/drug-notifications', async (req, res) => {
    try {
        const { status, priority, search } = req.query;
        let query = `
            SELECT dn.*,
                   p.prescriptionNumber,
                   pi.dosage, pi.frequency, pi.duration
            FROM drug_notifications dn
            LEFT JOIN prescriptions p ON dn.prescriptionId = p.prescriptionId
            LEFT JOIN prescription_items pi ON dn.prescriptionItemId = pi.itemId
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            query += ' AND dn.status = ?';
            params.push(status);
        }

        if (priority && priority !== 'all') {
            query += ' AND dn.priority = ?';
            params.push(priority);
        }

        if (search) {
            query += ' AND (dn.medicationName LIKE ? OR dn.doctorName LIKE ? OR dn.patientName LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ' ORDER BY dn.createdAt DESC, dn.priority DESC';

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching drug notifications:', error);
        res.status(500).json({ message: 'Error fetching drug notifications', error: error.message });
    }
});

/**
 * @route GET /api/notifications/drug-notifications/:id
 * @description Get a single drug notification by ID
 */
router.get('/drug-notifications/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT dn.*,
                    p.prescriptionNumber,
                    pi.dosage, pi.frequency, pi.duration
             FROM drug_notifications dn
             LEFT JOIN prescriptions p ON dn.prescriptionId = p.prescriptionId
             LEFT JOIN prescription_items pi ON dn.prescriptionItemId = pi.itemId
             WHERE dn.notificationId = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Drug notification not found' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching drug notification:', error);
        res.status(500).json({ message: 'Error fetching drug notification', error: error.message });
    }
});

/**
 * @route PUT /api/notifications/drug-notifications/:id/acknowledge
 * @description Acknowledge a drug notification
 */
router.put('/drug-notifications/:id/acknowledge', async (req, res) => {
    try {
        const userId = req.user?.id;

        const [result] = await pool.execute(
            `UPDATE drug_notifications 
             SET status = 'acknowledged', acknowledgedBy = ?, acknowledgedAt = NOW(), updatedAt = NOW()
             WHERE notificationId = ? AND status = 'pending'`,
            [userId || null, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Drug notification not found or already processed' });
        }

        const [updated] = await pool.execute(
            'SELECT * FROM drug_notifications WHERE notificationId = ?',
            [req.params.id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error acknowledging drug notification:', error);
        res.status(500).json({ message: 'Error acknowledging drug notification', error: error.message });
    }
});

/**
 * @route PUT /api/notifications/drug-notifications/:id/resolve
 * @description Mark a drug notification as resolved
 */
router.put('/drug-notifications/:id/resolve', async (req, res) => {
    try {
        const [result] = await pool.execute(
            `UPDATE drug_notifications 
             SET status = 'resolved', resolvedAt = NOW(), updatedAt = NOW()
             WHERE notificationId = ?`,
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Drug notification not found' });
        }

        const [updated] = await pool.execute(
            'SELECT * FROM drug_notifications WHERE notificationId = ?',
            [req.params.id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error resolving drug notification:', error);
        res.status(500).json({ message: 'Error resolving drug notification', error: error.message });
    }
});

/**
 * @route DELETE /api/notifications/drug-notifications/:id
 * @description Delete a drug notification
 */
router.delete('/drug-notifications/:id', async (req, res) => {
    try {
        const [result] = await pool.execute(
            'DELETE FROM drug_notifications WHERE notificationId = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Drug notification not found' });
        }

        res.status(200).json({
            message: 'Drug notification deleted successfully',
            notificationId: req.params.id
        });
    } catch (error) {
        console.error('Error deleting drug notification:', error);
        res.status(500).json({ message: 'Error deleting drug notification', error: error.message });
    }
});

/**
 * @route GET /api/notifications/pharmacy-notifications
 * @description In-app pharmacy movement and reorder notifications
 */
router.get('/pharmacy-notifications', async (req, res) => {
    try {
        const user = getAuthUser(req);
        const { status = 'pending', notificationType, limit = 50 } = req.query;
        const params = [];
        let query = `
            SELECT pn.*
            FROM pharmacy_notifications pn
            WHERE 1=1
        `;

        if (status && status !== 'all') {
            query += ' AND pn.status = ?';
            params.push(status);
        }
        if (notificationType) {
            query += ' AND pn.notificationType = ?';
            params.push(notificationType);
        }

        if (user) {
            const roleName = String(user.roleName || user.role || '').toLowerCase();
            if (isChemistUser(user)) {
                const chemistId = await getChemistIdForUser(user.id || user.userId);
                query += ' AND (pn.targetChemistId = ? OR pn.targetRole = ?)';
                params.push(chemistId, 'chemist');
            } else if (PHARMACY_STAFF_ROLES.some((role) => roleName.includes(role))) {
                query += ' AND (pn.targetRole IN (?, ?, ?, ?) OR pn.targetUserId = ?)';
                params.push('admin', 'pharmacist', 'pharmacy', 'system administrator', user.id || user.userId);
            } else {
                query += ' AND pn.targetUserId = ?';
                params.push(user.id || user.userId);
            }
        }

        query += ` ORDER BY pn.createdAt DESC LIMIT ${Number(limit)}`;
        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching pharmacy notifications:', error);
        res.status(500).json({ message: 'Error fetching pharmacy notifications', error: error.message });
    }
});

router.put('/pharmacy-notifications/:id/acknowledge', async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId || getAuthUser(req)?.id || getAuthUser(req)?.userId || null;
        const [result] = await pool.execute(
            `UPDATE pharmacy_notifications
             SET status = 'acknowledged', acknowledgedBy = ?, acknowledgedAt = NOW(), updatedAt = NOW()
             WHERE notificationId = ? AND status = 'pending'`,
            [userId, req.params.id]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ message: 'Pharmacy notification not found or already processed' });
        }
        const [rows] = await pool.execute(
            'SELECT * FROM pharmacy_notifications WHERE notificationId = ?',
            [req.params.id]
        );
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error acknowledging pharmacy notification:', error);
        res.status(500).json({ message: 'Error acknowledging pharmacy notification', error: error.message });
    }
});

router.put('/pharmacy-notifications/:id/resolve', async (req, res) => {
    try {
        const [result] = await pool.execute(
            `UPDATE pharmacy_notifications
             SET status = 'resolved', resolvedAt = NOW(), updatedAt = NOW()
             WHERE notificationId = ?`,
            [req.params.id]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ message: 'Pharmacy notification not found' });
        }
        const [rows] = await pool.execute(
            'SELECT * FROM pharmacy_notifications WHERE notificationId = ?',
            [req.params.id]
        );
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error resolving pharmacy notification:', error);
        res.status(500).json({ message: 'Error resolving pharmacy notification', error: error.message });
    }
});

module.exports = router;








