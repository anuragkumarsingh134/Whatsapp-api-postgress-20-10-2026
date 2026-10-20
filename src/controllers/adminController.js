const { dbGet, dbRun, dbAll } = require('../config/db');
const whatsappService = require('../services/whatsappService');

/**
 * GET /admin/users
 * List all users with aggregated device count and message stats.
 */
async function listUsers(req, res) {
    try {
        const users = await dbAll(`
            SELECT u.id, u.email, u.role, u.device_limit, u.message_limit,
                   u.messages_sent_today, u.trial_expires_at, u.is_active, u.created_at, u.api_key,
                   (SELECT COUNT(*) FROM devices WHERE user_id = u.id) as device_count
            FROM users u
            ORDER BY u.created_at DESC
        `);

        return res.json({ success: true, users });
    } catch (err) {
        console.error('List users error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /admin/users/:id
 * Get single user details with their registered devices and total message count.
 */
async function getUser(req, res) {
    try {
        const userId = req.params.id;
        const user = await dbGet(`
            SELECT id, email, role, device_limit, message_limit,
                   messages_sent_today, trial_expires_at, is_active, created_at, api_key
            FROM users WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const devices = await dbAll('SELECT device_id, session_name, status, created_at FROM devices WHERE user_id = ?', [userId]);
        const messageCount = await dbGet('SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = ?)', [userId]);

        return res.json({
            success: true,
            user: { ...user, devices, totalMessages: parseInt(messageCount?.count || '0', 10) },
        });
    } catch (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * PUT /admin/users/:id
 * Update user quotas, role, trial expiry, or active state.
 * Body: { deviceLimit, messageLimit, trialExpiresAt, isActive, role }
 */
async function updateUser(req, res) {
    try {
        const userId = req.params.id;
        const { deviceLimit, messageLimit, trialExpiresAt, isActive, role } = req.body;

        const user = await dbGet('SELECT id, role FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Prevent admin from accidentally demoting their own role
        if (user.id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ success: false, error: 'Cannot change your own admin role' });
        }

        const updates = [];
        const params = [];

        if (deviceLimit !== undefined) {
            updates.push('device_limit = ?');
            params.push(parseInt(deviceLimit, 10));
        }
        if (messageLimit !== undefined) {
            updates.push('message_limit = ?');
            params.push(parseInt(messageLimit, 10));
        }
        if (trialExpiresAt !== undefined) {
            updates.push('trial_expires_at = ?');
            params.push(trialExpiresAt || null);
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive ? true : false);
        }
        if (role !== undefined) {
            updates.push('role = ?');
            params.push(role);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        params.push(userId);
        await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        return res.json({ success: true, message: 'User updated successfully' });
    } catch (err) {
        console.error('Update user error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * DELETE /admin/users/:id
 * Cascading user deletion:
 * 1. Closes and purges all active Baileys socket sessions from memory and Redis.
 * 2. Deletes message audit logs.
 * 3. Deletes device records.
 * 4. Deletes user account.
 */
async function deleteUser(req, res) {
    try {
        const userId = req.params.id;

        if (parseInt(userId, 10) === req.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }

        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Teardown any running Baileys sessions for this user
        const devices = await dbAll('SELECT device_id FROM devices WHERE user_id = ?', [userId]);
        for (const device of devices) {
            await whatsappService.deleteSession(device.device_id);
        }

        // Delete user's messages, devices, and record
        await dbRun('DELETE FROM messages WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = ?)', [userId]);
        await dbRun('DELETE FROM devices WHERE user_id = ?', [userId]);
        await dbRun('DELETE FROM users WHERE id = ?', [userId]);

        return res.json({ success: true, message: 'User and all associated sessions and data deleted' });
    } catch (err) {
        console.error('Delete user error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /admin/users/:id/reset-counter
 * Reset daily message counter for a user to 0.
 */
async function resetMessageCounter(req, res) {
    try {
        const userId = req.params.id;

        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await dbRun('UPDATE users SET messages_sent_today = 0 WHERE id = ?', [userId]);

        return res.json({ success: true, message: 'Message counter reset' });
    } catch (err) {
        console.error('Reset counter error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /admin/settings
 * Retrieve app configuration settings (Cashfree keys, etc.).
 */
async function getSettings(req, res) {
    try {
        const settings = await dbAll(`SELECT * FROM settings WHERE setting_key LIKE 'cashfree_%'`);
        const conf = {};
        settings.forEach((s) => {
            conf[s.setting_key] = s.setting_value;
        });

        return res.json({ success: true, settings: conf });
    } catch (err) {
        console.error('Get settings error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * PUT /admin/settings
 * Upsert configuration settings in PostgreSQL.
 */
async function updateSettings(req, res) {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid settings object' });
        }

        for (const [key, value] of Object.entries(settings)) {
            await dbRun(
                `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
                 ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
                [key, String(value)]
            );
        }

        return res.json({ success: true, message: 'Settings updated successfully' });
    } catch (err) {
        console.error('Update settings error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = {
    listUsers,
    getUser,
    updateUser,
    deleteUser,
    resetMessageCounter,
    getSettings,
    updateSettings,
};
