const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let redisClient = null;
let lastLogTime = 0;

/**
 * Initializes and returns the shared singleton ioredis client instance.
 * Configured with exponential backoff, auto-reconnection, and error logging.
 *
 * @returns {Redis} Active ioredis client
 */
function getRedisClient() {
    if (!redisClient) {
        const sanitizedUrl = REDIS_URL.replace(/:[^:@]+@/, ':***@');

        redisClient = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 2,
            enableReadyCheck: true,
            lazyConnect: false,
            connectTimeout: 5000,
            retryStrategy(times) {
                // Exponential backoff between 1s and 5s
                return Math.min(times * 1000, 5000);
            },
            reconnectOnError(err) {
                const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET'];
                return targetErrors.some(target => err.message.includes(target));
            },
        });

        redisClient.on('connect', () => {
            console.log(`[Redis] Connected to ${sanitizedUrl}`);
        });

        redisClient.on('ready', () => {
            console.log('[Redis] Ready to process commands');
        });

        redisClient.on('error', (err) => {
            const now = Date.now();
            // Throttle connection error logs to once every 10 seconds to avoid console flooding
            if (now - lastLogTime > 10000) {
                console.error(`[Redis] Connection warning: ${err.message} (retrying ${sanitizedUrl})...`);
                lastLogTime = now;
            }
        });

        redisClient.on('reconnecting', (time) => {
            const now = Date.now();
            if (now - lastLogTime > 10000) {
                console.warn(`[Redis] Reconnecting in ${time}ms...`);
            }
        });

        redisClient.on('close', () => {
            // Socket closed
        });
    }

    return redisClient;
}

/**
 * Checks whether the Redis client is currently connected and ready.
 *
 * @returns {boolean} True if ready to execute commands
 */
function isRedisReady() {
    return !!redisClient && redisClient.status === 'ready';
}

/**
 * Gracefully shuts down the Redis connection pool.
 */
async function closeRedis() {
    if (redisClient) {
        try {
            await redisClient.quit();
            console.log('[Redis] Disconnected gracefully');
        } catch (_) {
            redisClient.disconnect();
        }
        redisClient = null;
    }
}

module.exports = {
    getRedisClient,
    isRedisReady,
    closeRedis,
};
