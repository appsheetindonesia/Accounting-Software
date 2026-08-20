# ============================================================
# Dockerfile — Accounting Software
#
# Multi-stage build untuk production deployment.
# Support: Docker, Easypanel, Coolify, Railway, Render
# ============================================================

# ── Stage 1: Build React/Vite frontend ─────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app

# Copy package files (root = frontend)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source (src/, public/, index.html, vite.config.ts, tsconfig*.json)
COPY src/ ./src/
COPY public/ ./public/
COPY index.html vite.config.ts vitest.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./

# Build (tsc + vite build)
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Install PostgreSQL client (needed for DATABASE_URL mode)
RUN apk add --no-cache postgresql-client

# Copy mock-api
COPY mock-api/package.json mock-api/package-lock.json ./mock-api/
WORKDIR /app/mock-api
RUN npm ci --omit=dev
WORKDIR /app

COPY mock-api/ ./mock-api/

# Copy built frontend into mock-api/static/ agar bisa di-serve
COPY --from=frontend-build /app/dist/ ./mock-api/static/

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV MOCK_API_PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "mock-api/index.js"]
