/* ── Message Sending & Group Fetching ────────────────────────── */

async function handleSendText(e) {
    e.preventDefault();
    const deviceId = document.getElementById('txtDeviceId').value;
    const rawNumber = document.getElementById('txtNumber').value;
    const number = normalizePhoneNumber(rawNumber);
    const message = document.getElementById('txtMessage').value;

    if (!user?.apiKey) {
        toast('Generate an API key first (API Key section)', 'error');
        return;
    }

    if (!number.includes('@') && !/^\d{10,15}$/.test(number)) {
        toast('Phone number must include country code (e.g. 918919007019) or be a Group ID', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey, number, message });
        const res = await fetch(`${API}/api/messages/send-text?${params}`);
        const data = await res.json();

        if (checkTrialExpired(data)) return;
        if (!data.success) throw new Error(data.error);

        toast(`Message sent! ID: ${data.messageId}`, 'success');
        document.getElementById('txtMessage').value = '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleSendFile(e) {
    e.preventDefault();
    const deviceId = document.getElementById('fileDeviceId').value;
    const rawNumber = document.getElementById('fileNumber').value;
    const number = normalizePhoneNumber(rawNumber);
    const url = document.getElementById('fileUrl').value;
    const fileName = document.getElementById('fileName').value;

    if (!user?.apiKey) {
        toast('Generate an API key first (API Key section)', 'error');
        return;
    }

    if (!number.includes('@') && !/^\d{10,15}$/.test(number)) {
        toast('Phone number must include country code (e.g. 918919007019) or be a Group ID', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey, number, url, fileName });
        const res = await fetch(`${API}/api/messages/send-file?${params}`);
        const data = await res.json();

        if (checkTrialExpired(data)) return;
        if (!data.success) throw new Error(data.error);

        toast(`PDF sent! ID: ${data.messageId}`, 'success');
        document.getElementById('fileUrl').value = '';
        document.getElementById('fileName').value = '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleSendImage(e) {
    e.preventDefault();
    const deviceId = document.getElementById('imgDeviceId').value;
    const rawNumber = document.getElementById('imgNumber').value;
    const number = normalizePhoneNumber(rawNumber);
    const url = document.getElementById('imgUrl').value;
    const caption = document.getElementById('imgCaption').value;

    if (!user?.apiKey) {
        toast('Generate an API key first (API Key section)', 'error');
        return;
    }

    if (!number.includes('@') && !/^\d{10,15}$/.test(number)) {
        toast('Phone number must include country code (e.g. 918919007019) or be a Group ID', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey, number, url });
        if (caption) params.append('caption', caption);

        const res = await fetch(`${API}/api/messages/send-image?${params}`);
        const data = await res.json();

        if (checkTrialExpired(data)) return;
        if (!data.success) throw new Error(data.error);

        toast(`Image sent! ID: ${data.messageId}`, 'success');
        document.getElementById('imgUrl').value = '';
        document.getElementById('imgCaption').value = '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleFetchGroups(e) {
    e.preventDefault();
    const deviceId = document.getElementById('groupsDeviceId').value;
    const container = document.getElementById('groupsList');

    if (!user?.apiKey) {
        toast('Generate an API key first (API / Docs section)', 'error');
        return;
    }

    container.innerHTML = '<p class="text-gray" style="padding:.5rem">Loading groups...</p>';

    try {
        const params = new URLSearchParams({ deviceId, apiKey: user.apiKey });
        const res = await fetch(`${API}/api/messages/groups?${params}`);
        const data = await res.json();

        if (checkTrialExpired(data)) return;
        if (!data.success) throw new Error(data.error);

        if (!data.groups || data.groups.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:1rem"><p>No groups found for this device.</p></div>';
            return;
        }

        container.innerHTML = `
            <table class="docs-table" style="width:100%;font-size:.85rem">
                <thead>
                    <tr>
                        <th>Group Name</th>
                        <th>Group ID</th>
                        <th>Members</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${data.groups.map(g => `
                        <tr>
                            <td style="font-weight:600">${esc(g.subject || 'Unnamed')}</td>
                            <td style="font-family:Consolas,monospace;font-size:.8rem">${esc(g.id)}</td>
                            <td>${g.participantsCount}</td>
                            <td><button class="btn btn-outline btn-sm" onclick="copyGroupId('${esc(g.id)}')" title="Copy ID">📋</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;

        toast(`Found ${data.groups.length} group(s)`, 'success');
    } catch (err) {
        container.innerHTML = `<p class="text-red" style="padding:.5rem">${esc(err.message)}</p>`;
        toast(err.message, 'error');
    }
}

function copyGroupId(id) {
    navigator.clipboard.writeText(id).then(() => toast('Group ID copied!', 'info'));
}
