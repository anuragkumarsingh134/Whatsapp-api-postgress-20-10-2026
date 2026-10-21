/* ── Administrator Controls (Users & Plans) ─────────────────── */

let adminPlansCache = [];

async function loadAdminUsers() {
    try {
        const res = await fetch(`${API}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('adminUserList');
        if (!data.users || data.users.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No users found.</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="docs-table" style="width:100%">
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Devices</th>
                        <th>Msg Today</th>
                        <th>Trial Expires</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.users.map(u => `
                        <tr>
                            <td style="font-weight:600;font-size:.85rem">${esc(u.email)}</td>
                            <td><span class="badge ${u.role === 'admin' ? 'badge-green' : 'badge-yellow'}">${u.role}</span></td>
                            <td>${u.device_count} / ${u.device_limit}</td>
                            <td>${u.messages_sent_today} / ${u.message_limit}</td>
                            <td style="font-size:.8rem">${u.trial_expires_at ? new Date(u.trial_expires_at).toLocaleDateString() : '∞'}</td>
                            <td><span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
                            <td style="display:flex;gap:.3rem">
                                <button class="btn btn-outline btn-sm" onclick="openEditUser(${u.id})" title="Edit">✏️</button>
                                ${u.role !== 'admin' ? `<button class="btn btn-red btn-sm" onclick="adminDeleteUser(${u.id})" title="Delete">🗑️</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function openEditUser(userId) {
    try {
        const res = await fetch(`${API}/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const u = data.user;
        document.getElementById('editUserId').value = u.id;
        document.getElementById('editUserEmail').value = u.email;
        document.getElementById('editUserRole').value = u.role;
        document.getElementById('editDeviceLimit').value = u.device_limit;
        document.getElementById('editMessageLimit').value = u.message_limit;
        document.getElementById('editIsActive').value = u.is_active ? '1' : '0';

        if (u.trial_expires_at) {
            const dt = new Date(u.trial_expires_at);
            document.getElementById('editTrialExpiry').value = dt.toISOString().slice(0, 16);
        } else {
            document.getElementById('editTrialExpiry').value = '';
        }

        document.getElementById('editUserModal').classList.remove('hidden');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleEditUser(e) {
    e.preventDefault();
    const userId = document.getElementById('editUserId').value;

    const body = {
        role: document.getElementById('editUserRole').value,
        deviceLimit: parseInt(document.getElementById('editDeviceLimit').value, 10),
        messageLimit: parseInt(document.getElementById('editMessageLimit').value, 10),
        isActive: document.getElementById('editIsActive').value === '1',
    };

    const expiryVal = document.getElementById('editTrialExpiry').value;
    body.trialExpiresAt = expiryVal ? new Date(expiryVal).toISOString() : null;

    try {
        const res = await fetch(`${API}/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('User updated successfully', 'success');
        closeModal('editUserModal');
        loadAdminUsers();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function adminDeleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user and ALL their data?')) return;

    try {
        const res = await fetch(`${API}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('User deleted', 'success');
        loadAdminUsers();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function toggleCreatePlan() {
    const form = document.getElementById('createPlanForm');
    if (form) form.classList.toggle('hidden');
}

async function handleCreatePlan(e) {
    e.preventDefault();
    try {
        const body = {
            name: document.getElementById('newPlanName').value,
            description: document.getElementById('newPlanDesc').value,
            price: parseFloat(document.getElementById('newPlanPrice').value),
            durationDays: parseInt(document.getElementById('newPlanDuration').value, 10),
            deviceLimit: parseInt(document.getElementById('newPlanDevices').value, 10),
            messageLimit: parseInt(document.getElementById('newPlanMessages').value, 10),
            isFeatured: document.getElementById('newPlanFeatured').value === '1',
        };

        const res = await fetch(`${API}/plans/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Plan created!', 'success');
        toggleCreatePlan();
        ['newPlanName', 'newPlanDesc', 'newPlanPrice'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const featuredEl = document.getElementById('newPlanFeatured');
        if (featuredEl) featuredEl.value = '0';
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function loadAdminPlans() {
    try {
        const res = await fetch(`${API}/plans/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        adminPlansCache = data.plans || [];
        const container = document.getElementById('adminPlanList');
        if (!adminPlansCache || adminPlansCache.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No plans created yet. Click "+ New Plan" above.</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="docs-table" style="width:100%">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Price</th>
                        <th>Duration</th>
                        <th>Devices</th>
                        <th>Msg/Day</th>
                        <th>Featured</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${adminPlansCache.map(p => `
                        <tr>
                            <td style="font-weight:600">${esc(p.name)}</td>
                            <td>&#x20B9;${p.price}</td>
                            <td>${p.duration_days}d</td>
                            <td>${p.device_limit}</td>
                            <td>${p.message_limit}</td>
                            <td>${p.is_featured ? '<span class="badge badge-yellow">&#x2605; Popular</span>' : '<span style="color:var(--gray-400);font-size:.8rem">&mdash;</span>'}</td>
                            <td><span class="badge ${p.is_active ? 'badge-green' : 'badge-red'}">${p.is_active ? 'Active' : 'Hidden'}</span></td>
                            <td>
                                <div style="display:flex;gap:.25rem;flex-wrap:wrap">
                                    <button class="btn btn-outline btn-sm" onclick="openEditPlanModal(${p.id})">&#x270F;&#xFE0F; Edit</button>
                                    <button class="btn btn-outline btn-sm" onclick="togglePlanActive(${p.id}, ${p.is_active})">${p.is_active ? '&#x1F6AB; Hide' : '&#x2705; Show'}</button>
                                    <button class="btn btn-outline btn-sm" onclick="togglePlanFeatured(${p.id}, ${p.is_featured})">${p.is_featured ? '&#x2605; Unfeature' : '&#x2606; Feature'}</button>
                                    <button class="btn btn-red btn-sm" onclick="adminDeletePlan(${p.id})" title="Delete plan">&#x1F5D1;&#xFE0F; Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;

    } catch (err) {
        toast(err.message, 'error');
    }
}

function openEditPlanModal(planId) {
    const plan = adminPlansCache.find(p => p.id === planId);
    if (!plan) {
        toast('Plan details not found', 'error');
        return;
    }

    document.getElementById('editPlanId').value = plan.id;
    document.getElementById('editPlanName').value = plan.name || '';
    document.getElementById('editPlanPrice').value = plan.price;
    document.getElementById('editPlanDuration').value = plan.duration_days;
    document.getElementById('editPlanDevices').value = plan.device_limit;
    document.getElementById('editPlanMessages').value = plan.message_limit;
    document.getElementById('editPlanDesc').value = plan.description || '';
    document.getElementById('editPlanIsActive').value = plan.is_active ? '1' : '0';
    document.getElementById('editPlanFeatured').value = plan.is_featured ? '1' : '0';

    document.getElementById('editPlanModal').classList.remove('hidden');
}

async function handleEditPlan(e) {
    e.preventDefault();
    const planId = document.getElementById('editPlanId').value;

    const body = {
        name: document.getElementById('editPlanName').value,
        price: parseFloat(document.getElementById('editPlanPrice').value),
        durationDays: parseInt(document.getElementById('editPlanDuration').value, 10),
        deviceLimit: parseInt(document.getElementById('editPlanDevices').value, 10),
        messageLimit: parseInt(document.getElementById('editPlanMessages').value, 10),
        description: document.getElementById('editPlanDesc').value,
        isActive: document.getElementById('editPlanIsActive').value === '1',
        isFeatured: document.getElementById('editPlanFeatured').value === '1',
    };

    try {
        const res = await fetch(`${API}/plans/${planId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Plan updated successfully', 'success');
        closeModal('editPlanModal');
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function togglePlanActive(planId, currentState) {
    try {
        const res = await fetch(`${API}/plans/${planId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive: !currentState })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast(`Plan ${currentState ? 'hidden' : 'shown'}`, 'success');
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function togglePlanFeatured(planId, currentState) {
    try {
        const res = await fetch(`${API}/plans/${planId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isFeatured: !currentState })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast(`Plan ${currentState ? 'unfeatured' : 'marked as Most Popular'}`, 'success');
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function adminDeletePlan(planId) {
    if (!confirm('Are you sure you want to delete this plan? This action cannot be undone.')) return;
    try {
        const res = await fetch(`${API}/plans/${planId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast(data.message || 'Plan deleted', 'success');
        loadAdminPlans();
    } catch (err) {
        toast(err.message, 'error');
    }
}
