/**
 * Admin-only middleware. Must be used AFTER authMiddleware.
 * Checks that the authenticated user has role = 'admin'.
 */
const { dbGet } = require('../config/db');

async function adminMiddleware(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        // Verify admin account remains active in DB
        const user = req.userRecord || await dbGet('SELECT role, is_active FROM users WHERE id = ?', [req.user.id]);
        if (!user || user.role !== 'admin' || !user.is_active) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        req.userRecord = user;
        next();
    } catch (err) {
        console.error('Admin middleware error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = adminMiddleware;
