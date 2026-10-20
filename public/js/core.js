/* ── Core Constants, Utilities & Notifications ─────────────────── */

const API = window.location.origin;
let token = localStorage.getItem('wa_token');
let user = JSON.parse(localStorage.getItem('wa_user') || 'null');
let qrInterval = null;

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
