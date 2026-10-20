/* ── Pricing & Subscription Plans ──────────────────────────── */

async function loadPlans() {
    try {
        const res = await fetch(`${API}/plans/list`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const container = document.getElementById('planCards');

        // Show current plan info
        const userRes = await fetch(`${API}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => null);

        let currentUser = null;
        if (userRes && userRes.ok) {
            const userData = await userRes.json();
            if (userData.success) currentUser = userData.user;
        }

        const planCard = document.getElementById('currentPlanCard');
        if (currentUser && currentUser.current_plan_id) {
            if (planCard) planCard.style.display = '';
            const expiry = currentUser.plan_expires_at ? new Date(currentUser.plan_expires_at) : null;
            const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - Date.now()) / 86400000)) : 0;
            const infoEl = document.getElementById('currentPlanInfo');
            if (infoEl) {
                infoEl.innerHTML = `
                    <div style="padding:1rem;display:flex;gap:2rem;flex-wrap:wrap;align-items:center">
                        <div><strong>Devices:</strong> ${currentUser.device_limit}</div>
                        <div><strong>Messages/day:</strong> ${currentUser.message_limit}</div>
                        <div><strong>Expires:</strong> ${expiry ? expiry.toLocaleDateString() : 'Never'}</div>
                        <div><span class="badge ${daysLeft > 7 ? 'badge-green' : daysLeft > 0 ? 'badge-yellow' : 'badge-red'}">${daysLeft > 0 ? daysLeft + ' days left' : 'Expired'}</span></div>
                    </div>`;
            }
        } else {
            if (planCard) planCard.style.display = 'none';
        }

        if (!data.plans || data.plans.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="icon">💎</div><p>No plans available yet.</p></div>';
            return;
        }

        container.innerHTML = data.plans.map((p, i) => {
            const isPopular = i === Math.floor(data.plans.length / 2);
            return `
            <div class="plan-card ${isPopular ? 'plan-popular' : ''}">
                ${isPopular ? '<div class="plan-badge">Most Popular</div>' : ''}
                <h3 class="plan-name">${esc(p.name)}</h3>
                <p class="plan-desc">${esc(p.description || '')}</p>
                <div class="plan-price">₹${p.price}<span>/for ${p.duration_days} days</span></div>
                <ul class="plan-features">
                    <li>📱 ${p.device_limit} Devices</li>
                    <li>✉️ ${p.message_limit} Messages/day</li>
                    <li>📅 ${p.duration_days} Days validity</li>
                </ul>
                <button class="btn btn-primary plan-btn" onclick="buyPlan(${p.id})">Buy Now</button>
            </div>`;
        }).join('');
    } catch (err) {
        toast(err.message, 'error');
    }
}

function buyPlan(planId) {
    showTrialExpiredPopup();
}
