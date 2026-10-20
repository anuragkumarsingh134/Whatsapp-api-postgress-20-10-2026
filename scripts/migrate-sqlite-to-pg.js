/**
 * SQLite to PostgreSQL Data Migration Script
 * 
 * Safely extracts tables from data/whatsapp_api.db (SQLite) and loads them
 * into PostgreSQL, preserving foreign key relationships, IDs, timestamps,
 * and auto-increment sequence counters.
 * 
 * Usage:
 *   npm run migrate:pg
 *   or:
 *   node scripts/migrate-sqlite-to-pg.js
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SQLITE_DB_PATH = path.join(__dirname, '..', 'data', 'whatsapp_api.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

/**
 * Extracts all table rows from SQLite into a structured JavaScript object.
 * Attempts Python built-in sqlite3 (zero external npm dependencies required).
 * Falls back to better-sqlite3 if present.
 */
function extractSQLiteData(dbPath) {
    if (!fs.existsSync(dbPath)) {
        throw new Error(`SQLite database not found at: ${dbPath}`);
    }

    // Approach 1: Try Python standard library sqlite3 (available out-of-the-box on most systems)
    try {
        const pythonScript = `
import sqlite3, json, sys

conn = sqlite3.connect(sys.argv[1])
conn.row_factory = sqlite3.Row
cur = conn.cursor()

tables = ['users', 'plans', 'devices', 'messages', 'orders', 'settings']
dump = {}

for t in tables:
    try:
        cur.execute(f"SELECT * FROM {t}")
        rows = [dict(r) for r in cur.fetchall()]
        dump[t] = rows
    except Exception as e:
        dump[t] = []

print(json.dumps(dump))
`;
        const tempScriptPath = path.join(__dirname, '_dump_sqlite_temp.py');
        fs.writeFileSync(tempScriptPath, pythonScript.trim(), 'utf8');

        try {
            const rawOutput = execSync(`python "${tempScriptPath}" "${dbPath}"`, {
                maxBuffer: 50 * 1024 * 1024,
                encoding: 'utf8',
            });
            fs.unlinkSync(tempScriptPath);
            return JSON.parse(rawOutput);
        } catch (pyErr) {
            if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
            throw pyErr;
        }
    } catch (_) {
        // Approach 2: Try requiring better-sqlite3 if available
        try {
            const Database = require('better-sqlite3');
            const db = new Database(dbPath, { readonly: true });
            const dump = {};
            const tables = ['users', 'plans', 'devices', 'messages', 'orders', 'settings'];
            for (const t of tables) {
                try {
                    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
                } catch {
                    dump[t] = [];
                }
            }
            db.close();
            return dump;
        } catch (sqliteErr) {
            throw new Error(
                'Unable to read SQLite database. Ensure Python is installed or run: npm install --no-save better-sqlite3'
            );
        }
    }
}

/**
 * Connects to the default postgres database to verify and create target database if needed.
 */
