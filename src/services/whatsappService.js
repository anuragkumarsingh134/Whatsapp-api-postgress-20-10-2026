const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const qrcode = require('qrcode');
const { dbRun, dbAll } = require('../config/db');
const sessionManager = require('./sessionManager');
const { useRedisAuthState, purgeRedisAuthState } = require('../utils/useRedisAuthState');

const logger = pino({ level: 'silent' });
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const RECONNECT_DELAY_MS = 5000;

/**
 * Downloads a media asset from a remote HTTPS URL with strict size and content-type validation.
 * 
 * @param {string} url - Remote asset URL (must use HTTPS)
 * @param {string|RegExp} mimeValidator - Required MIME string pattern (e.g. 'application/pdf' or /^image\//)
 * @param {string} typeLabel - Descriptive label for error reporting (e.g. 'PDF' or 'image')
 * @returns {Promise<Buffer>} Validated binary file buffer
 */
async function downloadMediaBuffer(url, mimeValidator, typeLabel) {
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
        throw new Error(`${typeLabel} URL must use HTTPS`);
    }

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        maxContentLength: MAX_FILE_SIZE,
        timeout: 30000,
        headers: { 'User-Agent': 'WhatsApp-API/1.0' },
    });

    const contentType = response.headers['content-type'] || '';
    const isValidMime = typeof mimeValidator === 'string'
        ? contentType.includes(mimeValidator)
        : mimeValidator.test(contentType);

    if (!isValidMime) {
        throw new Error(`Invalid content type: "${contentType}". Only ${typeLabel} files are supported.`);
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    return buffer;
}

/**
 * Format a phone number or Group ID into a valid WhatsApp JID.
 * 
 * @param {string} number - Phone number with country code or Group JID
 * @returns {string} Fully qualified JID (e.g. 919876543210@s.whatsapp.net or 123-456@g.us)
 */
function formatJID(number) {
    if (number.includes('@')) {
        return number;
    }
    const clean = number.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
}

/**
 * Create or reconnect a Baileys WhatsApp session for a device.
 * 
 * Manages socket initialization, credential storage, QR emission, and reconnect timers.
 * 
 * @param {string} deviceId - Unique device identifier (phone number)
 * @returns {Promise<Object>} Active WASocket instance
 */
async function createSession(deviceId) {
    // Cancel any existing reconnect timers for this device
    sessionManager.clearReconnectTimer(deviceId);

    // Evict any previous socket from memory to prevent duplicate event listeners
    const existingSocket = sessionManager.getSession(deviceId);
    if (existingSocket) {
        sessionManager.cleanupSocket(existingSocket);
    }

    const { state, saveCreds } = await useRedisAuthState(deviceId);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
    });

    // Connection lifecycle observer
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                const qrDataUrl = await qrcode.toDataURL(qr);
                sessionManager.setQR(deviceId, qrDataUrl);
                console.log(`[${deviceId}] QR code generated`);
            } catch (err) {
                console.error(`[${deviceId}] QR generation error:`, err.message);
            }
        }

        if (connection === 'open') {
            console.log(`[${deviceId}] Connected to WhatsApp`);
            sessionManager.clearQR(deviceId);
            sessionManager.clearReconnectTimer(deviceId);
            await dbRun('UPDATE devices SET status = ? WHERE device_id = ?', ['connected', deviceId]);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOut;

            console.log(`[${deviceId}] Connection closed (status: ${statusCode}, shouldReconnect: ${shouldReconnect})`);
            sessionManager.removeSession(deviceId);

            if (shouldReconnect) {
                await dbRun('UPDATE devices SET status = ? WHERE device_id = ?', ['disconnected', deviceId]);

                // Schedule managed reconnection with timer tracking
                const timer = setTimeout(() => {
                    console.log(`[${deviceId}] Attempting reconnection...`);
                    createSession(deviceId).catch((err) => {
                        console.error(`[${deviceId}] Reconnection failed:`, err.message);
                    });
                }, RECONNECT_DELAY_MS);

                sessionManager.setReconnectTimer(deviceId, timer);
            } else {
                // Device was logged out from WhatsApp client — purge auth credentials from Redis
                await dbRun('UPDATE devices SET status = ? WHERE device_id = ?', ['pending', deviceId]);
                await purgeRedisAuthState(deviceId);
            }
        }
    });

    // Save auth credentials whenever updated
    socket.ev.on('creds.update', saveCreds);

    // Register active socket in session manager
    sessionManager.setSession(deviceId, socket);

    return socket;
}

/**
 * Retrieve QR code as base64 Data URL for a pending device.
 * @param {string} deviceId
 * @returns {string|null}
 */
function getQR(deviceId) {
    return sessionManager.getQR(deviceId);
}

/**
 * Fetch profile picture URL for a connected device.
 * @param {string} deviceId
 * @returns {Promise<string|null>}
 */
async function getProfilePicture(deviceId) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) return null;
    try {
        const jid = socket.user?.id;
        if (!jid) return null;
        const url = await socket.profilePictureUrl(jid, 'image');
        return url || null;
    } catch (_) {
        return null;
    }
}

