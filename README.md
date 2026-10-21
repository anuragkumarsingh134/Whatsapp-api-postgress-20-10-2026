# 💬 WhatsApp Multi-Session API Gateway & Dashboard

A production-ready, self-hosted WhatsApp API gateway and management platform built with **Node.js**, **Baileys**, and **PostgreSQL**. Manage multiple WhatsApp sessions, send text and media messages via straightforward REST GET/POST endpoints, customize subscription tiers, and control operations from an interactive web dashboard.

---

## ✨ Key Features

- **🌐 Dedicated Marketing Landing Page (`/`)** — Glassmorphic dark aesthetic, interactive feature grid, dynamic pricing tiers, live code viewer, and friction-free momentum scrolling via Lenis.
- **📱 Multi-Session Dashboard (`/app`)** — Authenticated single-page application for managing WhatsApp devices, live QR code pairing, device status, and message history.
- **✉️ REST API Endpoints** — Send plain text, images, and PDF documents (up to 15 MB) to individuals or WhatsApp Group JIDs via simple HTTP query parameters.
- **💎 Dynamic Pricing & Subscription Tiers** — Built-in 7-day free trial, configurable plans, daily message quotas, and device limits managed directly in PostgreSQL.
- **👑 Admin Control Panel** — Comprehensive admin dashboard to manage all users, adjust quotas, extend trials, create/edit subscription plans, toggle active visibility, and feature plans as "Most Popular".
- **🐘 PostgreSQL Storage** — Enterprise-grade persistence with automated schema initialization, index optimization, and relational data integrity.
- **⚡ Optional Redis Session Store** — Distributed Baileys authentication state caching with automatic fallback to local storage.
- **🔑 Dual Authentication** — Secure JWT bearer authentication for dashboard users and 32-character hex API keys for external applications.
- **🔄 Session Auto-Reconnect** — Automatic background session recovery across server restarts with exponential backoff.
- **🛡️ Rate Limiting & Protection** — Express rate-limiting (60 req/min per IP) to prevent abuse and ensure stability.

---

## 📁 Project Structure

```
├── public/                       # Frontend web applications
│   ├── landing.html              # Marketing landing page (served at /)
│   ├── index.html                # App dashboard SPA (served at /app)
│   ├── css/
│   │   ├── landing.css           # Landing page design system & animations
│   │   └── style.css             # Dashboard dark glassmorphism theme
│   └── js/
│       ├── lenis.min.js          # Momentum smooth scrolling engine
│       ├── core.js               # Utilities, Toast notifications & API client
│       ├── auth.js               # Sign in, sign up & session redirects
│       ├── devices.js            # Device creation, QR polling & management
│       ├── messages.js           # Send messages, composer & chat previews
│       ├── plans.js              # Subscription plans & quota viewer
│       ├── admin.js              # Admin user management & plan editor
│       ├── docs.js               # Interactive live API documentation
│       └── app.js                # Router & navigation bootstrap
├── src/                          # Backend server source code
│   ├── server.js                 # Express server & route registration
│   ├── config/
│   │   ├── db.js                 # PostgreSQL pool, queries & auto-seeding
│   │   └── redis.js              # Redis connection for distributed sessions
│   ├── controllers/
│   │   ├── authController.js     # User registration, login & API keys
│   │   ├── deviceController.js   # WhatsApp session lifecycle & QR codes
│   │   ├── messageController.js  # Text & file dispatching logic
│   │   ├── planController.js     # Plan listing, creation & management
│   │   └── adminController.js    # User moderation & quota adjustments
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification
│   │   ├── adminMiddleware.js    # Admin authorization check
│   │   ├── apiKeyMiddleware.js   # API key validation for external clients
│   │   └── trialMiddleware.js    # Quota & expiration enforcement
│   ├── routes/
│   │   ├── authRoutes.js         # /auth/*
│   │   ├── deviceRoutes.js       # /device/*
│   │   ├── messageRoutes.js      # /api/messages/*
│   │   ├── planRoutes.js         # /plans/*
│   │   └── adminRoutes.js        # /admin/*
│   └── services/
│       ├── sessionManager.js     # In-memory Baileys socket registry
│       ├── whatsappService.js    # Baileys protocol wrapper
│       └── quotaService.js       # Quota verification & tracking
├── schema.sql                    # PostgreSQL database schema & indexes
├── .env.example                  # Environment configuration template
├── package.json
└── README.md
```

