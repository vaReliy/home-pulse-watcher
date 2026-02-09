# Production Dockerfile for Google Cloud Run
# Build: gcloud run deploy --source .
# Local: docker build -t home-pulse-watcher .

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app

# Copy workspace package files for Docker layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY libs/core/package.json ./libs/core/
COPY libs/shared/package.json ./libs/shared/
COPY libs/application/package.json ./libs/application/
COPY libs/infrastructure/package.json ./libs/infrastructure/

RUN npm ci

# ============================================
# Stage 2: Build application
# ============================================
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (required before webpack build)
RUN npx prisma generate

# Disable Nx daemon in Docker (non-interactive, no need for daemon)
ENV NX_DAEMON=false

# Sync workspace (TypeScript project references) and build
RUN npx nx sync && npx nx build api

# Create minimal production package.json + package-lock.json
RUN npx nx run api:prune

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:20-alpine AS production

# tini for proper PID 1 signal handling (Cloud Run sends SIGTERM)
RUN apk add --no-cache tini

WORKDIR /app

# Copy bundled application from build stage
COPY --from=build /app/apps/api/dist ./

# Copy Prisma schema + migrations for runtime migration
COPY --from=build /app/prisma ./prisma

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Install only production dependencies (from pruned package.json)
RUN npm ci --omit=dev

# Install Prisma CLI for runtime migrations (not in prod deps)
RUN npm install --no-save prisma

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]
