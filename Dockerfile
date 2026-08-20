# ── Stage 1: Build React/Vite frontend ─────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app

# Copy package files
COPY prototype-accounting/package.json prototype-accounting/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY prototype-accounting/ ./

# Build (tsc + vite build) — tanpa base path agar aset langsung di root
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Install pg driver (needed for PostgreSQL mode)
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

CMD ["node", "mock-api/index.js"]