---

## 🚀 Installation & Setup

### Prerequisites

Ensure the following are installed on your machine:
- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **PostgreSQL** v14 or higher (running locally or remotely)
- **Redis** *(optional)* for distributed session caching

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/anuragkumarsingh134/Whatsapp-api-postgress-20-10-2026.git
cd Whatsapp-api-postgress-20-10-2026
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Create the PostgreSQL Database

Open a terminal or PostgreSQL CLI (`psql`) and create the database:

```sql
CREATE DATABASE whatsapp_api;
```

*(Or via command line)*:
```bash
createdb -U postgres whatsapp_api
```

> **Note:** The server will automatically execute `schema.sql` on its initial run to create all required tables, foreign keys, and indexes.

### Step 4: Configure Environment Variables

Copy the template environment file:

```bash
cp .env.example .env
```

Open `.env` in an editor and update your database and security credentials:

```env
PORT=3000
JWT_SECRET=your_strong_random_jwt_secret_here

# PostgreSQL Configuration
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/whatsapp_api
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_postgres_password
PGDATABASE=whatsapp_api
PGSSL=false
PGMAX_POOL=20

# Redis Configuration (Optional - falls back to local storage if unavailable)
REDIS_URL=redis://127.0.0.1:6379

# Cashfree Payment Gateway (Optional)
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_ENV=sandbox
```

### Step 5: Start the Application

```bash
npm start
```

For development with automatic restarts:
```bash
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## 🖥️ First-Time Usage & Admin Setup

1. **Visit the App**: Go to **`http://localhost:3000`** to view the marketing landing page, or go directly to **`http://localhost:3000/app`** to access the dashboard.
2. **First Registered User = Administrator**:
   - The **first account** registered via the signup form is automatically elevated to `role = 'admin'` with unlimited device and message quotas.
   - Subsequent signups receive standard user permissions with a 7-day free trial.
3. **Connect a WhatsApp Number**:
   - In the dashboard, click **Add Device**.
   - Enter your phone number with country code (e.g., `918919007019`).
   - Click **Scan QR Code** and pair using WhatsApp on your phone (*Settings → Linked Devices → Link a Device*).
4. **Generate Your API Key**:
   - Navigate to the **API / Docs** section in the dashboard to copy your personal 32-character API key.
5. **Manage Plans & Users**:
   - As an admin, access the **Admin Panel** tab in the sidebar to adjust quotas, configure plan prices, mark plans as "Most Popular", or toggle plan visibility.

---

## 📡 API Reference

### 1. Authentication Endpoints

| Method | Endpoint | Access | Body / Params | Description |
|--------|----------|--------|---------------|-------------|
| `POST` | `/auth/register` | Public | `{ email, password }` | Register a new user |
| `POST` | `/auth/login` | Public | `{ email, password }` | Authenticate user & receive JWT |
| `GET` | `/auth/me` | JWT | Header: `Bearer <token>` | Fetch current user info & quotas |
| `POST` | `/auth/api-key` | JWT | Header: `Bearer <token>` | Generate or rotate API key |

---

