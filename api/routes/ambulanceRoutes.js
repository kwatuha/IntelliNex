// Ambulance routes - Full CRUD operations
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { notifyAmbulanceDispatched } = require('../lib/patientSms');

/**
 * @route GET /api/ambulance
 * @description Get all ambulances
 */
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;

        let query = `
            SELECT * FROM ambulances
            WHERE isActive = 1
        `;
        const params = [];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        if (search) {
            query += ` AND (
                vehicleNumber LIKE ? OR
                driverName LIKE ? OR
                vehicleType LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY vehicleNumber ASC`;

        const [ambulances] = await pool.execute(query, params);

        res.status(200).json(ambulances);
    } catch (error) {
        console.error('Error fetching ambulances:', error);
        res.status(500).json({ message: 'Error fetching ambulances', error: error.message });
    }
});

/**
 * @route GET /api/ambulance/:id
 * @description Get a single ambulance by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [ambulances] = await pool.execute(
            'SELECT * FROM ambulances WHERE ambulanceId = ? AND isActive = 1',
            [id]
        );

        if (ambulances.length === 0) {
            return res.status(404).json({ message: 'Ambulance not found' });
        }

        res.status(200).json(ambulances[0]);
    } catch (error) {
        console.error('Error fetching ambulance:', error);
        res.status(500).json({ message: 'Error fetching ambulance', error: error.message });
    }
});

/**
 * @route POST /api/ambulance
 * @description Create a new ambulance
 */
