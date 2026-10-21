/* ── Authentication & Session Management ────────────────────── */

function showAuth() {
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');

    // Show admin nav item only for admins
    if (user?.role === 'admin') {
        const adminNav = document.getElementById('adminNavItem');
        if (adminNav) adminNav.classList.remove('hidden');
    }

    // Show trial-expired banner for non-admin users with expired trial and no active plan
    if (user && user.role !== 'admin') {
        const trialExpired = user.trialExpiresAt && new Date(user.trialExpiresAt) < new Date();
        if (trialExpired) {
            showTrialBanner();
        }
    }

    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = user?.email || '';

    if (typeof loadDevices === 'function') loadDevices();
    if (typeof loadApiKey === 'function') loadApiKey();
}

function showLogin() {
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('registerView').classList.add('hidden');
}

function showRegister() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('registerView').classList.remove('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        token = data.token;
        user = data.user;
        localStorage.setItem('wa_token', token);
        localStorage.setItem('wa_user', JSON.stringify(user));
        toast('Logged in successfully', 'success');
        showDashboard();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Account created! Please sign in.', 'success');
        showLogin();
        document.getElementById('loginEmail').value = email;
    } catch (err) {
        toast(err.message, 'error');
    }
}

function logout() {
    token = null;
    user = null;
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_user');
    // Redirect back to the landing page on logout
    window.location.href = '/';
}
