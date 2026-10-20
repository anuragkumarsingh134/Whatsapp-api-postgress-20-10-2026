/**
 * Message Controller — Legacy GET Messaging Pipeline
 * 
 * DESIGN RATIONALE:
 * This controller provides URL-query-based HTTP GET endpoints for outbound WhatsApp messaging.
 * While modern APIs commonly utilize JSON POST bodies, many legacy enterprise systems,
 * accounting applications (e.g. Tally), CRMs, webhooks, and IoT microcontrollers
 * can only perform simple HTTP GET requests with query parameters.
 * 
 * PIPELINE WORKFLOW:
 * 1. apiKeyMiddleware:
 *    - Validates ?apiKey=xxx and ?deviceId=yyy
 *    - Validates device ownership (device.user_id === user.id)
 *    - Validates active session state (device.status === 'connected')
 *    - Hydrates req.apiUser and req.device
 * 2. Daily Quota Check:
 *    - Resets counter if a new UTC calendar day has begun
 *    - Rejects request if daily limit reached (HTTP 429)
 * 3. Payload Processing:
 *    - Validates recipient phone number (e.g. 919876543210) or WhatsApp Group JID (e.g. 1203630123@g.us)
 *    - Downloads and verifies media if applicable (HTTPS only, 15MB limit, strict MIME validation)
 *    - Dispatches payload through active Baileys socket
 * 4. Audit & Tracking:
 *    - Persists message receipt and unique messageId in `messages` table
 *    - Increments `users.messages_sent_today`
 */

const whatsappService = require('../services/whatsappService');
const {
    checkAndResetDailyCounter,
    incrementMessageCounter,
    checkMessageQuota,
} = require('../services/quotaService');

/**
 * Normalizes and cleans recipient identifiers:
 * - If phone number: strips +, -, spaces, parentheses, leaving digits with country code.
 * - If Group JID: trims whitespace while preserving @g.us.
 * 
 * @param {string} number - Input phone or group string
 * @returns {string} Sanitized recipient string
 */
function normalizeRecipient(number) {
    if (!number || typeof number !== 'string') return '';
    const trimmed = number.trim();
    if (trimmed.includes('@')) {
        return trimmed;
    }
    return trimmed.replace(/[\s\+\-\(\)]/g, '');
}

/**
 * Validates recipient identifier:
 * - Phone numbers must be 10 to 15 digits including country code (e.g. 918919007019).
 * - Group JIDs must be valid WhatsApp group identifiers (e.g. 120363012345@g.us).
 * 
 * @param {string} number - Input phone or group string
 * @returns {string|null} Error string if invalid, or null if valid
 */
function validateRecipient(number) {
    if (!number || typeof number !== 'string' || number.trim().length === 0) {
        return 'Missing number parameter';
    }
    const clean = normalizeRecipient(number);
    if (clean.includes('@')) {
        if (!/^[a-zA-Z0-9\-_.]+@g\.us$/.test(clean) && !/^[a-zA-Z0-9\-_.]+@s\.whatsapp\.net$/.test(clean)) {
            return 'Invalid WhatsApp Group ID format (expected e.g. 120363012345@g.us)';
        }
        return null;
    }
    if (!/^\d{10,15}$/.test(clean)) {
        return 'Phone number must include country code (e.g. 918919007019) or be a valid Group ID (e.g. 120363012345@g.us)';
    }
    return null;
}

/**
 * GET /api/messages/send-text
 * Query params:
 *   - deviceId {string} (required): The connected device ID
 *   - apiKey {string} (required): User API key
 *   - number {string} (required): Destination phone number with country code (e.g. 918919007019) or Group JID
 *   - message {string} (required): Plain text message content
 */
