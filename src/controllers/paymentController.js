const axios = require('axios');
const crypto = require('crypto');
const { dbGet, dbRun, dbAll } = require('../config/db');

const CF_API_VERSION = '2023-08-01';

/**
 * Retrieve Cashfree credentials from database settings table,
 * falling back to environment variables.
 */
async function getCashfreeConfig() {
    let env = process.env.CASHFREE_ENV || 'sandbox';
    let appId = process.env.CASHFREE_APP_ID;
    let secretKey = process.env.CASHFREE_SECRET_KEY;

    try {
        const settings = await dbAll(`SELECT * FROM settings WHERE setting_key LIKE 'cashfree_%'`);
        const conf = {};
        settings.forEach((s) => {
            conf[s.setting_key] = s.setting_value;
        });

        if (conf['cashfree_env']) env = conf['cashfree_env'];
        if (conf['cashfree_app_id']) appId = conf['cashfree_app_id'];
        if (conf['cashfree_secret_key']) secretKey = conf['cashfree_secret_key'];
    } catch (e) {
        console.error('Failed to load DB cashfree config:', e.message);
    }

    return {
        appId,
        secretKey,
        env,
        baseUrl: env === 'production'
            ? 'https://api.cashfree.com/pg'
            : 'https://sandbox.cashfree.com/pg',
    };
}

/**
 * Activate a subscription plan for a user — updates device/message limits and expiry date.
 * 
 * @param {number} userId
 * @param {number} planId
 */
