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

Use nx targets (see `rules/workflow.md` → Command Execution Policy). Run them locally — they do not need a Docker context:

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

Use nx targets locally (see `rules/workflow.md` → Command Execution Policy):

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

> **NEVER run commands outside Docker** — all dependencies exist only in the container.
> **NEVER put business logic in route handlers** — use UseCases/Services.

## Docker Cleanup

**Named images and containers must be cleaned up after task completion.**

Any Docker-based build/test task (e.g. `firmware/Dockerfile` builds via `scripts/firmware-docker-build.sh`) that explicitly names or tags images/containers must clean them up:

```bash
# After task completes, remove named artifacts:
docker rm -f <container-name> 2>/dev/null || true
docker rmi -f <image-name>:<tag> 2>/dev/null || true
```

For broader intermediate cleanup (dangling layers, unused builder cache), use **non-aggressive** prune commands:

```bash
# Safe cleanup — only unused images/builders:
docker image prune -f
docker builder prune -f
```

**NEVER run** `docker system prune -a --volumes` or `docker system prune -af --volumes` **without explicit user confirmation.** These commands:

- Destroy ALL unused images (including those from unrelated projects)
- Remove ALL named volumes (not just the current task's artifacts)
- Can fill the host disk to ENOSPC if intermediate images accumulate uncleaned
- Are unrecoverable once run

> **Rationale**: Full-system destructive cleanup removes cached layers and named volumes from other projects, not just the current one. Host disk fills when multi-stage Docker builds (e.g. PlatformIO + ESP-IDF) accumulate GBs of intermediate layers across repeated rebuilds. Always scope cleanup to the specific task's named artifacts first; broader prune only after user confirmation.
