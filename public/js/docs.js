/* ── Live Interactive API Documentation & Key Management ────── */

function loadApiKey() {
    const container = document.getElementById('apiKeyContainer');
    if (!container) return;

    if (user?.apiKey) {
        container.innerHTML = `
      <div class="api-key-display">
        <code id="apiKeyValue">${esc(user.apiKey)}</code>
        <button class="btn btn-outline btn-sm" onclick="copyApiKey()" title="Copy">📋</button>
      </div>`;
    } else {
        container.innerHTML = '<p class="text-gray text-sm">No API key generated yet.</p>';
    }
}

async function generateApiKey() {
    try {
        const res = await fetch(`${API}/auth/api-key`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        user.apiKey = data.apiKey;
        localStorage.setItem('wa_user', JSON.stringify(user));
        loadApiKey();
        toast('API key generated', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function copyApiKey() {
    const key = document.getElementById('apiKeyValue')?.textContent;
    if (key) {
        navigator.clipboard.writeText(key).then(() => toast('Copied!', 'info'));
    }
}

function renderDocs() {
    const base = window.location.origin;
    const key = user?.apiKey || 'YOUR_API_KEY';
    const keyShort = user?.apiKey ? user.apiKey.substring(0, 16) + '...' : 'Not generated';

    const baseUrlEl = document.getElementById('docsBaseUrl');
    if (baseUrlEl) baseUrlEl.textContent = base;

    const docsKeyEl = document.getElementById('docsApiKey');
    if (docsKeyEl) {
        docsKeyEl.textContent = keyShort;
        docsKeyEl.title = key;
    }

    const authContainer = document.getElementById('docsAuthEndpoints');
    if (authContainer) {
        authContainer.innerHTML = [
            {
                method: 'POST', path: '/auth/register',
                desc: 'Create a new user account',
                params: [{ n: 'email', r: true }, { n: 'password', r: true }],
                bodyType: 'json',
                example: `curl -X POST ${base}/auth/register \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"you@example.com","password":"pass123"}'`,
                response: `{\n  "success": true,\n  "userId": 1,\n  "message": "User registered successfully"\n}`
            },
            {
                method: 'POST', path: '/auth/login',
                desc: 'Authenticate and receive a JWT token',
                params: [{ n: 'email', r: true }, { n: 'password', r: true }],
                bodyType: 'json',
                example: `curl -X POST ${base}/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"you@example.com","password":"pass123"}'`,
                response: `{\n  "success": true,\n  "token": "eyJhbGciOi...",\n  "user": { "id": 1, "email": "you@example.com", "apiKey": null }\n}`
            },
            {
                method: 'POST', path: '/auth/api-key',
                desc: 'Generate or regenerate your API key (JWT required)',
                params: [],
                bodyType: 'none',
                example: `curl -X POST ${base}/auth/api-key \\\n  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
                response: `{\n  "success": true,\n  "apiKey": "47928fe5dd65f94e...",\n  "message": "API key generated successfully"\n}`
            }
        ].map(renderEndpoint).join('');
    }

    const devContainer = document.getElementById('docsDeviceEndpoints');
    if (devContainer) {
        devContainer.innerHTML = [
            {
                method: 'POST', path: '/device/create',
                desc: 'Register a new WhatsApp device and initialize the Baileys session',
                params: [{ n: 'deviceId', r: true }, { n: 'sessionName', r: false }],
                bodyType: 'json',
                example: `curl -X POST ${base}/device/create \\\n  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"deviceId":"918919007019","sessionName":"My Phone"}'`,
                response: `{\n  "success": true,\n  "deviceId": "918919007019",\n  "sessionName": "My Phone",\n  "status": "pending",\n  "message": "Device created. Scan QR code to connect."\n}`
            },
            {
                method: 'GET', path: '/device/qr',
                desc: 'Get the QR code image (base64 PNG) for pairing',
                params: [{ n: 'deviceId', r: true, q: true }],
                bodyType: 'none',
                example: `curl "${base}/device/qr?deviceId=918919007019" \\\n  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
                response: `{\n  "success": true,\n  "qr": "data:image/png;base64,..."\n}`
            },
            {
                method: 'GET', path: '/device/status',
                desc: 'Check the connection status of a device',
                params: [{ n: 'deviceId', r: true, q: true }],
                bodyType: 'none',
                example: `curl "${base}/device/status?deviceId=918919007019" \\\n  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
                response: `{\n  "success": true,\n  "deviceId": "918919007019",\n  "status": "connected"\n}`
            },
            {
                method: 'GET', path: '/device/list',
                desc: 'List all devices belonging to the authenticated user',
                params: [],
                bodyType: 'none',
                example: `curl "${base}/device/list" \\\n  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
                response: `{\n  "success": true,\n  "devices": [\n    { "device_id": "918919007019", "session_name": "My Phone", "status": "connected" }\n  ]\n}`
            }
        ].map(renderEndpoint).join('');
    }

    const msgContainer = document.getElementById('docsMessageEndpoints');
    if (msgContainer) {
        msgContainer.innerHTML = [
            {
                method: 'GET', path: '/api/messages/send-text',
                desc: 'Send a text message to a WhatsApp number',
                params: [
                    { n: 'deviceId', r: true, q: true },
                    { n: 'apiKey', r: true, q: true },
                    { n: 'number', r: true, q: true },
                    { n: 'message', r: true, q: true }
                ],
                bodyType: 'none',
                example: `${base}/api/messages/send-text?deviceId=918919007019&apiKey=${key}&number=918919007019&message=Hello`,
                exampleLabel: 'full url',
                response: `{\n  "success": true,\n  "messageId": "ABCD1234",\n  "status": "sent",\n  "error": null\n}`
            },
            {
                method: 'GET', path: '/api/messages/send-file',
                desc: 'Send a PDF document via HTTPS URL',
                params: [
                    { n: 'deviceId', r: true, q: true },
                    { n: 'apiKey', r: true, q: true },
                    { n: 'number', r: true, q: true },
                    { n: 'url', r: true, q: true },
                    { n: 'fileName', r: true, q: true }
                ],
                bodyType: 'none',
                example: `${base}/api/messages/send-file?deviceId=918919007019&apiKey=${key}&number=918919007019&url=https://pdf.domain.com/file.pdf&fileName=file.pdf`,
                exampleLabel: 'full url',
                response: `{\n  "success": true,\n  "messageId": "XYZ98765",\n  "status": "sent",\n  "error": null\n}`
            },
            {
                method: 'GET', path: '/api/messages/send-image',
                desc: 'Send an image via HTTPS URL',
                params: [
                    { n: 'deviceId', r: true, q: true },
                    { n: 'apiKey', r: true, q: true },
                    { n: 'number', r: true, q: true },
                    { n: 'url', r: true, q: true },
                    { n: 'caption', r: false, q: true }
                ],
                bodyType: 'none',
                example: `${base}/api/messages/send-image?deviceId=918919007019&apiKey=${key}&number=918919007019&url=https://domain.com/img.jpg&caption=Hello`,
                exampleLabel: 'full url',
                response: `{\n  "success": true,\n  "messageId": "IMG12345",\n  "status": "sent",\n  "error": null\n}`
            },
            {
                method: 'GET', path: '/api/messages/groups',
                desc: 'Fetch all WhatsApp groups the device is participating in. Use the returned Group IDs to send messages to groups.',
                params: [
                    { n: 'deviceId', r: true, q: true },
                    { n: 'apiKey', r: true, q: true }
                ],
                bodyType: 'none',
                example: `${base}/api/messages/groups?deviceId=918919007019&apiKey=${key}`,
                exampleLabel: 'full url',
                response: `{\n  "success": true,\n  "groups": [\n    { "id": "120363XXXXX@g.us", "subject": "My Group", "participantsCount": 15 }\n  ],\n  "error": null\n}`
            }
        ].map(renderEndpoint).join('');
    }
}

function renderEndpoint(ep) {
    const methodClass = ep.method === 'GET' ? 'docs-method-get' : 'docs-method-post';
    const paramsHtml = ep.params.length > 0 ? `
    <div class="docs-params">
      <div class="docs-params-title">${ep.params[0]?.q ? 'Query' : 'Body'} Parameters</div>
      ${ep.params.map(p => `<span class="docs-param">${p.n}${p.r ? ' <span class="docs-param-required">*</span>' : ''}</span>`).join('')}
    </div>` : '';

    const label = ep.exampleLabel || 'curl';
    const uid = 'ex-' + Math.random().toString(36).substring(2, 8);

    return `
    <div class="docs-endpoint">
      <div class="docs-endpoint-header">
        <span class="docs-method ${methodClass}">${ep.method}</span>
        <span class="docs-path">${ep.path}</span>
      </div>
      <div class="docs-desc">${ep.desc}</div>
      ${paramsHtml}
      <div class="docs-response-label">Example (${label})</div>
      <div class="docs-example-block" id="${uid}">
        <button class="docs-copy-btn" onclick="copyDocBlock('${uid}')">Copy</button>${escHtml(ep.example)}</div>
      <div class="docs-response-label">Response</div>
      <div class="docs-example-block"><span class="hl-str">${escHtml(ep.response)}</span></div>
    </div>`;
}

function copyDocBlock(id) {
    const text = document.getElementById(id)?.textContent?.replace('Copy', '').trim();
    if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'info'));
}
