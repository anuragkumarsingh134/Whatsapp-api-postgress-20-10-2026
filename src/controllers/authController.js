const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbGet, dbRun } = require('../config/db');

const SALT_ROUNDS = 10;
const DEFAULT_TRIAL_DAYS = 7;

/**
 * POST /auth/register
 * Body: { email, password }
 * 
 * First registered user is automatically elevated to 'admin' with unlimited quotas.
 * Subsequent users receive 'user' role with a 7-day trial and standard quotas.
 */
async function register(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // First user becomes system administrator
        const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
        const isFirstUser = parseInt(userCount?.count || '0', 10) === 0;

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const trialExpiry = isFirstUser
            ? null
            : new Date(Date.now() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const role = isFirstUser ? 'admin' : 'user';
        const deviceLimit = isFirstUser ? 999 : 3;
        const messageLimit = isFirstUser ? 999999 : 100;

        const result = await dbRun(
            `INSERT INTO users (email, password_hash, role, device_limit, message_limit, trial_expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [email, passwordHash, role, deviceLimit, messageLimit, trialExpiry]
        );

        return res.status(201).json({
            success: true,
            userId: result.lastID,
            role,
            message: isFirstUser
                ? 'Admin account created successfully'
                : `User registered successfully. Trial period: ${DEFAULT_TRIAL_DAYS} days.`,
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /auth/login
 * Body: { email, password }
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        if (!user.is_active) {
            return res.status(403).json({ success: false, error: 'Account has been disabled. Contact admin.' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                apiKey: user.api_key || null,
                deviceLimit: user.device_limit,
                messageLimit: user.message_limit,
                trialExpiresAt: user.trial_expires_at,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /auth/api-key
 * Requires JWT. Generates or regenerates a 16-byte (32-character hex) API key.
 */
async function generateApiKey(req, res) {
    try {
        const userId = req.user.id;
        const apiKey = crypto.randomBytes(16).toString('hex');

        await dbRun('UPDATE users SET api_key = ? WHERE id = ?', [apiKey, userId]);

        return res.json({
            success: true,
            apiKey,
            message: 'API key generated successfully',
        });
    } catch (err) {
        console.error('API key generation error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /auth/me
 * Returns the current authenticated user's profile and plan limits.
 */
async function getMe(req, res) {
    try {
        const userId = req.user.id;
        const user = await dbGet(
            `SELECT id, email, role, device_limit, message_limit, messages_sent_today, 
                    trial_expires_at, is_active, current_plan_id, plan_expires_at 
             FROM users WHERE id = ?`,
            [userId]
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        return res.json({ success: true, user });
    } catch (err) {
        console.error('Get me error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = {
    register,
    login,
    generateApiKey,
    getMe,
};
