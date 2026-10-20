/**
 * Quota and Subscription Service
 * 
 * Centralizes business logic for:
 * 1. Subscription & trial validation across middlewares (auth, apiKey, trial).
 * 2. Daily message limit enforcement and atomic UTC calendar date resets.
 * 3. Message quota checks for legacy GET messaging pipelines.
 */

const { dbGet, dbRun } = require('../config/db');

/**
 * Evaluates whether a user account has an active trial or valid paid plan.
 * 
 * @param {Object} user - User record from DB (must contain role, trial_expires_at, current_plan_id, plan_expires_at)
 * @returns {boolean} True if user is authorized to perform device and message operations.
 */
function isSubscriptionActive(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const now = new Date();
    const trialExpired = user.trial_expires_at && new Date(user.trial_expires_at) < now;
    const planActive = Boolean(
        user.current_plan_id &&
        (!user.plan_expires_at || new Date(user.plan_expires_at) >= now)
    );

    return !trialExpired || planActive;
}

/**
 * Checks and resets a user's daily message counter if a new UTC calendar day has begun.
 * 
 * @param {number} userId - The user's ID
 * @param {Object} [cachedUser] - Optional pre-fetched user record to minimize redundant DB queries
 * @returns {Promise<Object|null>} The updated user record containing messages_sent_today and message_limit
 */
async function checkAndResetDailyCounter(userId, cachedUser = null) {
    let user = cachedUser;
    if (!user || user.messages_sent_today === undefined || user.last_message_reset === undefined) {
        user = await dbGet(
            'SELECT id, role, message_limit, messages_sent_today, last_message_reset FROM users WHERE id = ?',
            [userId]
        );
    }
    if (!user) return null;

    const today = new Date().toISOString().split('T')[0];
    const lastResetDate = user.last_message_reset ? new Date(user.last_message_reset).toISOString().split('T')[0] : null;

    if (lastResetDate !== today) {
        await dbRun(
            'UPDATE users SET messages_sent_today = 0, last_message_reset = ? WHERE id = ?',
            [today, userId]
        );
        user.messages_sent_today = 0;
        user.last_message_reset = today;
    }

    return user;
}

/**
 * Increments the daily message counter for a user upon successful dispatch.
 * 
 * @param {number} userId - The user's ID
 */
async function incrementMessageCounter(userId) {
    await dbRun('UPDATE users SET messages_sent_today = messages_sent_today + 1 WHERE id = ?', [userId]);
}

/**
 * Checks if a user is permitted to send an outbound message based on daily quota.
 * 
 * @param {Object} user - User record (must have role, messages_sent_today, message_limit)
 * @returns {{ allowed: boolean, error?: string }}
 */
function checkMessageQuota(user) {
    if (!user) {
        return { allowed: false, error: 'User not found' };
    }
    if (user.role === 'admin') {
        return { allowed: true };
    }
    if (user.messages_sent_today >= user.message_limit) {
        return {
            allowed: false,
            error: `Daily message limit reached (${user.message_limit}). Resets at midnight UTC.`,
        };
    }
    return { allowed: true };
}

module.exports = {
    isSubscriptionActive,
    checkAndResetDailyCounter,
    incrementMessageCounter,
    checkMessageQuota,
};