router.post('/', async (req, res) => {
    try {
        const {
            vehicleNumber,
            vehicleType,
            driverName,
            driverPhone,
            capacity,
            equipment,
            status,
            notes
        } = req.body;

        // Validate required fields
        if (!vehicleNumber || !driverName) {
            return res.status(400).json({ message: 'Missing required fields: vehicleNumber, driverName' });
        }

        // Check if vehicle number already exists
        const [existing] = await pool.execute(
            'SELECT ambulanceId FROM ambulances WHERE vehicleNumber = ?',
            [vehicleNumber]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Ambulance with this vehicle number already exists' });
        }

        const [result] = await pool.execute(
            `INSERT INTO ambulances (
                vehicleNumber, vehicleType, driverName, driverPhone,
                capacity, equipment, status, notes, isActive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                vehicleNumber,
                vehicleType || 'standard',
                driverName,
                driverPhone || null,
                capacity ? parseInt(capacity) : 1,
                equipment || null,
                status || 'available',
                notes || null
            ]
        );

        const [newAmbulance] = await pool.execute(
            'SELECT * FROM ambulances WHERE ambulanceId = ?',
            [result.insertId]
        );

        res.status(201).json(newAmbulance[0]);
    } catch (error) {
        console.error('Error creating ambulance:', error);
        res.status(500).json({ message: 'Error creating ambulance', error: error.message });
    }
});

/**
 * @route PUT /api/ambulance/:id
 * @description Update an ambulance
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            vehicleNumber,
            vehicleType,
            driverName,
            driverPhone,
            capacity,
            equipment,
            status,
            notes
        } = req.body;

        // Check if ambulance exists
        const [existing] = await pool.execute(
            'SELECT ambulanceId FROM ambulances WHERE ambulanceId = ? AND isActive = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Ambulance not found' });
        }

        // If vehicle number is being changed, check for duplicates
        if (vehicleNumber) {
            const [duplicate] = await pool.execute(
                'SELECT ambulanceId FROM ambulances WHERE vehicleNumber = ? AND ambulanceId != ?',
                [vehicleNumber, id]
            );

            if (duplicate.length > 0) {
                return res.status(400).json({ message: 'Ambulance with this vehicle number already exists' });
            }
        }

        await pool.execute(
            `UPDATE ambulances SET
                vehicleNumber = COALESCE(?, vehicleNumber),
                vehicleType = COALESCE(?, vehicleType),
                driverName = COALESCE(?, driverName),
                driverPhone = COALESCE(?, driverPhone),
                capacity = COALESCE(?, capacity),
                equipment = COALESCE(?, equipment),
                status = COALESCE(?, status),
                notes = COALESCE(?, notes),
                updatedAt = CURRENT_TIMESTAMP
            WHERE ambulanceId = ?`,
            [
                vehicleNumber,
                vehicleType,
                driverName,
                driverPhone,
                capacity ? parseInt(capacity) : null,
                equipment,
                status,
                notes,
                id
            ]
        );

        const [updated] = await pool.execute(
            'SELECT * FROM ambulances WHERE ambulanceId = ?',
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        console.error('Error updating ambulance:', error);
        res.status(500).json({ message: 'Error updating ambulance', error: error.message });
    }
});

/**
 * @route DELETE /api/ambulance/:id
 * @description Soft delete an ambulance (set isActive = 0)
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if ambulance exists
        const [existing] = await pool.execute(
            'SELECT ambulanceId, status FROM ambulances WHERE ambulanceId = ? AND isActive = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Ambulance not found' });
        }

        // Check if ambulance is currently on a trip
        const [activeTrips] = await pool.execute(
            `SELECT tripId FROM ambulance_trips
             WHERE ambulanceId = ? AND status IN ('scheduled', 'dispatched', 'in_progress')`,
            [id]
        );

        if (activeTrips.length > 0) {
            return res.status(400).json({
                message: 'Cannot remove ambulance that has active trips. Please complete or cancel trips first.'
            });
        }

        // Soft delete
        await pool.execute(
            'UPDATE ambulances SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE ambulanceId = ?',
            [id]
        );

        res.status(200).json({ message: 'Ambulance removed successfully' });
    } catch (error) {
        console.error('Error deleting ambulance:', error);
        res.status(500).json({ message: 'Error deleting ambulance', error: error.message });
    }
});

/**
 * @route GET /api/ambulance/trips
 * @description Get all ambulance trips
 */
router.get('/trips/all', async (req, res) => {
    try {
        const { status, tripType, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT at.*,
                   a.vehicleNumber, a.driverName, a.driverPhone as ambulanceDriverPhone,
                   pt.firstName, pt.lastName, pt.patientNumber
            FROM ambulance_trips at
            LEFT JOIN ambulances a ON at.ambulanceId = a.ambulanceId
            LEFT JOIN patients pt ON at.patientId = pt.patientId
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ` AND at.status = ?`;
            params.push(status);
        }

        if (tripType) {
            query += ` AND at.tripType = ?`;
            params.push(tripType);
        }

        if (search) {
            query += ` AND (
                at.patientName LIKE ? OR
                at.pickupLocation LIKE ? OR
                at.destination LIKE ? OR
                at.tripNumber LIKE ? OR
                a.vehicleNumber LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY at.scheduledDateTime DESC, at.createdAt DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [trips] = await pool.execute(query, params);

        res.status(200).json(trips);
    } catch (error) {
        console.error('Error fetching ambulance trips:', error);
        res.status(500).json({ message: 'Error fetching ambulance trips', error: error.message });
    }
});

/**
 * @route GET /api/ambulance/trips/:id
 * @description Get a single trip by ID
 */
router.get('/trips/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [trips] = await pool.execute(
            `SELECT at.*,
                    a.vehicleNumber, a.driverName, a.driverPhone as ambulanceDriverPhone,
                    pt.firstName, pt.lastName, pt.patientNumber
             FROM ambulance_trips at
             LEFT JOIN ambulances a ON at.ambulanceId = a.ambulanceId
             LEFT JOIN patients pt ON at.patientId = pt.patientId
             WHERE at.tripId = ?`,
            [id]
        );

        if (trips.length === 0) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        res.status(200).json(trips[0]);
    } catch (error) {
        console.error('Error fetching trip:', error);
        res.status(500).json({ message: 'Error fetching trip', error: error.message });
    }
});

/**
 * @route POST /api/ambulance/trips
 * @description Create a new ambulance trip
 */
