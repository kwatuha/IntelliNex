// Authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { getUserBranchContext } = require('../lib/branchContext');

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';

/**
 * Helper function to fetch privileges for a given role ID
 */
async function getPrivilegesByRole(roleId) {
    try {
        const [rows] = await pool.query(
            `SELECT p.privilegeName, p.module
             FROM roles r
             JOIN role_privileges rp ON r.roleId = rp.roleId
             JOIN privileges p ON rp.privilegeId = p.privilegeId
             WHERE r.roleId = ?
             ORDER BY p.module, p.privilegeName`,
            [roleId]
        );
        // Return array of objects with privilegeName and module
        return rows.map(row => ({
            privilegeName: row.privilegeName,
            module: row.module || null
        }));
    } catch (error) {
        console.error('Error fetching privileges:', error);
        return [];
    }
}

function parseLandingConfig(config) {
    if (!config) return null;
    let quickLinks = [];
    if (config.landingQuickLinks) {
        try {
            quickLinks = typeof config.landingQuickLinks === 'string'
                ? JSON.parse(config.landingQuickLinks)
                : config.landingQuickLinks;
            if (!Array.isArray(quickLinks)) quickLinks = [];
        } catch {
            quickLinks = [];
        }
    }
    return {
        type: config.landingPageType || 'dashboard',
        label: config.landingPageLabel || null,
        url: config.landingPageUrl || null,
        icon: config.landingPageIcon || 'Home',
        description: config.landingPageDescription || null,
        servicePoint: config.defaultServicePoint || null,
        quickLinks,
    };
}

async function getDashboardCardsByRole(roleId) {
    if (!roleId) return null;
    try {
        const [cardRows] = await pool.query(
            `SELECT cardId, isVisible FROM role_dashboard_cards WHERE roleId = ?`,
            [roleId]
        );
        if (cardRows.length === 0) return null;
        const dashboardCards = {};
        cardRows.forEach((row) => {
            dashboardCards[row.cardId] = row.isVisible;
        });
        return dashboardCards;
    } catch (error) {
        console.error('[AUTH] Error fetching dashboard cards:', error);
        return null;
    }
}

/**
 * Privileges, branches, dashboard cards, and landing config in parallel.
 * Landing fields come from the roles join on the user row when present.
 */
async function loadAuthSessionExtras(user) {
    const [privileges, branchContext, dashboardCards] = await Promise.all([
        getPrivilegesByRole(user.roleId),
        getUserBranchContext(pool, user.userId),
        getDashboardCardsByRole(user.roleId),
    ]);

    let landingConfig = null;
    if (user.roleId) {
        // Landing columns are included via roles JOIN on the user SELECT.
        landingConfig = parseLandingConfig(user);
    }

    return { privileges, branchContext, dashboardCards, landingConfig };
}

const USER_AUTH_SELECT = `
    SELECT
        u.*,
        r.roleName AS role,
        r.landingPageType,
        r.landingPageLabel,
        r.landingPageUrl,
        r.landingPageIcon,
        r.landingPageDescription,
        r.defaultServicePoint,
        r.landingQuickLinks
    FROM users u
    LEFT JOIN roles r ON u.roleId = r.roleId
`;

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Please provide username and password' });
    }

    try {
        const query = `
            ${USER_AUTH_SELECT}
            WHERE (u.username = ? OR u.email = ?) AND u.voided = 0 AND u.isActive = 1
        `;
        const [users] = await pool.execute(query, [username, username]);

        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const { privileges, branchContext, dashboardCards, landingConfig } =
            await loadAuthSessionExtras(user);

        // Don't block the response on lastLogin write
        pool.execute('UPDATE users SET lastLogin = NOW() WHERE userId = ?', [user.userId]).catch((err) => {
            console.warn('[AUTH LOGIN] lastLogin update failed:', err.message || err);
        });

        // Create JWT payload
        const payload = {
            user: {
                id: user.userId,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roleId: user.roleId,
                roleName: user.role,
                department: user.department,
                privileges: privileges,
                landingConfig: landingConfig,
                dashboardCards: dashboardCards,
                branches: branchContext.branches,
                defaultBranch: branchContext.defaultBranch,
                currentBranch: branchContext.currentBranch,
                canAccessAllBranches: branchContext.canAccessAllBranches
            }
        };

        // Sign token
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) {
                    return res.status(500).json({ error: 'Server error during token generation' });
                }
                res.json({
                    token,
                    user: {
                        id: user.userId,
                        username: user.username,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        role: user.role,
                        roleId: user.roleId,
                        department: user.department,
                        privileges: privileges,
                        landingConfig: landingConfig,
                        dashboardCards: dashboardCards,
                        branches: branchContext.branches,
                        defaultBranch: branchContext.defaultBranch,
                        currentBranch: branchContext.currentBranch,
                        canAccessAllBranches: branchContext.canAccessAllBranches
                    }
                });
            }
        );
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public (should be protected in production)
 */
router.post('/register', async (req, res) => {
    const { username, email, password, firstName, lastName, roleId, department } = req.body;

    if (!username || !email || !password || !firstName || !lastName || !roleId) {
        return res.status(400).json({ error: 'Please enter all required fields' });
    }

    let connection;
    try {
        // Check if user already exists
        const [existingUsers] = await pool.execute(
            'SELECT userId FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User with that username or email already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Insert user
        const [userResult] = await connection.execute(
            'INSERT INTO users (username, email, passwordHash, firstName, lastName, roleId, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, email, passwordHash, firstName, lastName, roleId, department || null]
        );
        const userId = userResult.insertId;

        // Get user privileges
        const privileges = await getPrivilegesByRole(roleId);

        await connection.commit();

        // Create JWT payload
        const payload = {
            user: {
                id: userId,
                username: username,
                email: email,
                roleId: roleId,
                privileges: privileges
            }
        };

        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) {
                    return res.status(500).json({ error: 'Server error during token generation' });
                }
                res.status(201).json({ 
                    message: 'User registered successfully',
                    token 
                });
            }
        );

    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Registration error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'User with that username or email already exists' });
        }
        res.status(500).json({ error: 'Server error during registration' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/**
 * @route   GET /api/auth/verify
 * @desc    Verify token and get user info
 * @access  Public
 */
router.get('/verify', async (req, res) => {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get fresh user data (include landing fields to avoid a second roles query)
        const [users] = await pool.execute(
            `${USER_AUTH_SELECT}
             WHERE u.userId = ? AND u.voided = 0 AND u.isActive = 1`,
            [decoded.user.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = users[0];
        const { privileges, branchContext, dashboardCards, landingConfig } =
            await loadAuthSessionExtras(user);

        res.json({
            user: {
                id: user.userId,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                roleId: user.roleId,
                department: user.department,
                privileges: privileges,
                landingConfig: landingConfig,
                dashboardCards: dashboardCards,
                branches: branchContext.branches,
                defaultBranch: branchContext.defaultBranch,
                currentBranch: branchContext.currentBranch,
                canAccessAllBranches: branchContext.canAccessAllBranches
            }
        });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;

