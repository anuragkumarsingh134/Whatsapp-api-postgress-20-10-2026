const { dbGet } = require('../config/db');
const { isSubscriptionActive } = require('../services/quotaService');

/**
 * Trial/Plan expiry middleware.
 * Must be used AFTER authMiddleware (req.user must be set).
 * Admins are fully exempt from database check.
 * Attaches req.userRecord so subsequent controllers avoid re-querying user data.
 */
async function trialMiddleware(req, res, next) {
    try {
        // Fast-path: Admins bypass subscription checks without DB query
        if (req.user?.role === 'admin') {
            return next();
        }

        const user = await dbGet(
            'SELECT id, email, role, device_limit, message_limit, trial_expires_at, plan_expires_at, current_plan_id, is_active FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (!user.is_active) {
            return res.status(403).json({ success: false, error: 'Account has been disabled. Contact admin.' });
        }

        if (!isSubscriptionActive(user)) {
            return res.status(402).json({
                success: false,
                error: 'TRIAL_EXPIRED',
                message: 'Your trial has expired. Please contact the administrator to activate a plan.',
            });
        }

        // Cache user record for downstream handlers (e.g. device creation quota check)
        req.userRecord = user;
        next();
    } catch (err) {
        console.error('Trial middleware error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = trialMiddleware;
