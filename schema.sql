-- ── WhatsApp Multi-Session API — PostgreSQL DDL Schema ──────────────────────
-- Target: PostgreSQL 14+ / Supabase / Neon / AWS RDS / Self-hosted

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE,
    role VARCHAR(20) DEFAULT 'user',
    device_limit INT DEFAULT 3,
    message_limit INT DEFAULT 100,
    messages_sent_today INT DEFAULT 0,
    last_message_reset DATE,
    trial_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    current_plan_id INT,
    plan_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Devices Table
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(50) UNIQUE NOT NULL,
    session_name VARCHAR(100),
    status VARCHAR(20) CHECK (status IN ('pending', 'connected', 'disconnected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Messages Log Table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50),
    recipient VARCHAR(50),
    message_type VARCHAR(20) CHECK (message_type IN ('text', 'file', 'image')),
    status VARCHAR(50),
    message_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Subscription Plans Table
CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    duration_days INT NOT NULL DEFAULT 30,
    device_limit INT NOT NULL DEFAULT 3,
    message_limit INT NOT NULL DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migration: add is_featured column if it doesn't exist yet
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;


-- 5. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id INT REFERENCES plans(id),
    cf_order_id VARCHAR(100) UNIQUE,
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    payment_id VARCHAR(100),
    cf_payment_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Key-Value Settings Table
CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT
);

-- ── High-Performance B-Tree Indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_device_id ON messages(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_cf_order_id ON orders(cf_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
