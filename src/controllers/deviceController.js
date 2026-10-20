const { dbGet, dbRun, dbAll } = require('../config/db');
const whatsappService = require('../services/whatsappService');

/**
 * POST /device/create
 * Body: { deviceId, sessionName }
 * Requires JWT + active subscription (trialMiddleware).
 */
async function createDevice(req, res) {
    try {
        const { deviceId, sessionName } = req.body;
        const userId = req.user.id;

        if (!deviceId || typeof deviceId !== 'string') {
            return res.status(400).json({ success: false, error: 'deviceId is required' });
        }

        // Standardize: strip any +, spaces, dashes, parentheses
        const sanitizedDeviceId = deviceId.trim().replace(/[\s\+\-\(\)]/g, '');
        if (!/^\d{10,15}$/.test(sanitizedDeviceId)) {
            return res.status(400).json({
                success: false,
                error: 'Phone number must include country code (e.g. 918919007019)',
            });
        }

        // Enforce device limit using cached user record if available
        const user = req.userRecord || await dbGet('SELECT device_limit, role FROM users WHERE id = ?', [userId]);
        if (user && user.role !== 'admin') {
            const deviceCount = await dbGet('SELECT COUNT(*) as count FROM devices WHERE user_id = ?', [userId]);
            const currentCount = parseInt(deviceCount?.count || '0', 10);
            if (currentCount >= user.device_limit) {
                return res.status(403).json({
                    success: false,
                    error: `Device limit reached (${user.device_limit}). Contact admin to increase.`,
                });
            }
        }

        // Check if device already exists in the system
        const existing = await dbGet('SELECT id FROM devices WHERE device_id = ?', [sanitizedDeviceId]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Device ID already exists' });
        }

        // Create database record
        const finalSessionName = sessionName?.trim() || sanitizedDeviceId;
        await dbRun(
            'INSERT INTO devices (user_id, device_id, session_name, status) VALUES (?, ?, ?, ?)',
            [userId, sanitizedDeviceId, finalSessionName, 'pending']
        );

        // Initialize Baileys socket session
        await whatsappService.createSession(sanitizedDeviceId);

        return res.status(201).json({
            success: true,
            deviceId: sanitizedDeviceId,
            sessionName: finalSessionName,
            status: 'pending',
            message: 'Device created. Scan QR code to connect.',
        });
    } catch (err) {
        console.error('Create device error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/qr?deviceId=xxxx
 * Requires JWT. Fetches active base64 QR code for pairing.
 */
async function getQR(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        if (device.status === 'connected') {
            return res.json({ success: true, status: 'connected', qr: null, message: 'Device is already connected' });
        }

        const qrDataUrl = whatsappService.getQR(deviceId);
        if (!qrDataUrl) {
            return res.json({ success: true, qr: null, message: 'QR code not yet available. Try again in a few seconds.' });
        }

        return res.json({ success: true, qr: qrDataUrl });
    } catch (err) {
        console.error('Get QR error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/status?deviceId=xxxx
 * Requires JWT. Checks device connection status.
 */
async function getStatus(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        return res.json({
            success: true,
            deviceId: device.device_id,
            sessionName: device.session_name,
            status: device.status,
            createdAt: device.created_at,
        });
    } catch (err) {
        console.error('Get status error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/list
 * Requires JWT. Lists all devices registered to the authenticated user.
 */
async function listDevices(req, res) {
    try {
        const userId = req.user.id;
        const devices = await dbAll(
            'SELECT device_id, session_name, status, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );

        return res.json({ success: true, devices });
    } catch (err) {
        console.error('List devices error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * DELETE /device/delete?deviceId=xxxx
 * Requires JWT. Closes Baileys socket, cleans auth credentials, and removes database rows.
 */
async function deleteDevice(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        // Close Baileys session and remove Redis auth state
        await whatsappService.deleteSession(deviceId);

        // Delete message logs and device row
        await dbRun('DELETE FROM messages WHERE device_id = ?', [deviceId]);
        await dbRun('DELETE FROM devices WHERE device_id = ?', [deviceId]);

        return res.json({
            success: true,
            message: `Device ${deviceId} and all its data have been deleted`,
        });
    } catch (err) {
        console.error('Delete device error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/profile-photo?deviceId=xxxx
 * Requires JWT. Fetches WhatsApp profile photo URL for a connected device.
 */
async function getProfilePhoto(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        if (device.status !== 'connected') {
            return res.status(400).json({ success: false, error: 'Device is not connected' });
        }

        const photoUrl = await whatsappService.getProfilePicture(deviceId);

        return res.json({
            success: true,
            deviceId,
            profilePhoto: photoUrl,
            message: photoUrl ? 'Profile photo retrieved' : 'No profile photo set',
        });
    } catch (err) {
        console.error('Get profile photo error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = {
    createDevice,
    getQR,
    getStatus,
    listDevices,
    deleteDevice,
    getProfilePhoto,
};
