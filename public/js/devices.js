/* ── Device Management & QR Pairing ─────────────────────────── */

async function loadDevices() {
    try {
        const res = await fetch(`${API}/device/list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('deviceList');
        if (!data.devices || data.devices.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📱</div>
          <p>No devices yet. Add one to get started.</p>
        </div>`;
            populateDeviceSelects([]);
            return;
        }

        container.innerHTML = data.devices.map(d => `
      <div class="device-item">
        <div class="device-info">
          <div class="device-avatar">📱</div>
          <div>
            <div class="device-name">${esc(d.session_name)}</div>
            <div class="device-id">${esc(d.device_id)}</div>
          </div>
        </div>
        <div class="device-actions">
          <span class="badge ${statusBadge(d.status)}">${d.status}</span>
          <button class="btn btn-outline btn-sm" onclick="viewDeviceStatus('${esc(d.device_id)}')" title="View Status">📋</button>
          ${d.status === 'connected' ? `<button class="btn btn-outline btn-sm" onclick="viewProfilePhoto('${esc(d.device_id)}')" title="Profile Photo">🖼️</button>` : ''}
          ${d.status !== 'connected' ? `<button class="btn btn-primary btn-sm" onclick="showQR('${esc(d.device_id)}')" title="Scan QR">QR</button>` : ''}
          <button class="btn btn-red btn-sm" onclick="deleteDevice('${esc(d.device_id)}')" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');

        populateDeviceSelects(data.devices);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function populateDeviceSelects(devices) {
    const connected = devices.filter(d => d.status === 'connected');
    const options = connected.length === 0
        ? '<option value="">No connected devices</option>'
        : connected.map(d => `<option value="${esc(d.device_id)}">${esc(d.session_name)} (${esc(d.device_id)})</option>`).join('');

    const textSelect = document.getElementById('txtDeviceId');
    const fileSelect = document.getElementById('fileDeviceId');
    const imgSelect = document.getElementById('imgDeviceId');
    const groupsSelect = document.getElementById('groupsDeviceId');

    if (textSelect) textSelect.innerHTML = options;
    if (fileSelect) fileSelect.innerHTML = options;
    if (imgSelect) imgSelect.innerHTML = options;
    if (groupsSelect) groupsSelect.innerHTML = options;
}

function openCreateDeviceModal() {
    const idInput = document.getElementById('newDeviceId');
    const nameInput = document.getElementById('newSessionName');
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    const modal = document.getElementById('createDeviceModal');
    if (modal) modal.classList.remove('hidden');
}

async function viewDeviceStatus(deviceId) {
    try {
        const res = await fetch(`${API}/device/status?deviceId=${encodeURIComponent(deviceId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const d = data;
        const statusClass = statusBadge(d.status);
        const html = `
            <div style="text-align:center;margin-bottom:1rem">
                <div style="font-size:3rem;margin-bottom:.5rem">📱</div>
                <div style="font-size:1.1rem;font-weight:700;color:var(--navy)">${esc(d.sessionName)}</div>
                <div style="font-size:.82rem;color:var(--gray-400);font-family:Consolas,monospace">${esc(d.deviceId)}</div>
            </div>
            <table class="docs-table" style="margin-top:.75rem">
                <tr><td style="font-weight:600;color:var(--gray-500)">Status</td><td><span class="badge ${statusClass}">${d.status}</span></td></tr>
                <tr><td style="font-weight:600;color:var(--gray-500)">Created</td><td>${new Date(d.createdAt).toLocaleString()}</td></tr>
                <tr><td style="font-weight:600;color:var(--gray-500)">Device ID</td><td style="font-family:Consolas,monospace;font-size:.85rem">${esc(d.deviceId)}</td></tr>
            </table>`;

        const modal = document.getElementById('qrModal');
        modal.querySelector('h3').textContent = 'Device Profile';
        document.getElementById('qrContainer').innerHTML = html;
        modal.classList.remove('hidden');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteDevice(deviceId) {
    if (!confirm(`Are you sure you want to delete device "${deviceId}" and all its data? This cannot be undone.`)) {
        return;
    }
    try {
        const res = await fetch(`${API}/device/delete?deviceId=${encodeURIComponent(deviceId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        toast('Device deleted successfully', 'success');
        loadDevices();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function viewProfilePhoto(deviceId) {
    const modal = document.getElementById('qrModal');
    modal.querySelector('h3').textContent = 'Profile Photo';
    document.getElementById('qrContainer').innerHTML = '<p class="text-gray">Loading profile photo...</p>';
    modal.classList.remove('hidden');

    try {
        const res = await fetch(`${API}/device/profile-photo?deviceId=${encodeURIComponent(deviceId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        if (data.profilePhoto) {
            document.getElementById('qrContainer').innerHTML = `
                <div style="text-align:center">
                    <img src="${data.profilePhoto}" alt="Profile Photo" style="max-width:260px;border-radius:50%;border:3px solid var(--green);box-shadow:var(--shadow-md)">
                    <p style="margin-top:1rem;font-size:.88rem;font-weight:600;color:var(--navy)">${esc(deviceId)}</p>
                </div>`;
        } else {
            document.getElementById('qrContainer').innerHTML = `
                <div style="text-align:center;padding:2rem">
                    <div style="font-size:3rem;margin-bottom:.75rem">👤</div>
                    <p style="color:var(--gray-500);font-size:.9rem">No profile photo set for this device</p>
                </div>`;
        }
    } catch (err) {
        document.getElementById('qrContainer').innerHTML = `<p class="text-red">${esc(err.message)}</p>`;
    }
}

async function handleCreateDevice(e) {
    e.preventDefault();
    const rawDeviceId = document.getElementById('newDeviceId').value;
    const deviceId = normalizePhoneNumber(rawDeviceId);
    const sessionName = document.getElementById('newSessionName').value;

    if (!/^\d{10,15}$/.test(deviceId)) {
        toast('Please enter phone number with country code (e.g. 918919007019)', 'error');
        return;
    }

    try {
        const res = await fetch(`${API}/device/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ deviceId, sessionName })
        });
        const data = await res.json();

        if (!data.success && data.error === 'TRIAL_EXPIRED') {
            closeModal('createDeviceModal');
            showTrialExpiredPopup();
            return;
        }

        if (!data.success) throw new Error(data.error);

        toast('Device created! Scan QR to connect.', 'success');
        closeModal('createDeviceModal');
        loadDevices();

        setTimeout(() => showQR(deviceId), 1000);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function showQR(deviceId) {
    document.getElementById('qrModal').querySelector('h3').textContent = 'Scan QR Code';
    document.getElementById('qrContainer').innerHTML = '<p class="text-gray">Loading QR code...</p>';
    document.getElementById('qrModal').classList.remove('hidden');
    pollQR(deviceId);
}

function pollQR(deviceId) {
    stopQrPolling();
    fetchQR(deviceId);
    qrInterval = setInterval(() => fetchQR(deviceId), 3000);
}

async function fetchQR(deviceId) {
    try {
        const res = await fetch(`${API}/device/qr?deviceId=${encodeURIComponent(deviceId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.status === 'connected') {
            document.getElementById('qrContainer').innerHTML = `
        <div class="icon" style="font-size:3rem;margin-bottom:.5rem">✅</div>
        <p class="text-green" style="font-weight:600">Device Connected!</p>`;
            stopQrPolling();
            loadDevices();
            return;
        }

        if (data.qr) {
            document.getElementById('qrContainer').innerHTML = `
        <img src="${data.qr}" alt="QR Code">
        <div class="qr-status">Open WhatsApp → Linked Devices → Scan this code</div>`;
        } else {
            document.getElementById('qrContainer').innerHTML = '<p class="text-gray">Waiting for QR code... Please wait a few seconds.</p>';
        }
    } catch (err) {
        document.getElementById('qrContainer').innerHTML = '<p class="text-red">Failed to load QR code</p>';
    }
}

function stopQrPolling() {
    if (qrInterval) {
        clearInterval(qrInterval);
        qrInterval = null;
    }
}
