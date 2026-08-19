// User management routes
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const USER_SELECT = `
    SELECT
        u.userId, u.username, u.email, u.firstName, u.lastName,
        u.phone, u.department, u.isActive, u.roleId, u.createdAt, u.updatedAt,
        r.roleName AS role, r.roleName AS roleName,
        uba.branchId AS branchId,
        b.branchName AS branchName,
        b.branchCode AS branchCode,
        COALESCE(uba.canAccessAllBranches, 0) AS canAccessAllBranches
    FROM users u
    LEFT JOIN roles r ON u.roleId = r.roleId
    LEFT JOIN user_branch_assignments uba
        ON uba.userId = u.userId AND uba.isDefault = 1 AND uba.isActive = 1
    LEFT JOIN branches b ON b.branchId = uba.branchId
`;

async function resolveHomeBranchId(branchId) {
    const bid = Number(branchId);
    if (Number.isFinite(bid) && bid > 0) {
        const [branches] = await pool.execute(
            'SELECT branchId FROM branches WHERE branchId = ? AND isActive = 1 LIMIT 1',
            [bid]
        );
        if (branches.length) return bid;
        const err = new Error('Selected facility was not found or is inactive');
        err.status = 400;
        throw err;
    }

    const [main] = await pool.execute(
        `SELECT branchId FROM branches
         WHERE isActive = 1
         ORDER BY isMainBranch DESC, branchId ASC
         LIMIT 1`
    );
    if (!main[0]) {
        const err = new Error('No active facility is configured. Create a facility first.');
        err.status = 400;
        throw err;
    }
    return Number(main[0].branchId);
}

async function upsertUserHomeFacility(userId, branchId, canAccessAllBranches) {
    const bid = await resolveHomeBranchId(branchId);
    const allAccess = canAccessAllBranches ? 1 : 0;

    // Only one default home facility
    await pool.execute(
        'UPDATE user_branch_assignments SET isDefault = 0 WHERE userId = ?',
        [userId]
    );

    const [existing] = await pool.execute(
        `SELECT assignmentId FROM user_branch_assignments
         WHERE userId = ? AND branchId = ? LIMIT 1`,
        [userId, bid]
    );

    if (existing[0]) {
        await pool.execute(
            `UPDATE user_branch_assignments
             SET isDefault = 1, canAccessAllBranches = ?, isActive = 1, updatedAt = NOW()
             WHERE assignmentId = ?`,
            [allAccess, existing[0].assignmentId]
        );
    } else {
        await pool.execute(
            `INSERT INTO user_branch_assignments
               (userId, branchId, isDefault, canAccessAllBranches, isActive)
             VALUES (?, ?, 1, ?, 1)`,
            [userId, bid, allAccess]
        );
    }

    // Facility-scoped staff: deactivate other branch rows so lists stay accurate.
    // All-facility users keep the flag; other rows are non-default.
    if (!allAccess) {
        await pool.execute(
            `UPDATE user_branch_assignments
             SET isActive = 0, canAccessAllBranches = 0, updatedAt = NOW()
             WHERE userId = ? AND branchId <> ?`,
            [userId, bid]
        );
    } else {
        await pool.execute(
            `UPDATE user_branch_assignments
             SET canAccessAllBranches = 1, updatedAt = NOW()
             WHERE userId = ? AND isActive = 1`,
            [userId]
        );
    }

    return bid;
}

async function fetchUserById(userId) {
    const [rows] = await pool.query(`${USER_SELECT} WHERE u.userId = ? AND u.voided = 0`, [userId]);
    if (!rows[0]) return null;
    return {
        ...rows[0],
        canAccessAllBranches: Boolean(rows[0].canAccessAllBranches),
        isActive: Boolean(rows[0].isActive),
    };
}

/**
 * @route GET /api/users
 * @description Get all users
 */
