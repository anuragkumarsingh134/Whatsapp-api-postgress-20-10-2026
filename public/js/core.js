/* ── Core Constants, Utilities & Notifications ─────────────────── */

// Safe global application variables across modules and cached scripts
window.API = window.API || window.location.origin;
var API = window.API;
window.token = window.token || localStorage.getItem('wa_token');
var token = window.token;
window.user = window.user || JSON.parse(localStorage.getItem('wa_user') || 'null');
var user = window.user;
var qrInterval = window.qrInterval || null;

/**
 * Decodes and inspects JWT payload to verify if token is expired.
 */
function isTokenExpired(tokenStr) {
    if (!tokenStr || typeof tokenStr !== 'string') return true;
    try {
        const parts = tokenStr.split('.');
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload.exp) return false;
        return Math.floor(Date.now() / 1000) >= payload.exp;
    } catch (e) {
        return true;
    }
}

/**
 * Handles automatic logout & session termination.
 * Clears credentials, stores notice, and routes automatically to the landing page.
 */
function handleSessionExpired(reason = 'Your session has expired. Please sign in again.') {
    window.token = null;
    token = null;
    window.user = null;
    user = null;
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_user');
    localStorage.removeItem('wa_last_activity');
    if (reason) {
        sessionStorage.setItem('auth_notice', reason);
    }
    window.location.href = '/';
}

/**
 * Global fetch interceptor: automatically logs out and redirects to landing page on 401 Unauthorized.
 */
const _origFetch = window.fetch;
window.fetch = async function(...args) {
    const res = await _origFetch.apply(this, args);
    if (res.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
            handleSessionExpired('Session expired or invalid. Please sign in again.');
        }
    }
    return res;
};

/**
 * Inactivity session timeout manager (Standard 30-minute idle limit).
 */
let _inactivityTimer = null;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function resetInactivityTimer() {
    localStorage.setItem('wa_last_activity', Date.now().toString());
    if (_inactivityTimer) clearTimeout(_inactivityTimer);
    if (window.token) {
        _inactivityTimer = setTimeout(() => {
            handleSessionExpired('You have been logged out due to 30 minutes of inactivity.');
        }, IDLE_TIMEOUT_MS);
    }
}

function initInactivityTimer() {
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && window.token) {
            const lastActive = parseInt(localStorage.getItem('wa_last_activity') || '0', 10);
            if (lastActive && (Date.now() - lastActive > IDLE_TIMEOUT_MS)) {
                handleSessionExpired('You were signed out due to inactivity.');
                return;
            }
            if (isTokenExpired(window.token)) {
                handleSessionExpired('Your session has expired. Please sign in again.');
                return;
            }
            resetInactivityTimer();
        }
    });

    resetInactivityTimer();
}

/**
 * Normalizes phone number input:
 * - If Group JID (contains @), retains as-is.
 * - If phone number, strips +, -, spaces, parentheses.
 */
function normalizePhoneNumber(input) {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();
    if (trimmed.includes('@')) {
        return trimmed;
    }
    return trimmed.replace(/[\s\+\-\(\)]/g, '');
}

/**
 * Escapes plain text for safe HTML rendering.
 */
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

/**
 * Escapes characters for HTML code blocks.
 */
function escHtml(s) {
    return (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Returns badge class based on device status.
 */
function statusBadge(status) {
    if (status === 'connected') return 'badge-green';
    if (status === 'disconnected') return 'badge-red';
    return 'badge-yellow';
}

/**
 * Shows temporary toast notification.
 */
function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

/**
 * Close modal by element ID.
 */
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

/**
 * Overlay click handler to close modals.
 */
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.add('hidden');
        if (typeof stopQrPolling === 'function') {
            stopQrPolling();
        }
    }
});

/**
 * Shows contact administrator modal when trial expires.
 */
function showTrialExpiredPopup() {
    const modal = document.getElementById('contactAdminModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * Checks for TRIAL_EXPIRED error code and opens contact modal if found.
 */
function checkTrialExpired(data) {
    if (!data.success && data.error === 'TRIAL_EXPIRED') {
        showTrialExpiredPopup();
        return true;
    }
    return false;
}

/**
 * Inserts top banner warning users that their trial has expired.
 */
function showTrialBanner() {
    if (document.getElementById('trialExpiredBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'trialExpiredBanner';
    banner.style.cssText = 'background:#ef4444;color:#fff;text-align:center;padding:.6rem 1rem;font-size:.85rem;font-weight:600;position:sticky;top:0;z-index:100;';
    banner.innerHTML = '⚠️ Your trial has expired. <a onclick="showTrialExpiredPopup()" style="color:#fff;text-decoration:underline;cursor:pointer;">Contact administrator</a> to activate a plan.';
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.prepend(banner);
}
