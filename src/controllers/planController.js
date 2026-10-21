const { dbGet, dbRun, dbAll } = require('../config/db');

/**
 * GET /plans/list
 * Public: List all active plans for purchase page, ordered by price.
 */
async function listPlans(req, res) {
    try {
        const plans = await dbAll(
            'SELECT id, name, description, price, duration_days, device_limit, message_limit, is_featured FROM plans WHERE is_active = TRUE ORDER BY price ASC'
        );
        return res.json({ success: true, plans });
    } catch (err) {
        console.error('List plans error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /plans/all
 * Admin: List ALL plans (including inactive/hidden).
 */
async function listAllPlans(req, res) {
    try {
        const plans = await dbAll('SELECT * FROM plans ORDER BY created_at DESC');
        return res.json({ success: true, plans });
    } catch (err) {
        console.error('List all plans error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /plans/create
 * Admin: Create a new subscription tier.
 * Body: { name, description, price, durationDays, deviceLimit, messageLimit }
 */
async function createPlan(req, res) {
    try {
        const { name, description, price, durationDays, deviceLimit, messageLimit, isFeatured } = req.body;

        if (!name || price === undefined || !durationDays || !deviceLimit || !messageLimit) {
            return res.status(400).json({
                success: false,
                error: 'name, price, durationDays, deviceLimit, and messageLimit are required',
            });
        }

        const parsedPrice = parseFloat(price);
        const parsedDuration = parseInt(durationDays, 10);
        const parsedDevices = parseInt(deviceLimit, 10);
        const parsedMessages = parseInt(messageLimit, 10);

        if (isNaN(parsedPrice) || isNaN(parsedDuration) || isNaN(parsedDevices) || isNaN(parsedMessages)) {
            return res.status(400).json({ success: false, error: 'price, durationDays, deviceLimit, and messageLimit must be valid numbers' });
        }

        const result = await dbRun(
            'INSERT INTO plans (name, description, price, duration_days, device_limit, message_limit, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name.trim(), description?.trim() || '', parsedPrice, parsedDuration, parsedDevices, parsedMessages, isFeatured ? true : false]
        );

        return res.status(201).json({ success: true, planId: result.lastID, message: 'Plan created successfully' });
    } catch (err) {
        console.error('Create plan error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * PUT /plans/:id
 * Admin: Update an existing plan.
 */
async function updatePlan(req, res) {
    try {
        const planId = req.params.id;
        const { name, description, price, durationDays, deviceLimit, messageLimit, isActive, isFeatured } = req.body;

        const plan = await dbGet('SELECT id FROM plans WHERE id = ?', [planId]);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found' });
        }

        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name.trim());
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description.trim());
        }
        if (price !== undefined) {
            updates.push('price = ?');
            params.push(parseFloat(price));
        }
        if (durationDays !== undefined) {
            updates.push('duration_days = ?');
            params.push(parseInt(durationDays, 10));
        }
        if (deviceLimit !== undefined) {
            updates.push('device_limit = ?');
            params.push(parseInt(deviceLimit, 10));
        }
        if (messageLimit !== undefined) {
            updates.push('message_limit = ?');
            params.push(parseInt(messageLimit, 10));
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive ? true : false);
        }
        if (isFeatured !== undefined) {
            updates.push('is_featured = ?');
            params.push(isFeatured ? true : false);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        params.push(planId);
        await dbRun(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, params);

        return res.json({ success: true, message: 'Plan updated' });
    } catch (err) {
        console.error('Update plan error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * DELETE /plans/:id
 * Admin: Soft-delete a plan (set is_active = FALSE).
 */
async function deletePlan(req, res) {
    try {
        const planId = req.params.id;
        try {
            await dbRun('DELETE FROM plans WHERE id = ?', [planId]);
            return res.json({ success: true, message: 'Plan deleted permanently' });
        } catch (fkErr) {
            await dbRun('UPDATE plans SET is_active = FALSE WHERE id = ?', [planId]);
            return res.json({ success: true, message: 'Plan has associated orders, deactivated instead' });
        }
    } catch (err) {
        console.error('Delete plan error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = {
    listPlans,
    listAllPlans,
    createPlan,
    updatePlan,
    deletePlan,
};
