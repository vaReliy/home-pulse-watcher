---
name: devops
description: >-
  DevOps for Node.js/TypeScript applications. Docker setup, CI/CD pipelines, GitHub Actions, PM2 process management, environment configuration, deployment.
  
  Українською: DevOps, деплой, Docker, CI/CD, GitHub Actions, PM2, інфраструктура, конфігурація середовища, налаштування контейнера.
---

# DevOps — Node.js/TypeScript

## Docker Development Setup

```bash
# Start all services
docker compose up -d

# Install dependencies (always npm ci)
docker compose exec app npm ci

# Run migrations
docker compose exec app npx prisma migrate dev

# Start dev server
docker compose exec app npm run dev
```

### Multi-Stage Dockerfile

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### docker-compose.yml Services

- `app` — Node.js (port 3000)
- `postgres` — PostgreSQL 17 (port 5432)
- `redis` — Redis 7 (port 6379)

## npm Scripts

Standard `package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "migrate": "prisma migrate deploy"
  }
}
```

## GitHub Actions CI Pipeline

```yaml
name: CI

on: [push, pull_request]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx eslint .
      - run: npx prettier --check .

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready --health-interval 10s


      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx vitest run --coverage
```

Cache key: `${{ hashFiles('package-lock.json') }}` — always lock to lockfile.

## Environment Configuration

Use a typed config service — never raw `process.env` in application code:

```typescript
export class Config {
  readonly port = parseInt(process.env.PORT ?? '3000', 10);
  readonly databaseUrl = this.require('DATABASE_URL');
  readonly redisUrl = this.require('REDIS_URL');

  private require(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Required env var missing: ${key}`);
    return value;
  }
}
```

Validate all required env vars on startup — fail fast before accepting requests.

## Production

- **PM2** cluster mode: `pm2 start dist/main.js -i max`
- **Health check**: `GET /health` endpoint returning `{ status: 'ok' }`
- **Graceful shutdown**: handle `SIGTERM` — close HTTP server, drain queue workers, disconnect DB