### 2. Subscription Plans

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/plans/list` | Public | List all active plans for landing page & purchase |
| `GET` | `/plans/all` | Admin | List all plans including hidden/inactive tiers |
| `POST` | `/plans/create` | Admin | Create a new subscription plan tier |
| `PUT` | `/plans/:id` | Admin | Update plan price, quotas, or featured status |
| `DELETE`| `/plans/:id` | Admin | Delete or deactivate a plan |

---

### 3. Device Management (JWT Required)

| Method | Endpoint | Params / Body | Description |
|--------|----------|---------------|-------------|
| `POST` | `/device/create` | `{ deviceId, sessionName }` | Register a new WhatsApp number |
| `GET` | `/device/qr` | `?deviceId=xxx` | Retrieve current Base64 QR pairing code |
| `GET` | `/device/status` | `?deviceId=xxx` | Check device connection state |
| `GET` | `/device/list` | — | List all devices belonging to user |
| `GET` | `/device/profile-photo`| `?deviceId=xxx` | Fetch connected profile picture |
| `DELETE`| `/device/delete` | `?deviceId=xxx` | Unlink device & clean up session |

---

### 4. Messaging Endpoints (API Key Required)

#### Send Plain Text Message
```http
GET /api/messages/send-text?deviceId=YOUR_DEVICE_ID&apiKey=YOUR_API_KEY&number=RECIPIENT_NUMBER&message=Hello+World
```
*Supports individual phone numbers with country code or WhatsApp Group JIDs (e.g., `12036302XXXXXXXXXX@g.us`).*

#### Send File / PDF Document
```http
GET /api/messages/send-file?deviceId=YOUR_DEVICE_ID&apiKey=YOUR_API_KEY&number=RECIPIENT_NUMBER&url=https://example.com/invoice.pdf&fileName=Invoice.pdf
```

---

### 5. Admin Endpoints (Admin Role Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users` | List all registered users with usage stats |
| `GET` | `/admin/users/:id` | Get user details and quota limits |
| `PUT` | `/admin/users/:id` | Update user role, device limit, message limit, or trial expiry |
| `DELETE`| `/admin/users/:id`| Delete user and cascade delete associated devices |
| `POST` | `/admin/users/:id/reset-counter` | Reset daily sent message counter to 0 |

---

## 🛠️ Production Deployment (Linux / Ubuntu)

### Option A: Using PM2 (Recommended)

1. **Install PM2 globally:**
   ```bash
   npm install -g pm2
   ```

2. **Start the application:**
   ```bash
   pm2 start src/server.js --name "wa-api"
   pm2 save
   pm2 startup
   ```

---

### Option B: Nginx Reverse Proxy with SSL

Configure Nginx as a reverse proxy to forward traffic to port `3000`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS via Let's Encrypt Certbot:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.yourdomain.com
```

---

## ⚙️ Environment Variables Summary

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Port Express listens on |
| `JWT_SECRET` | **Yes** | — | Strong secret string used to sign JWT tokens |
| `DATABASE_URL` | No | — | Full PostgreSQL connection string |
| `PGHOST` | No | `127.0.0.1` | PostgreSQL server host |
| `PGPORT` | No | `5432` | PostgreSQL server port |
| `PGUSER` | No | `postgres` | PostgreSQL username |
| `PGPASSWORD` | No | `postgres` | PostgreSQL password |
| `PGDATABASE` | No | `whatsapp_api` | PostgreSQL database name |
| `PGSSL` | No | `false` | Set to `true` if connecting to managed SSL databases |
| `PGMAX_POOL` | No | `20` | Max pool connections for pg client |
| `REDIS_URL` | No | `redis://127.0.0.1:6379` | Redis connection URL for session tokens |
| `CASHFREE_APP_ID` | No | — | Cashfree payment gateway App ID |
| `CASHFREE_SECRET_KEY` | No | — | Cashfree payment gateway Secret Key |
| `CASHFREE_ENV` | No | `sandbox` | `sandbox` or `production` |

---

## 📞 Support & Inquiries

- **Email:** [anuragkumarsingh1435@gmail.com](mailto:anuragkumarsingh1435@gmail.com)
- **Phone / WhatsApp:** [+91 9603761820](https://wa.me/919603761820)

---

## 📝 License

Distributed under the **MIT** License. See `LICENSE` for more details.