async function sendText(req, res) {
    try {
        const { number, message } = req.query;
        const deviceId = req.device.device_id;
        const userId = req.apiUser.id;

        const recipientError = validateRecipient(number);
        if (recipientError) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: recipientError });
        }

        const cleanRecipient = normalizeRecipient(number);

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Message cannot be empty' });
        }

        // Enforce daily message quota (using cached user object from apiKeyMiddleware)
        const user = await checkAndResetDailyCounter(userId, req.apiUser);
        const quota = checkMessageQuota(user);
        if (!quota.allowed) {
            return res.status(429).json({ success: false, messageId: null, status: 'failed', error: quota.error });
        }

        const result = await whatsappService.sendTextMessage(deviceId, cleanRecipient, message);

        await incrementMessageCounter(userId);

        return res.json({
            success: true,
            messageId: result.messageId,
            status: result.status,
            error: null,
        });
    } catch (err) {
        console.error('Send text error:', err);
        return res.status(500).json({
            success: false,
            messageId: null,
            status: 'failed',
            error: err.message || 'Internal server error',
        });
    }
}

/**
 * GET /api/messages/send-file
 * Query params:
 *   - deviceId {string} (required): The connected device ID
 *   - apiKey {string} (required): User API key
 *   - number {string} (required): Destination phone number or Group JID
 *   - url {string} (required): Remote HTTPS URL pointing to the PDF document
 *   - fileName {string} (required): Desired file name for the attachment
 */
async function sendFile(req, res) {
    try {
        const { number, url, fileName } = req.query;
        const deviceId = req.device.device_id;
        const userId = req.apiUser.id;

        const recipientError = validateRecipient(number);
        if (recipientError) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: recipientError });
        }

        if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'File URL must be a valid HTTPS URL' });
        }

        if (!fileName || fileName.trim().length === 0) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing fileName parameter' });
        }

        const user = await checkAndResetDailyCounter(userId, req.apiUser);
        const quota = checkMessageQuota(user);
        if (!quota.allowed) {
            return res.status(429).json({ success: false, messageId: null, status: 'failed', error: quota.error });
        }

        const cleanRecipient = normalizeRecipient(number);

        const result = await whatsappService.sendFileMessage(deviceId, cleanRecipient, url, fileName.trim());

        await incrementMessageCounter(userId);

        return res.json({
            success: true,
            messageId: result.messageId,
            status: result.status,
            error: null,
        });
    } catch (err) {
        console.error('Send file error:', err);
        return res.status(500).json({
            success: false,
            messageId: null,
            status: 'failed',
            error: err.message || 'Internal server error',
        });
    }
}

/**
 * GET /api/messages/send-image
 * Query params:
 *   - deviceId {string} (required): The connected device ID
 *   - apiKey {string} (required): User API key
 *   - number {string} (required): Destination phone number with country code (e.g. 918919007019) or Group JID
 *   - url {string} (required): Remote HTTPS URL pointing to the image
 *   - caption {string} (optional): Image caption text
 */
async function sendImage(req, res) {
    try {
        const { number, url, caption } = req.query;
        const deviceId = req.device.device_id;
        const userId = req.apiUser.id;

        const recipientError = validateRecipient(number);
        if (recipientError) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: recipientError });
        }

        const cleanRecipient = normalizeRecipient(number);

        if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Image URL must be a valid HTTPS URL' });
        }

        const user = await checkAndResetDailyCounter(userId, req.apiUser);
        const quota = checkMessageQuota(user);
        if (!quota.allowed) {
            return res.status(429).json({ success: false, messageId: null, status: 'failed', error: quota.error });
        }

        const result = await whatsappService.sendImageMessage(deviceId, cleanRecipient, url, caption);

        await incrementMessageCounter(userId);

        return res.json({
            success: true,
            messageId: result.messageId,
            status: result.status,
            error: null,
        });
    } catch (err) {
        console.error('Send image error:', err);
        return res.status(500).json({
            success: false,
            messageId: null,
            status: 'failed',
            error: err.message || 'Internal server error',
        });
    }
}

/**
 * GET /api/messages/groups
 * Query params:
 *   - deviceId {string} (required): The connected device ID
 *   - apiKey {string} (required): User API key
 */
async function getGroups(req, res) {
    try {
        const deviceId = req.device.device_id;
        const groups = await whatsappService.getGroups(deviceId);

        return res.json({
            success: true,
            groups,
            error: null,
        });
    } catch (err) {
        console.error('Get groups error:', err);
        return res.status(500).json({
            success: false,
            groups: null,
            error: err.message || 'Internal server error',
        });
    }
}

module.exports = {
    sendText,
    sendFile,
    sendImage,
    getGroups,
};
