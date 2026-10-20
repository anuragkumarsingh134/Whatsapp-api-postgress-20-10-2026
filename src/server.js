require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initializeDatabase } = require('./config/db');
const { restoreAllSessions } = require('./services/whatsappService');

const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const messageRoutes = require('./routes/messageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const planRoutes = require('./routes/planRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Core Middleware ──────────────────────────────────────────
app.use(cors());

// Parse JSON while capturing raw body buffer for Cashfree webhook HMAC verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    },
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiter: 60 requests per minute per IP
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// ── Application Routes ───────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/device', deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/admin', adminRoutes);
app.use('/plans', planRoutes);
app.use('/payment', paymentRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp Multi-Session API is operational',
        version: '1.0.0',
        uptime: process.uptime(),
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Server Bootstrap ─────────────────────────────────────────
async function start() {
    try {
        // Initialize PostgreSQL database pool and run schema migrations
        await initializeDatabase();

        // Start HTTP server
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

        // Restore active WhatsApp sessions with existing credentials after server spin-up
        setTimeout(async () => {
            await restoreAllSessions();
        }, 2000);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
