# ── Production Dockerfile for WA-API Gateway ──────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules and code
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public
COPY schema.sql ./schema.sql

# Create non-root user data directory permissions
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