async function ensureDatabaseExists(clientConfig) {
    let targetDb = clientConfig.database;
    if (!targetDb && clientConfig.connectionString) {
        try {
            const parsed = new URL(clientConfig.connectionString);
            targetDb = parsed.pathname.replace(/^\//, '');
        } catch (_) { }
    }

    if (!targetDb || targetDb === 'postgres') return;

    const adminConfig = clientConfig.connectionString
        ? { connectionString: clientConfig.connectionString.replace(/\/[^/?]+(\?.*)?$/, '/postgres$1') }
        : { ...clientConfig, database: 'postgres' };

    const adminClient = new Client(adminConfig);
    try {
        await adminClient.connect();
        const check = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
        if (check.rowCount === 0) {
            console.log(`      Target database "${targetDb}" does not exist. Creating it now...`);
            await adminClient.query(`CREATE DATABASE "${targetDb}"`);
            console.log(`      Database "${targetDb}" created successfully.\n`);
        }
    } catch (_) {
        // Fall through to let the main client handle or report connection issues
    } finally {
        await adminClient.end().catch(() => {});
    }
}

/**
 * Main migration workflow
 */
async function migrate() {
    console.log('====================================================');
    console.log('   WA-API SQLite -> PostgreSQL Migration Runner     ');
    console.log('====================================================\n');

    // 1. Read SQLite Data
    console.log(`[1/5] Extracting SQLite records from: ${SQLITE_DB_PATH}`);
    const data = extractSQLiteData(SQLITE_DB_PATH);
    console.log(`      Extracted:`);
    console.log(`      - Users:    ${data.users?.length || 0}`);
    console.log(`      - Plans:    ${data.plans?.length || 0}`);
    console.log(`      - Devices:  ${data.devices?.length || 0}`);
    console.log(`      - Messages: ${data.messages?.length || 0}`);
    console.log(`      - Orders:   ${data.orders?.length || 0}`);
    console.log(`      - Settings: ${data.settings?.length || 0}\n`);

    // 2. Connect to PostgreSQL
    const connectionString = process.env.DATABASE_URL;
    const clientConfig = connectionString
        ? { connectionString }
        : {
            host: process.env.PGHOST || '127.0.0.1',
            port: parseInt(process.env.PGPORT || '5432', 10),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || 'postgres',
            database: process.env.PGDATABASE || 'whatsapp_api',
        };

    if (process.env.PGSSL === 'true') {
        clientConfig.ssl = { rejectUnauthorized: false };
    }

    // Attempt to auto-create target database if it does not exist
    await ensureDatabaseExists(clientConfig);

    console.log(`[2/5] Connecting to PostgreSQL at ${clientConfig.host || 'DATABASE_URL'}:${clientConfig.port || ''}...`);
    const client = new Client(clientConfig);

    try {
        await client.connect();
        console.log('      Connected successfully to PostgreSQL.\n');
    } catch (connErr) {
        console.error('      Failed to connect to PostgreSQL!');
        console.error('      Verify that PostgreSQL is running and credentials in .env are correct.');
        console.error(`      Error: ${connErr.message}\n`);
        process.exit(1);
    }

    try {
        // 3. Ensure Schema Exists
        console.log(`[3/5] Applying PostgreSQL DDL Schema (${SCHEMA_PATH})...`);
        const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
        await client.query(schemaSql);
        console.log('      Schema tables and indexes verified.\n');

        // 4. Migrate Data within a Single Transaction
        console.log('[4/5] Migrating records into PostgreSQL...');
        await client.query('BEGIN');

        // Users
        let usersMigrated = 0;
        for (const u of (data.users || [])) {
            await client.query(`
                INSERT INTO users (
                    id, email, password_hash, api_key, role, device_limit, message_limit,
                    messages_sent_today, last_message_reset, trial_expires_at, is_active,
                    current_plan_id, plan_expires_at, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    api_key = EXCLUDED.api_key,
                    role = EXCLUDED.role,
                    device_limit = EXCLUDED.device_limit,
                    message_limit = EXCLUDED.message_limit,
                    messages_sent_today = EXCLUDED.messages_sent_today,
                    trial_expires_at = EXCLUDED.trial_expires_at,
                    is_active = EXCLUDED.is_active
            `, [
                u.id, u.email, u.password_hash, u.api_key, u.role || 'user',
                u.device_limit || 3, u.message_limit || 100, u.messages_sent_today || 0,
                u.last_message_reset || null, u.trial_expires_at || null,
                u.is_active === 1 || u.is_active === true || u.is_active === '1',
                u.current_plan_id || null, u.plan_expires_at || null, u.created_at || new Date()
            ]);
            usersMigrated++;
        }
        console.log(`      - Users imported: ${usersMigrated}`);

        // Plans
        let plansMigrated = 0;
        for (const p of (data.plans || [])) {
            await client.query(`
                INSERT INTO plans (
                    id, name, description, price, duration_days, device_limit, message_limit, is_active, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    is_active = EXCLUDED.is_active
            `, [
                p.id, p.name, p.description || '', p.price, p.duration_days,
                p.device_limit, p.message_limit, p.is_active === 1 || p.is_active === true,
                p.created_at || new Date()
            ]);
            plansMigrated++;
        }
        console.log(`      - Plans imported: ${plansMigrated}`);

        // Devices
        let devicesMigrated = 0;
        for (const d of (data.devices || [])) {
            await client.query(`
                INSERT INTO devices (id, user_id, device_id, session_name, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (device_id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    session_name = EXCLUDED.session_name,
                    status = EXCLUDED.status
            `, [d.id, d.user_id, d.device_id, d.session_name || d.device_id, d.status || 'pending', d.created_at || new Date()]);
            devicesMigrated++;
        }
        console.log(`      - Devices imported: ${devicesMigrated}`);

        // Messages
        let messagesMigrated = 0;
        for (const m of (data.messages || [])) {
            await client.query(`
                INSERT INTO messages (id, device_id, recipient, message_type, status, message_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO NOTHING
            `, [m.id, m.device_id, m.recipient, m.message_type, m.status, m.message_id, m.created_at || new Date()]);
            messagesMigrated++;
        }
        console.log(`      - Messages imported: ${messagesMigrated}`);

        // Orders
        let ordersMigrated = 0;
        for (const o of (data.orders || [])) {
            await client.query(`
                INSERT INTO orders (id, user_id, plan_id, cf_order_id, amount, status, payment_id, cf_payment_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (cf_order_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    payment_id = EXCLUDED.payment_id,
                    cf_payment_id = EXCLUDED.cf_payment_id
            `, [o.id, o.user_id, o.plan_id, o.cf_order_id, o.amount, o.status, o.payment_id, o.cf_payment_id, o.created_at || new Date()]);
            ordersMigrated++;
        }
        console.log(`      - Orders imported: ${ordersMigrated}`);

        // Settings
        let settingsMigrated = 0;
        for (const s of (data.settings || [])) {
            await client.query(`
                INSERT INTO settings (setting_key, setting_value)
                VALUES ($1, $2)
                ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
            `, [s.setting_key, String(s.setting_value)]);
            settingsMigrated++;
        }
        console.log(`      - Settings imported: ${settingsMigrated}\n`);

        // 5. Reset PostgreSQL Sequences
        console.log('[5/5] Synchronizing PostgreSQL sequence generators...');
        const sequenceSyncs = [
            `SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1))`,
            `SELECT setval('plans_id_seq', COALESCE((SELECT MAX(id) FROM plans), 1))`,
            `SELECT setval('devices_id_seq', COALESCE((SELECT MAX(id) FROM devices), 1))`,
            `SELECT setval('messages_id_seq', COALESCE((SELECT MAX(id) FROM messages), 1))`,
            `SELECT setval('orders_id_seq', COALESCE((SELECT MAX(id) FROM orders), 1))`,
        ];

        for (const seqQuery of sequenceSyncs) {
            await client.query(seqQuery);
        }
        console.log('      Auto-increment sequence counters synchronized.\n');

        await client.query('COMMIT');

        console.log('====================================================');
        console.log('   Migration completed successfully with 0 errors!  ');
        console.log('====================================================\n');
    } catch (migErr) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('\nMigration aborted due to error:');
        console.error(migErr);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate().catch((err) => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
});
