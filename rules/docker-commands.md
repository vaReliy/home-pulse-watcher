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
