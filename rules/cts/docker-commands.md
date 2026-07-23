# Docker Environment Commands

**All commands MUST run inside the Docker container.**

## ORM / Prisma

```bash
docker compose exec app npx prisma migrate dev --name create_posts_table
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma generate
docker compose exec app npx prisma studio
docker compose exec app npx prisma migrate reset
```

## TypeORM (alternative)

```bash
docker compose exec app npx typeorm migration:generate src/migrations/CreatePostsTable
docker compose exec app npx typeorm migration:run
docker compose exec app npx typeorm migration:revert
```

## Code Quality

Use nx targets (see `rules/cts/workflow.md` → Command Execution Policy). Run them locally — they do not need a Docker context:

```bash
nx lint api                        # ESLint via nx
nx lint api --fix                  # auto-fix
nx build api --skip-nx-cache       # type-check + build
nx run-many --target=lint          # lint all projects
```

Prettier is workspace-wide and has no nx target — run directly from the workspace root:

```bash
npx prettier --check .
npx prettier --write .
```

## Testing

Use nx targets locally (see `rules/cts/workflow.md` → Command Execution Policy):

```bash
nx test api                         # vitest via nx
nx test api --skip-nx-cache         # bypass cache
nx run-many --target=test           # all projects
```

Stryker mutation testing has no nx plugin — run inside Docker:

```bash
docker compose exec app npx stryker run
```

## Build & Dev Server

```bash
nx build api                        # production build
nx serve api                        # dev server with watch
```

## Package Management

```bash
# ALWAYS use npm ci — never npm install
docker compose exec app npm ci
docker compose exec app npm ci --production
```

> **NEVER run commands outside Docker** — all dependencies exist only in the container. **NEVER put business logic in route handlers** — use UseCases/Services.

## Docker Compose Healthchecks

### Container healthchecks: `curl` not `wget` for IPv4/IPv6 compatibility

Alpine Linux containers default to IPv6-first DNS resolution. The BusyBox `wget --spider http://localhost:PORT/...` does NOT implement happy-eyeballs fallback — if the service binds to IPv4 only (`0.0.0.0:8080`), the probe gets connection-refused and the container stays unhealthy.

**Fix**: use `curl -sf` instead, which correctly handles IPv4/IPv6 fallback:

```yaml
# docker-compose.yml
services:
  web:
    image: nginx:1.27-alpine
    healthcheck:
      test: ['CMD', 'curl', '-sf', 'http://127.0.0.1:8080/health']
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
```

Both `curl` and `wget` ship by default in Alpine nginx/node images; `curl` is the safer choice.

Note: the `node:22-alpine` image does not include `wget` or `curl` by default. Use Node.js inline HTTP instead:

```yaml
services:
  api:
    image: node:22-alpine
    healthcheck:
      test: ['CMD', 'node', '-e', "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
```

If your app sets a global route prefix (e.g. NestJS `app.setGlobalPrefix('api')`), the health endpoint moves accordingly (`/api/health`, not `/health`) — a healthcheck hitting the wrong path causes the container to never reach `healthy` state.

### GitHub Actions service-container health-cmd needs single-token quoting

GitHub Actions `services.<name>.options` is passed straight to `docker create`, which parses `--health-cmd` as taking exactly one token — the docker-compose array healthcheck form (`test: ['CMD', 'mongosh', '--eval', "..."]`) does not translate to this syntax. A multi-word health command must be wrapped as one single quoted string:

```yaml
options: --health-cmd "mongosh --eval \"db.adminCommand('ping')\""
```

An unquoted `--health-cmd mongosh --eval "db.adminCommand('ping')"` fails with `unknown flag: --eval` (exit 125) at container-creation time, before any CI step runs — a silent trap because the YAML itself has no lint error. Always dry-run the equivalent `docker create --health-cmd ... <image>` locally before trusting `services.*.options` health-cmd quoting in CI.

### Continuous healthcheck-cadence logs are not a bug

A container logging continuously with nothing else running is usually its own compose `healthcheck` pinging itself, not a crash-loop — match the log cadence against the healthcheck's `interval` before treating it as a bug. Recurring log bursts at exactly the configured `interval` (e.g. a DB container logging "connection accepted → not authenticating → connection ended" every 10s matching `interval: 10s`) are informational healthcheck traffic, not an auth failure or crash loop.
