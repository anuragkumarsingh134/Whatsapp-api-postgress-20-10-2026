/**
 * In-memory Session and State Manager for Baileys WhatsApp Sockets.
 * 
 * Manages active WebSocket connections, QR data URLs, and auto-reconnect timers.
 * Prevents memory leaks by ensuring sockets, event emitters, and timeout references
 * are cleanly cleared when sessions are closed or recreated.
 */

const sessions = new Map();
const qrCodes = new Map();
const reconnectTimers = new Map();

/**
 * Retrieve the active Baileys socket for a device.
 * @param {string} deviceId
 * @returns {Object|null}
 */
function getSession(deviceId) {
    return sessions.get(deviceId) || null;
}

/**
 * Store an active Baileys socket for a device.
 * @param {string} deviceId
 * @param {Object} socket
 */
function setSession(deviceId, socket) {
    sessions.set(deviceId, socket);
}

/**
 * Check if an active session exists in memory.
 * @param {string} deviceId
 * @returns {boolean}
 */
function hasSession(deviceId) {
    return sessions.has(deviceId);
}

/**
 * Get all currently active session IDs.
 * @returns {string[]}
 */
function getAllSessionIds() {
    return Array.from(sessions.keys());
}

/**
 * Store QR code data URL for a device.
 * @param {string} deviceId
 * @param {string} qr
 */
function setQR(deviceId, qr) {
    qrCodes.set(deviceId, qr);
}

/**
 * Get the current QR code data URL for a device.
 * @param {string} deviceId
 * @returns {string|null}
 */
function getQR(deviceId) {
    return qrCodes.get(deviceId) || null;
}

/**
 * Clear QR code from memory once paired or closed.
 * @param {string} deviceId
 */
function clearQR(deviceId) {
    qrCodes.delete(deviceId);
}

/**
 * Register a scheduled reconnection timer for a device.
 * @param {string} deviceId
 * @param {NodeJS.Timeout} timer
 */
function setReconnectTimer(deviceId, timer) {
    clearReconnectTimer(deviceId);
    reconnectTimers.set(deviceId, timer);
}

/**
 * Cancel any pending reconnection timer for a device.
 * @param {string} deviceId
 */
function clearReconnectTimer(deviceId) {
    const timer = reconnectTimers.get(deviceId);
    if (timer) {
        clearTimeout(timer);
        reconnectTimers.delete(deviceId);
    }
}

/**
 * Cleans up and detaches event listeners from a socket to prevent memory leaks.
 * @param {Object} socket
 */
function cleanupSocket(socket) {
    if (!socket) return;
    try {
        if (socket.ev && typeof socket.ev.removeAllListeners === 'function') {
            socket.ev.removeAllListeners();
        }
        if (typeof socket.end === 'function') {
            socket.end();
        }
    } catch (_) {
        // Suppress cleanup errors during teardown
    }
}

/**
 * Completely remove a session from memory:
 * - Cancels pending reconnect timers
 * - Cleans and evicts socket
 * - Clears QR code
 * 
 * @param {string} deviceId
 */
function removeSession(deviceId) {
    clearReconnectTimer(deviceId);
    clearQR(deviceId);

    const socket = sessions.get(deviceId);
    if (socket) {
        cleanupSocket(socket);
        sessions.delete(deviceId);
    }
}

module.exports = {
    getSession,
    setSession,
    removeSession,
    hasSession,
    getAllSessionIds,
    setQR,
    getQR,
    clearQR,
    setReconnectTimer,
    clearReconnectTimer,
    cleanupSocket,
};
