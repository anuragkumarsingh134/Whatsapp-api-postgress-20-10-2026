/* ── Main Application Bootstrap & Navigation ────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    // Check initial auth state
    if (token && user) {
        showDashboard();
    } else {
        showAuth();
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
