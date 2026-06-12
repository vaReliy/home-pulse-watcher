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

```bash
docker compose exec app npx eslint .
docker compose exec app npx eslint . --fix
docker compose exec app npx prettier --check .
docker compose exec app npx prettier --write .
docker compose exec app npx tsc --noEmit
```

## Testing (Vitest)

```bash
docker compose exec app npx vitest run
docker compose exec app npx vitest run --coverage
docker compose exec app npx vitest run --reporter=verbose
docker compose exec app npx vitest run src/use-cases/create-post/create-post.spec.ts
docker compose exec app npx stryker run
```

## Build & Runtime

```bash
docker compose exec app npm run build
docker compose exec app npm run dev
docker compose exec app npm run start
```

## Package Management

```bash
# ALWAYS use npm ci — never npm install
docker compose exec app npm ci
docker compose exec app npm ci --production
```

> **NEVER run commands outside Docker** — all dependencies exist only in the container.
> **NEVER put business logic in route handlers** — use UseCases/Services.
