const {
    proto,
    initAuthCreds,
    BufferJSON,
    useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const { getRedisClient } = require('../config/redis');

const AUTH_KEY_PREFIX = 'wa-auth';
const LEGACY_AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');

/**
 * Generates the Redis Hash key for a specific device session.
 *
 * @param {string} deviceId - WhatsApp device phone number / ID
 * @returns {string} Namespaced Redis key (e.g. wa-auth:918919007019)
 */
function getRedisHashKey(deviceId) {
    return `${AUTH_KEY_PREFIX}:${deviceId}`;
}

/**
 * Baileys AuthenticationState adapter powered by Redis Hashes.
 *
 * Stores all credentials, pre-keys, and sessions in a single Redis Hash per device
 * (`wa-auth:<deviceId>`), allowing horizontal scaling across multiple worker nodes.
 *
 * Automatically migrates existing local disk session data into Redis when connected.
 * Falls back gracefully to local multi-file auth if Redis server is offline.
 *
 * @param {string} deviceId - Device identifier (phone number)
 * @returns {Promise<{ state: { creds: Object, keys: Object }, saveCreds: Function }>}
 */
async function useRedisAuthState(deviceId) {
    const redis = getRedisClient();
    const hashKey = getRedisHashKey(deviceId);

    // ── Attempt to Read or Migrate via Redis ────────────────────────────────────
    let creds = null;
    let useRedis = true;

    try {
        const rawCreds = await redis.hget(hashKey, 'creds');
        if (rawCreds) {
            creds = JSON.parse(rawCreds, BufferJSON.reviver);
        }
    } catch (err) {
        console.warn(`[RedisAuth:${deviceId}] Redis unreachable (${err.message}). Using local auth fallback.`);
        useRedis = false;
    }

    // Graceful offline fallback: allows development/local testing even if Redis service is not yet started
    if (!useRedis) {
        const localDir = path.join(LEGACY_AUTH_DIR, deviceId);
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }
        return useMultiFileAuthState(localDir);
    }

    // If creds not in Redis, check if legacy disk files exist to auto-migrate seamlessly
    if (!creds) {
        const legacyCredsPath = path.join(LEGACY_AUTH_DIR, deviceId, 'creds.json');
        if (fs.existsSync(legacyCredsPath)) {
            try {
                console.log(`[RedisAuth:${deviceId}] Migrating existing disk session to Redis...`);
                const fileContent = fs.readFileSync(legacyCredsPath, 'utf8');
                creds = JSON.parse(fileContent, BufferJSON.reviver);
                await redis.hset(hashKey, 'creds', JSON.stringify(creds, BufferJSON.replacer));

                // Migrate all key files (e.g., pre-key-1.json, session-xxx.json)
                const deviceDir = path.dirname(legacyCredsPath);
                const files = fs.readdirSync(deviceDir);
                const batch = {};

                for (const file of files) {
                    if (file === 'creds.json' || !file.endsWith('.json')) continue;
                    const match = file.replace('.json', '').match(/^([a-z\-]+)-(.+)$/);
                    if (match) {
                        const [, category, id] = match;
                        const data = fs.readFileSync(path.join(deviceDir, file), 'utf8');
                        batch[`${category}:${id}`] = data;
                    }
                }

                if (Object.keys(batch).length > 0) {
                    await redis.hset(hashKey, batch);
                }
                console.log(`[RedisAuth:${deviceId}] Migration complete (${Object.keys(batch).length} keys imported to Redis)`);
            } catch (migErr) {
                console.error(`[RedisAuth:${deviceId}] Session migration error:`, migErr.message);
                creds = initAuthCreds();
            }
        } else {
            creds = initAuthCreds();
        }
    }

    // ── Baileys AuthenticationState Interface ──────────────────────────────────
    return {
        state: {
            creds,
            keys: {
                /**
                 * Batch retrieve cryptographic keys using Redis HMGET in a single network round-trip.
                 */
                get: async (type, ids) => {
                    const data = {};
                    if (!ids || ids.length === 0) return data;

                    try {
                        const fields = ids.map(id => `${type}:${id}`);
                        const values = await redis.hmget(hashKey, ...fields);

                        for (let i = 0; i < ids.length; i++) {
                            const id = ids[i];
                            const raw = values[i];
                            if (raw) {
                                try {
                                    let value = JSON.parse(raw, BufferJSON.reviver);
                                    if (type === 'app-state-sync-key' && value) {
                                        value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                    }
                                    data[id] = value;
                                } catch (_) {
                                    data[id] = null;
                                }
                            } else {
                                data[id] = null;
                            }
                        }
                    } catch (err) {
                        console.error(`[RedisAuth:${deviceId}] Error in keys.get (${type}):`, err.message);
                        ids.forEach(id => { data[id] = null; });
                    }

                    return data;
                },

                /**
                 * Batch store or delete cryptographic keys using pipelined HSET / HDEL.
                 */
                set: async (data) => {
                    try {
                        const toSet = {};
                        const toDel = [];

                        for (const category in data) {
                            for (const id in data[category]) {
                                const value = data[category][id];
                                const field = `${category}:${id}`;
                                if (value) {
                                    toSet[field] = JSON.stringify(value, BufferJSON.replacer);
                                } else {
                                    toDel.push(field);
                                }
                            }
                        }

                        const pipeline = redis.pipeline();
                        if (Object.keys(toSet).length > 0) {
                            pipeline.hset(hashKey, toSet);
                        }
                        if (toDel.length > 0) {
                            pipeline.hdel(hashKey, ...toDel);
                        }
                        await pipeline.exec();
                    } catch (err) {
                        console.error(`[RedisAuth:${deviceId}] Error in keys.set:`, err.message);
                    }
                },
            },
        },

        /**
         * Persists updated session credentials into Redis Hash.
         */
        saveCreds: async () => {
            try {
                await redis.hset(hashKey, 'creds', JSON.stringify(creds, BufferJSON.replacer));
            } catch (err) {
                console.error(`[RedisAuth:${deviceId}] Error in saveCreds:`, err.message);
            }
        },
    };
}

/**
 * Purges all authentication keys for a device from Redis.
 *
 * @param {string} deviceId - Unique device phone number / ID
 */
async function purgeRedisAuthState(deviceId) {
    try {
        const redis = getRedisClient();
        const hashKey = getRedisHashKey(deviceId);
        await redis.del(hashKey);
        console.log(`[RedisAuth:${deviceId}] Purged Redis auth hash "${hashKey}"`);
    } catch (err) {
        console.error(`[RedisAuth:${deviceId}] Error purging Redis auth state:`, err.message);
    }

    // Clean up any lingering local legacy folder if present
    const legacyPath = path.join(LEGACY_AUTH_DIR, deviceId);
    try {
        if (fs.existsSync(legacyPath)) {
            fs.rmSync(legacyPath, { recursive: true, force: true });
        }
    } catch (_) { }
}

module.exports = {
    useRedisAuthState,
    purgeRedisAuthState,
    getRedisHashKey,
};
