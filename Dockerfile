# Production Dockerfile for Google Cloud Run
# Build: gcloud run deploy --source .
# Local: docker build -t home-pulse-watcher .

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps
WORKDIR /app

# Copy workspace package files for Docker layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY libs/core/package.json ./libs/core/
COPY libs/shared/package.json ./libs/shared/
COPY libs/application/package.json ./libs/application/
COPY libs/infrastructure/package.json ./libs/infrastructure/

# Skip postinstall script (prisma generate) — Prisma schema not yet available
# Will generate client explicitly in build stage after schema is copied
RUN npm ci --ignore-scripts

# ============================================
# Stage 2: Build application
# ============================================
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (required before webpack build)
RUN npx prisma generate

# Disable Nx daemon in Docker (non-interactive, no need for daemon)
ENV NX_DAEMON=false

# Sync workspace (TypeScript project references) and build
# Webpack bundles all deps except Prisma externals into main.js/cli.js
RUN npx nx sync && npx nx build api

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:22-alpine AS production

# tini for proper PID 1 signal handling (Cloud Run sends SIGTERM)
RUN apk add --no-cache tini

WORKDIR /app

# Copy bundled application from build stage
# Includes main.js, cli.js, and minimal package.json (only Prisma externals)
COPY --chown=node:node --from=build /app/apps/api/dist ./

# Copy Prisma schema, migrations, and config for runtime migration
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/prisma.config.ts ./prisma.config.ts

# Copy entrypoint script with execute permission
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Install external dependencies (Prisma + pg from minimal package.json)
RUN npm install --omit=dev

# Install Prisma CLI for generate + runtime migrations (not in prod deps)
RUN npm install --no-save prisma dotenv

# Generate Prisma client in production node_modules
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run as non-root user for least-privilege hardening
USER node

ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]