/**
 * Send a plain-text message via an active Baileys socket.
 * 
 * @param {string} deviceId - Connected device ID
 * @param {string} number - Recipient phone number or Group JID
 * @param {string} message - Text message content
 * @returns {Promise<{ messageId: string, status: string }>}
 */
async function sendTextMessage(deviceId, number, message) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) {
        throw new Error('Session not found or not connected');
    }

    const jid = formatJID(number);
    const result = await socket.sendMessage(jid, { text: message });

    await dbRun(
        'INSERT INTO messages (device_id, recipient, message_type, status, message_id) VALUES (?, ?, ?, ?, ?)',
        [deviceId, number, 'text', 'sent', result.key.id]
    );

    return { messageId: result.key.id, status: 'sent' };
}

/**
 * Download and send a PDF document via an active Baileys socket.
 * 
 * @param {string} deviceId - Connected device ID
 * @param {string} number - Recipient phone number or Group JID
 * @param {string} url - HTTPS URL pointing to the PDF document
 * @param {string} fileName - Destination document file name
 * @returns {Promise<{ messageId: string, status: string }>}
 */
async function sendFileMessage(deviceId, number, url, fileName) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) {
        throw new Error('Session not found or not connected');
    }

    const fileBuffer = await downloadMediaBuffer(url, 'application/pdf', 'PDF');
    const jid = formatJID(number);
    const finalFileName = fileName || 'document.pdf';

    const result = await socket.sendMessage(jid, {
        document: fileBuffer,
        mimetype: 'application/pdf',
        fileName: finalFileName,
        caption: finalFileName,
    });

    await dbRun(
        'INSERT INTO messages (device_id, recipient, message_type, status, message_id) VALUES (?, ?, ?, ?, ?)',
        [deviceId, number, 'file', 'sent', result.key.id]
    );

    return { messageId: result.key.id, status: 'sent' };
}

/**
 * Download and send an image file via an active Baileys socket.
 * 
 * @param {string} deviceId - Connected device ID
 * @param {string} number - Recipient phone number or Group JID
 * @param {string} url - HTTPS URL pointing to the image
 * @param {string} [caption] - Optional caption for the image
 * @returns {Promise<{ messageId: string, status: string }>}
 */
async function sendImageMessage(deviceId, number, url, caption) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) {
        throw new Error('Session not found or not connected');
    }

    const imageBuffer = await downloadMediaBuffer(url, /^image\//, 'image');
    const jid = formatJID(number);

    const result = await socket.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || '',
    });

    await dbRun(
        'INSERT INTO messages (device_id, recipient, message_type, status, message_id) VALUES (?, ?, ?, ?, ?)',
        [deviceId, number, 'image', 'sent', result.key.id]
    );

    return { messageId: result.key.id, status: 'sent' };
}

/**
 * Fetch all WhatsApp groups that the connected device participates in.
 * 
 * @param {string} deviceId - Connected device ID
 * @returns {Promise<Array<{ id: string, subject: string, creation: number, owner: string, desc: string, participantsCount: number }>>}
 */
async function getGroups(deviceId) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) {
        throw new Error('Session not found or not connected');
    }

    const groups = await socket.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
        id: g.id,
        subject: g.subject,
        creation: g.creation,
        owner: g.owner,
        desc: g.desc,
        participantsCount: g.participants?.length || 0,
    }));
}

/**
 * Restore all previously connected or disconnected sessions on server startup.
 */
async function restoreAllSessions() {
    try {
        const devices = await dbAll("SELECT device_id FROM devices WHERE status IN ('connected', 'disconnected')");
        console.log(`Restoring ${devices.length} session(s)...`);

        for (const device of devices) {
            try {
                await createSession(device.device_id);
                console.log(`[${device.device_id}] Session restore initiated`);
            } catch (err) {
                console.error(`[${device.device_id}] Failed to restore session:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error restoring sessions:', err.message);
    }
}

/**
 * Permanently delete a device session:
 * - Cancels pending reconnect timers
 * - Closes WebSocket and logs out from WhatsApp
 * - Removes state from memory
 * - Purges auth state directory from disk
 * 
 * @param {string} deviceId - Device identifier to delete
 */
async function deleteSession(deviceId) {
    const socket = sessionManager.getSession(deviceId);
    if (socket) {
        try {
            socket.ev.removeAllListeners();
            await socket.logout().catch(() => { });
            socket.end();
        } catch (_) { }
    }

    sessionManager.removeSession(deviceId);

    // Purge auth credentials from Redis
    await purgeRedisAuthState(deviceId);

    console.log(`[${deviceId}] Session deleted and cleaned up`);
}

module.exports = {
    createSession,
    getQR,
    getProfilePicture,
    sendTextMessage,
    sendFileMessage,
    sendImageMessage,
    getGroups,
    restoreAllSessions,
    deleteSession,
    formatJID,
};
