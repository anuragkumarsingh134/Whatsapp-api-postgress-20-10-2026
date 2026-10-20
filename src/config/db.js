const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;

/**
 * Converts SQLite '?' placeholders to PostgreSQL indexed '$1, $2...' placeholders.
 *
 * @param {string} sql - SQL string with '?' or '$1' placeholders
 * @returns {string} PostgreSQL compatible SQL
 */
function convertPlaceholders(sql) {
    if (!sql || typeof sql !== 'string') return sql;
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

/**
 * Initializes and returns the PostgreSQL connection pool.
 *
 * @returns {Pool} Active pg.Pool instance
 */
function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        const config = connectionString
            ? { connectionString }
            : {
                host: process.env.PGHOST || '127.0.0.1',
                port: parseInt(process.env.PGPORT || '5432', 10),
                user: process.env.PGUSER || 'postgres',
                password: process.env.PGPASSWORD || 'postgres',
                database: process.env.PGDATABASE || 'whatsapp_api',
            };

        if (process.env.PGSSL === 'true') {
            config.ssl = { rejectUnauthorized: false };
        }

        config.max = parseInt(process.env.PGMAX_POOL || '20', 10);
        config.idleTimeoutMillis = 30000;
        config.connectionTimeoutMillis = 5000;

        pool = new Pool(config);

        pool.on('connect', () => {
            // Client connected to pool
        });

        pool.on('error', (err) => {
            console.error('[PostgreSQL Pool] Unexpected client error:', err.message);
        });
    }

    return pool;
}

/**
 * Initializes PostgreSQL database schema and required indexes.
 */
async function initializeDatabase() {
    const currentPool = getPool();

    try {
        const client = await currentPool.connect();
        try {
            const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                await client.query(schemaSql);
                console.log('PostgreSQL schema and indexes verified.');
            }
        } finally {
            client.release();
        }
        console.log('Database ready (PostgreSQL).');
    } catch (err) {
        console.error('[PostgreSQL] Database initialization warning:', err.message);
        console.warn('Ensure PostgreSQL credentials in .env are configured.');
    }
}

/**
 * Executes a query with parameter conversion.
 *
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const p = getPool();
    return p.query(pgSql, params);
}

/**
 * Helper: run a query and return all matching rows.
 *
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>}
 */
async function dbAll(sql, params = []) {
    const result = await query(sql, params);
    return result.rows || [];
}

/**
 * Helper: run a query and return the first matching row, or null.
 *
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>}
 */
async function dbGet(sql, params = []) {
    const result = await query(sql, params);
    return result.rows[0] || null;
}

/**
 * Helper: run a mutating query (INSERT, UPDATE, DELETE).
 * For INSERT statements without RETURNING, automatically appends RETURNING id.
 *
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<{ lastID: number|null, changes: number }>}
 */
async function dbRun(sql, params = []) {
    let pgSql = convertPlaceholders(sql);

    // If INSERT and no RETURNING clause present, append RETURNING id to get lastID
    const isInsert = /^\s*insert\s+into/i.test(pgSql);
    if (isInsert && !/returning/i.test(pgSql)) {
        pgSql += ' RETURNING id';
    }

    const p = getPool();
    const result = await p.query(pgSql, params);
    const lastID = result.rows?.[0]?.id ?? null;
    const changes = result.rowCount ?? 0;

    return { lastID, changes };
}

/**
 * Executes a callback within a managed transaction (BEGIN ... COMMIT / ROLLBACK).
 *
 * @param {Function} callback - Function receiving the transactional client
 * @returns {Promise<any>}
 */
async function transaction(callback) {
    const p = getPool();
    const client = await p.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Gracefully terminates the connection pool.
 */
async function closeDb() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

module.exports = {
    initializeDatabase,
    getPool,
    query,
    dbAll,
    dbGet,
    dbRun,
    transaction,
    closeDb,
};