router.get('/', async (req, res) => {
    try {
        const { search, limit = 50, page } = req.query;
        const limitNum = parseInt(limit) || 50;
        const offset = page ? (parseInt(page) - 1) * limitNum : 0;

        let query = `${USER_SELECT} WHERE u.voided = 0`;
        const params = [];

        if (search) {
            query += ` AND (
                u.firstName LIKE ? OR
                u.lastName LIKE ? OR
                u.username LIKE ? OR
                u.email LIKE ? OR
                u.phone LIKE ? OR
                b.branchName LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY u.lastName, u.firstName LIMIT ${limitNum} OFFSET ${offset}`;

        const [rows] = await pool.execute(query, params);
        res.status(200).json(
            rows.map((row) => ({
                ...row,
                canAccessAllBranches: Boolean(row.canAccessAllBranches),
                isActive: Boolean(row.isActive),
            }))
        );
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

/**
 * @route GET /api/users/:id
 * @description Get a single user by ID
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await fetchUserById(id);
        if (user) {
            res.status(200).json(user);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
});

/**
 * @route POST /api/users
 * @description Create a new user
 */
router.post('/', async (req, res) => {
    const {
        username,
        email,
        password,
        firstName,
        lastName,
        phone,
        roleId,
        department,
        isActive,
        branchId,
        canAccessAllBranches,
    } = req.body;

    if (!username || !email || !password || !firstName || !lastName || !roleId) {
        return res.status(400).json({ error: 'Please enter all required fields' });
    }

    try {
        const [existingUsers] = await pool.execute(
            'SELECT userId FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User with that username or email already exists' });
        }
    } catch (error) {
        console.error('Error checking existing user:', error);
        return res.status(500).json({ message: 'Error creating user', error: error.message });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert user
        const [result] = await conn.execute(
            `INSERT INTO users
               (username, email, passwordHash, firstName, lastName, phone, roleId, department, isActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                username,
                email,
                passwordHash,
                firstName,
                lastName,
                phone || null,
                roleId,
                department || null,
                isActive === false || isActive === 0 ? 0 : 1,
            ]
        );

        const insertedUserId = result.insertId;

        // Persist home facility (defaults to main branch when omitted)
        const homeBranchId = await resolveHomeBranchId(branchId);
        await conn.execute(
            `INSERT INTO user_branch_assignments
               (userId, branchId, isDefault, canAccessAllBranches, isActive)
             VALUES (?, ?, 1, ?, 1)`,
            [insertedUserId, homeBranchId, canAccessAllBranches ? 1 : 0]
        );

        await conn.commit();

        const created = await fetchUserById(insertedUserId);
        res.status(201).json(created);
    } catch (error) {
        try { await conn.rollback(); } catch (_) { /* ignore */ }
        console.error('Error creating user:', error);
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'User with that username or email already exists' });
        }
        res.status(500).json({ message: 'Error creating user', error: error.message });
    } finally {
        conn.release();
    }
});

/**
 * @route PUT /api/users/:id
 * @description Update a user
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        username,
        email,
        firstName,
        lastName,
        phone,
        roleId,
        department,
        isActive,
        password,
        branchId,
        canAccessAllBranches,
    } = req.body;

    try {
        // Check if user exists
        const [existing] = await pool.execute(
            'SELECT userId FROM users WHERE userId = ? AND voided = 0',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (username !== undefined) { updates.push('username = ?'); values.push(username); }
        if (email !== undefined) { updates.push('email = ?'); values.push(email); }
        if (firstName !== undefined) { updates.push('firstName = ?'); values.push(firstName); }
        if (lastName !== undefined) { updates.push('lastName = ?'); values.push(lastName); }
        if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
        if (roleId !== undefined) { updates.push('roleId = ?'); values.push(roleId); }
        if (department !== undefined) { updates.push('department = ?'); values.push(department); }
        if (isActive !== undefined) { updates.push('isActive = ?'); values.push(isActive ? 1 : 0); }

        if (password && String(password).trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(String(password).trim(), salt);
            updates.push('passwordHash = ?');
            values.push(passwordHash);
        }

        if (updates.length > 0) {
            values.push(id);
            await pool.execute(
                `UPDATE users SET ${updates.join(', ')}, updatedAt = NOW() WHERE userId = ?`,
                values
            );
        }

        if (branchId != null && branchId !== '') {
            await upsertUserHomeFacility(id, branchId, Boolean(canAccessAllBranches));
        } else if (canAccessAllBranches !== undefined) {
            // Update flag on current default assignment without changing facility
            await pool.execute(
                `UPDATE user_branch_assignments
                 SET canAccessAllBranches = ?, updatedAt = NOW()
                 WHERE userId = ? AND isDefault = 1 AND isActive = 1`,
                [canAccessAllBranches ? 1 : 0, id]
            );
        }

        const updated = await fetchUserById(id);
        res.status(200).json(updated);
    } catch (error) {
        console.error('Error updating user:', error);
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
});

/**
 * @route DELETE /api/users/:id
 * @description Soft delete a user (set voided = true)
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute(
            'UPDATE users SET voided = 1, updatedAt = NOW() WHERE userId = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
});

/**
 * @route PUT /api/users/:id/password
 * @description Change user password
 */
router.put('/:id/password', async (req, res) => {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Please provide current and new password' });
    }

    try {
        // Get current user
        const [users] = await pool.execute(
            'SELECT passwordHash FROM users WHERE userId = ?',
            [id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, users[0].passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        // Update password
        await pool.execute(
            'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE userId = ?',
            [passwordHash, id]
        );

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
});

module.exports = router;