async function activatePlan(userId, planId) {
    const plan = await dbGet('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plan) return;

    const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

    await dbRun(`
        UPDATE users SET
            current_plan_id = ?,
            plan_expires_at = ?,
            device_limit = ?,
            message_limit = ?,
            trial_expires_at = NULL
        WHERE id = ?
    `, [planId, expiresAt, plan.device_limit, plan.message_limit, userId]);

    console.log(`Plan activated: user=${userId}, plan=${plan.name}, expires=${expiresAt}`);
}

/**
 * POST /payment/create-order
 * Body: { planId }
 * Creates a Cashfree order and returns the payment session ID.
 */
async function createOrder(req, res) {
    try {
        const { planId } = req.body;
        const userId = req.user.id;

        if (!planId) {
            return res.status(400).json({ success: false, error: 'planId is required' });
        }

        const plan = await dbGet('SELECT * FROM plans WHERE id = ? AND is_active = TRUE', [planId]);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
        }

        const user = await dbGet('SELECT id, email FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const cf = await getCashfreeConfig();
        if (!cf.appId || !cf.secretKey) {
            return res.status(500).json({ success: false, error: 'Cashfree credentials not configured' });
        }

        const orderId = `ORDER_${userId}_${Date.now()}`;

        // Create order in Cashfree PG
        const cfResponse = await axios.post(`${cf.baseUrl}/orders`, {
            order_id: orderId,
            order_amount: plan.price,
            order_currency: 'INR',
            customer_details: {
                customer_id: `USER_${userId}`,
                customer_email: user.email.includes('@') ? user.email : `${user.email}@noemail.com`,
                customer_phone: user.email.match(/^\d+$/) ? user.email : '9999999999',
            },
            order_meta: {
                return_url: `${req.protocol}://${req.get('host')}/payment-status.html?order_id=${orderId}`,
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': cf.appId,
                'x-client-secret': cf.secretKey,
                'x-api-version': CF_API_VERSION,
            },
        });

        const cfOrder = cfResponse.data;

        // Persist order record in database
        await dbRun(
            'INSERT INTO orders (user_id, plan_id, cf_order_id, amount, status) VALUES (?, ?, ?, ?, ?)',
            [userId, planId, orderId, plan.price, 'pending']
        );

        return res.json({
            success: true,
            orderId,
            paymentSessionId: cfOrder.payment_session_id,
            cfOrderId: cfOrder.cf_order_id,
            environment: cf.env,
        });
    } catch (err) {
        console.error('Create order error:', err.response?.data || err.message);
        return res.status(500).json({ success: false, error: err.response?.data?.message || 'Failed to create order' });
    }
}

/**
 * POST /payment/webhook
 * Cashfree asynchronous webhook callback — receives payment status updates.
 * Verifies HMAC SHA-256 signature and activates plan on confirmed payment.
 */
async function handleWebhook(req, res) {
    try {
        const cf = await getCashfreeConfig();

        // Verify webhook signature
        const timestamp = req.headers['x-cashfree-timestamp'] || '';
        const signature = req.headers['x-cashfree-signature'] || '';
        const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

        if (signature && cf.secretKey) {
            const expectedSignature = crypto
                .createHmac('sha256', cf.secretKey)
                .update(timestamp + rawBody)
                .digest('base64');

            if (signature !== expectedSignature) {
                console.error('Cashfree webhook signature mismatch');
                return res.status(401).json({ success: false, error: 'Invalid signature' });
            }
        }

        const data = req.body?.data;
        if (!data || !data.order) {
            return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
        }

        const { order_id, order_status } = data.order;
        const paymentId = data.payment?.cf_payment_id || null;

        const order = await dbGet('SELECT * FROM orders WHERE cf_order_id = ?', [order_id]);
        if (!order) {
            console.error('Webhook: order not found', order_id);
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        if (order_status === 'PAID' && order.status !== 'paid') {
            await dbRun('UPDATE orders SET status = ?, cf_payment_id = ? WHERE cf_order_id = ?',
                ['paid', paymentId, order_id]);
            await activatePlan(order.user_id, order.plan_id);
            console.log(`Payment confirmed via webhook: order=${order_id}, user=${order.user_id}`);
        } else if (['EXPIRED', 'CANCELLED', 'VOID'].includes(order_status)) {
            await dbRun('UPDATE orders SET status = ? WHERE cf_order_id = ?', ['failed', order_id]);
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /payment/verify/:orderId
 * Direct verification fallback with Cashfree PG.
 */
async function verifyPayment(req, res) {
    try {
        const { orderId } = req.params;
        const userId = req.user.id;

        const order = await dbGet('SELECT * FROM orders WHERE cf_order_id = ? AND user_id = ?', [orderId, userId]);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        if (order.status === 'paid') {
            return res.json({ success: true, status: 'paid', message: 'Payment already confirmed' });
        }

        const cf = await getCashfreeConfig();
        const cfResponse = await axios.get(`${cf.baseUrl}/orders/${orderId}`, {
            headers: {
                'x-client-id': cf.appId,
                'x-client-secret': cf.secretKey,
                'x-api-version': CF_API_VERSION,
            },
        });

        const cfOrder = cfResponse.data;

        if (cfOrder.order_status === 'PAID') {
            await dbRun('UPDATE orders SET status = ? WHERE cf_order_id = ?', ['paid', orderId]);
            await activatePlan(order.user_id, order.plan_id);
            return res.json({ success: true, status: 'paid', message: 'Payment confirmed' });
        } else {
            const status = cfOrder.order_status === 'ACTIVE' ? 'pending' : 'failed';
            await dbRun('UPDATE orders SET status = ? WHERE cf_order_id = ?', [status, orderId]);
            return res.json({ success: true, status, message: `Order status: ${cfOrder.order_status}` });
        }
    } catch (err) {
        console.error('Verify payment error:', err.response?.data || err.message);
        return res.status(500).json({ success: false, error: 'Failed to verify payment' });
    }
}

/**
 * GET /payment/history
 * Returns payment history for the authenticated user.
 */
async function paymentHistory(req, res) {
    try {
        const userId = req.user.id;
        const orders = await dbAll(`
            SELECT o.id, o.cf_order_id, o.amount, o.status, o.created_at,
                   p.name as plan_name, p.duration_days, p.device_limit, p.message_limit
            FROM orders o
            JOIN plans p ON o.plan_id = p.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
        `, [userId]);

        return res.json({ success: true, orders });
    } catch (err) {
        console.error('Payment history error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = {
    createOrder,
    handleWebhook,
    verifyPayment,
    paymentHistory,
    activatePlan,
};
