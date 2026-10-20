const { dbGet } = require('../config/db');
const { isSubscriptionActive } = require('../services/quotaService');

/**
 * API Key middleware for message endpoints.
 * Reads `apiKey` and `deviceId` from query string.
 * Validates:
 * 1. API key existence and account active status
 * 2. Subscription validity (active trial or paid plan) via quotaService
 * 3. Device existence and ownership by the key holder
 * 4. Device connectivity state (must be 'connected')
 * 
 * Sets req.apiUser (fully hydrated with message limits) and req.device on success.
 */
async function apiKeyMiddleware(req, res, next) {
    try {
        const { apiKey, deviceId } = req.query;

        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'Missing apiKey parameter' });
        }

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'Missing deviceId parameter' });
        }

        // Look up user by API key (include subscription and message limit fields)
        const user = await dbGet(
            `SELECT id, email, role, device_limit, message_limit, messages_sent_today, 
                    last_message_reset, trial_expires_at, plan_expires_at, current_plan_id, is_active 
             FROM users WHERE api_key = ?`,
            [apiKey]
        );

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid API key' });
        }

        if (!user.is_active) {
            return res.status(403).json({ success: false, error: 'Account has been disabled. Contact admin.' });
        }

        // Validate trial/plan expiration
        if (!isSubscriptionActive(user)) {
            return res.status(402).json({
                success: false,
                error: 'TRIAL_EXPIRED',
                message: 'Trial has expired. Please contact the administrator to activate a plan.',
            });
        }

        // Look up device and verify ownership
        const device = await dbGet('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }

        if (device.user_id !== user.id) {
            return res.status(403).json({ success: false, error: 'Device does not belong to this API key owner' });
        }

        if (device.status !== 'connected') {
            return res.status(404).json({ success: false, error: `Device is not connected. Current status: ${device.status}` });
        }

        req.apiUser = user;
        req.device = device;
        next();
    } catch (err) {
        console.error('API Key middleware error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = apiKeyMiddleware;
