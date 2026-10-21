/* ── Main Application Bootstrap & Navigation ────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    // Check initial auth state, token expiration, and idle timeout
    if (token && user && !isTokenExpired(token)) {
        const lastActive = parseInt(localStorage.getItem('wa_last_activity') || '0', 10);
        const MAX_IDLE_MS = 30 * 60 * 1000; // 30 minutes standard idle timeout
        if (lastActive && (Date.now() - lastActive > MAX_IDLE_MS)) {
            handleSessionExpired('You were signed out due to 30 minutes of inactivity.');
            return;
        }

        // Active session verified
        localStorage.setItem('wa_last_activity', Date.now().toString());
        if (typeof initInactivityTimer === 'function') {
            initInactivityTimer();
        }
        showDashboard();
    } else {
        // If expired or invalid token existed in storage, clear it
        if (token) {
            handleSessionExpired('Your session has expired. Please sign in again.');
            return;
        }

        // Handle hash-based entry from landing page buttons (#login or #register)
        const hash = window.location.hash;
        if (hash === '#register' || hash === '#login') {
            showAuth();
            if (hash === '#register') {
                showRegister();
            } else {
                showLogin();
            }
            if (hash) history.replaceState(null, '', window.location.pathname);
        } else {
            // Unauthenticated user without hash — automatically route to the landing page
            window.location.href = '/';
            return;
        }
    }

    // Attach form event listeners safely
    const formBindings = [
        { id: 'loginForm', handler: handleLogin },
        { id: 'registerForm', handler: handleRegister },
        { id: 'createDeviceForm', handler: handleCreateDevice },
        { id: 'sendTextForm', handler: handleSendText },
        { id: 'sendFileForm', handler: handleSendFile },
        { id: 'sendImageForm', handler: handleSendImage },
        { id: 'fetchGroupsForm', handler: handleFetchGroups },
        { id: 'editUserForm', handler: handleEditUser },
        { id: 'createPlanForm', handler: handleCreatePlan },
        { id: 'editPlanForm', handler: handleEditPlan },
    ];

    formBindings.forEach(({ id, handler }) => {
        const el = document.getElementById(id);
        if (el && typeof handler === 'function') {
            el.addEventListener('submit', handler);
        }
    });
});

/**
 * Switches the active section in the main dashboard view.
 */
function switchSection(section) {
    document.querySelectorAll('.main-content > section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const sectionMap = {
        devices: 'sectionDevices',
        sendMessage: 'sectionSendMessage',
        apiKey: 'sectionApiKey',
        docs: 'sectionDocs',
        plans: 'sectionPlans',
        admin: 'sectionAdmin'
    };

    const targetSection = document.getElementById(sectionMap[section]);
    if (targetSection) targetSection.classList.remove('hidden');

    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');

    // Refresh context-sensitive data
    if (section === 'devices' && typeof loadDevices === 'function') loadDevices();
    if (section === 'sendMessage' && typeof loadDevices === 'function') loadDevices();
    if (section === 'docs' && typeof renderDocs === 'function') renderDocs();
    if (section === 'plans' && typeof loadPlans === 'function') loadPlans();
    if (section === 'admin') {
        if (typeof loadAdminUsers === 'function') loadAdminUsers();
        if (typeof loadAdminPlans === 'function') loadAdminPlans();
    }

    closeSidebar();
}

/**
 * Toggles sidebar visibility on mobile devices.
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('visible');
}

/**
 * Closes the mobile sidebar and its overlay.
 */
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
}
