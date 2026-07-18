// Appointment management routes
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { notifyAppointmentScheduled, notifyAppointmentUpdated } = require('../lib/patientSms');

router.get('/', async (req, res) => {
    try {
        const { date, status, doctorId, patientId } = req.query;
        let query = `
            SELECT a.*, 
                   p.firstName as patientFirstName, p.lastName as patientLastName,
                   u.firstName as doctorFirstName, u.lastName as doctorLastName
            FROM appointments a
            LEFT JOIN patients p ON a.patientId = p.patientId
            LEFT JOIN users u ON a.doctorId = u.userId
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

        query += ` ORDER BY a.appointmentDate DESC, a.appointmentTime DESC`;

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
        const userId = req.user?.id;

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

        const [result] = await pool.execute(
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
        const updates = [];
        const values = [];

        Object.keys(req.body).forEach(key => {
            if (req.body[key] !== undefined && key !== 'appointmentId') {
                updates.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.id);

        await pool.execute(
            `UPDATE appointments SET ${updates.join(', ')}, updatedAt = NOW() WHERE appointmentId = ?`,
            values
        );

        const [updated] = await pool.execute(
            'SELECT * FROM appointments WHERE appointmentId = ?',
            [req.params.id]
        );

        if (updated[0]?.patientId) {
            const body = req.body || {};
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