router.post('/trips', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            ambulanceId,
            patientId,
            patientName,
            patientPhone,
            patientAge,
            patientGender,
            pickupLocation,
            destination,
            tripType,
            status,
            scheduledDateTime,
            distance,
            cost,
            paymentStatus,
            notes,
            medicalCondition,
            priority
        } = req.body;

        // Validate required fields
        if (!ambulanceId || !patientName || !pickupLocation || !destination) {
            await connection.rollback();
            return res.status(400).json({
                message: 'Missing required fields: ambulanceId, patientName, pickupLocation, destination'
            });
        }

        // Check if ambulance exists and is available
        const [ambulance] = await connection.execute(
            'SELECT ambulanceId, status FROM ambulances WHERE ambulanceId = ? AND isActive = 1',
            [ambulanceId]
        );

        if (ambulance.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Ambulance not found' });
        }

        // Generate trip number
        const year = new Date().getFullYear();
        const [lastTrip] = await connection.execute(
            `SELECT tripNumber FROM ambulance_trips
             WHERE tripNumber LIKE ?
             ORDER BY tripNumber DESC LIMIT 1`,
            [`TRIP-${year}-%`]
        );

        let tripNumber;
        if (lastTrip.length > 0) {
            const lastNum = parseInt(lastTrip[0].tripNumber.split('-')[2]);
            tripNumber = `TRIP-${year}-${String(lastNum + 1).padStart(3, '0')}`;
        } else {
            tripNumber = `TRIP-${year}-001`;
        }

        // Insert trip
        const [result] = await connection.execute(
            `INSERT INTO ambulance_trips (
                tripNumber, ambulanceId, patientId, patientName, patientPhone, patientAge, patientGender,
                pickupLocation, destination, tripType, status, scheduledDateTime,
                distance, cost, paymentStatus, notes, medicalCondition, priority
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tripNumber,
                ambulanceId,
                patientId || null,
                patientName,
                patientPhone || null,
                patientAge ? parseInt(patientAge) : null,
                patientGender || null,
                pickupLocation,
                destination,
                tripType || 'emergency',
                status || 'scheduled',
                scheduledDateTime || new Date().toISOString().slice(0, 19).replace('T', ' '),
                distance ? parseFloat(distance) : null,
                cost ? parseFloat(cost) : null,
                paymentStatus || 'pending',
                notes || null,
                medicalCondition || null,
                priority || 'medium'
            ]
        );

        // Update ambulance status if trip is scheduled/dispatched/in_progress
        if (status && ['scheduled', 'dispatched', 'in_progress'].includes(status)) {
            await connection.execute(
                'UPDATE ambulances SET status = "on_trip", updatedAt = CURRENT_TIMESTAMP WHERE ambulanceId = ?',
                [ambulanceId]
            );
        }

        await connection.commit();

        const [newTrip] = await pool.execute(
            `SELECT at.*,
                    a.vehicleNumber, a.driverName, a.driverPhone as ambulanceDriverPhone,
                    pt.firstName, pt.lastName, pt.patientNumber
             FROM ambulance_trips at
             LEFT JOIN ambulances a ON at.ambulanceId = a.ambulanceId
             LEFT JOIN patients pt ON at.patientId = pt.patientId
             WHERE at.tripId = ?`,
            [result.insertId]
        );

        const tripStatus = String(status || newTrip[0]?.status || '').toLowerCase();
        if (
            patientId &&
            ['scheduled', 'dispatched', 'in_progress'].includes(tripStatus)
        ) {
            notifyAmbulanceDispatched(patientId, {
                pickupLocation,
            });
        }

        res.status(201).json(newTrip[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating trip:', error);
        res.status(500).json({ message: 'Error creating trip', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route PUT /api/ambulance/trips/:id
 * @description Update an ambulance trip
 */
router.put('/trips/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            ambulanceId,
            patientId,
            patientName,
            patientPhone,
            patientAge,
            patientGender,
            pickupLocation,
            destination,
            tripType,
            status,
            scheduledDateTime,
            dispatchedDateTime,
            pickupDateTime,
            arrivalDateTime,
            completedDateTime,
            distance,
            duration,
            cost,
            paymentStatus,
            notes,
            medicalCondition,
            priority
        } = req.body;

        // Check if trip exists
        const [existing] = await connection.execute(
            'SELECT tripId, ambulanceId, status FROM ambulance_trips WHERE tripId = ?',
            [id]
        );

        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Trip not found' });
        }

        const oldStatus = existing[0].status;
        const oldAmbulanceId = existing[0].ambulanceId;

        // Update trip
        await connection.execute(
            `UPDATE ambulance_trips SET
                ambulanceId = COALESCE(?, ambulanceId),
                patientId = COALESCE(?, patientId),
                patientName = COALESCE(?, patientName),
                patientPhone = COALESCE(?, patientPhone),
                patientAge = COALESCE(?, patientAge),
                patientGender = COALESCE(?, patientGender),
                pickupLocation = COALESCE(?, pickupLocation),
                destination = COALESCE(?, destination),
                tripType = COALESCE(?, tripType),
                status = COALESCE(?, status),
                scheduledDateTime = COALESCE(?, scheduledDateTime),
                dispatchedDateTime = COALESCE(?, dispatchedDateTime),
                pickupDateTime = COALESCE(?, pickupDateTime),
                arrivalDateTime = COALESCE(?, arrivalDateTime),
                completedDateTime = COALESCE(?, completedDateTime),
                distance = COALESCE(?, distance),
                duration = COALESCE(?, duration),
                cost = COALESCE(?, cost),
                paymentStatus = COALESCE(?, paymentStatus),
                notes = COALESCE(?, notes),
                medicalCondition = COALESCE(?, medicalCondition),
                priority = COALESCE(?, priority),
                updatedAt = CURRENT_TIMESTAMP
            WHERE tripId = ?`,
            [
                ambulanceId,
                patientId,
                patientName,
                patientPhone,
                patientAge ? parseInt(patientAge) : null,
                patientGender,
                pickupLocation,
                destination,
                tripType,
                status,
                scheduledDateTime,
                dispatchedDateTime,
                pickupDateTime,
                arrivalDateTime,
                completedDateTime,
                distance ? parseFloat(distance) : null,
                duration ? parseInt(duration) : null,
                cost ? parseFloat(cost) : null,
                paymentStatus,
                notes,
                medicalCondition,
                priority,
                id
            ]
        );

        // Update ambulance status based on trip status
        const newStatus = status || oldStatus;
        const newAmbulanceId = ambulanceId || oldAmbulanceId;

        // If trip is completed or cancelled, set ambulance to available
        if (newStatus === 'completed' || newStatus === 'cancelled') {
            await connection.execute(
                'UPDATE ambulances SET status = "available", updatedAt = CURRENT_TIMESTAMP WHERE ambulanceId = ?',
                [newAmbulanceId]
            );
        } else if (['scheduled', 'dispatched', 'in_progress'].includes(newStatus)) {
            // If trip is active, set ambulance to on_trip
            await connection.execute(
                'UPDATE ambulances SET status = "on_trip", updatedAt = CURRENT_TIMESTAMP WHERE ambulanceId = ?',
                [newAmbulanceId]
            );
        }

        // If ambulance changed, update old ambulance status
        if (ambulanceId && ambulanceId !== oldAmbulanceId) {
            await connection.execute(
                'UPDATE ambulances SET status = "available", updatedAt = CURRENT_TIMESTAMP WHERE ambulanceId = ?',
                [oldAmbulanceId]
            );
        }

        await connection.commit();

        const [updated] = await pool.execute(
            `SELECT at.*,
                    a.vehicleNumber, a.driverName, a.driverPhone as ambulanceDriverPhone,
                    pt.firstName, pt.lastName, pt.patientNumber
             FROM ambulance_trips at
             LEFT JOIN ambulances a ON at.ambulanceId = a.ambulanceId
             LEFT JOIN patients pt ON at.patientId = pt.patientId
             WHERE at.tripId = ?`,
            [id]
        );

        res.status(200).json(updated[0]);
    } catch (error) {
        await connection.rollback();
        console.error('Error updating trip:', error);
        res.status(500).json({ message: 'Error updating trip', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route DELETE /api/ambulance/trips/:id
 * @description Cancel an ambulance trip
 */
router.delete('/trips/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Get trip details
        const [trip] = await connection.execute(
            'SELECT tripId, ambulanceId, status FROM ambulance_trips WHERE tripId = ?',
            [id]
        );

        if (trip.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Trip not found' });
        }

        const tripStatus = trip[0].status;
        const ambulanceId = trip[0].ambulanceId;

        // Update trip status to cancelled instead of deleting
        await connection.execute(
            'UPDATE ambulance_trips SET status = "cancelled", updatedAt = CURRENT_TIMESTAMP WHERE tripId = ?',
            [id]
        );

        // If trip was active, set ambulance back to available
        if (['scheduled', 'dispatched', 'in_progress'].includes(tripStatus)) {
            await connection.execute(
                'UPDATE ambulances SET status = "available", updatedAt = CURRENT_TIMESTAMP WHERE ambulanceId = ?',
                [ambulanceId]
            );
        }

        await connection.commit();

        res.status(200).json({ message: 'Trip cancelled successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error cancelling trip:', error);
        res.status(500).json({ message: 'Error cancelling trip', error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;




