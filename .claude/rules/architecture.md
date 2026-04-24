# Architecture Patterns

## Business Logic

- **Clean Architecture** — all business logic in UseCase/Handler classes
- **Service Layer** — pure domain logic services (no I/O), injected into UseCases
- **Repository Pattern** — data access abstraction via interfaces; implementations swap ORM
- No business logic in route handlers or controllers — they are thin entry points

## Layer Stack

```
Route Handler / Controller
  ↓  validates input (js-validator-livr / Zod / class-validator)
  ↓  calls UseCase
UseCase / Handler
  ↓  orchestrates business logic
  ↓  calls Services + Repositories
Service
  ↓  pure domain logic, no I/O
Repository Interface → ORM Implementation (Prisma / TypeORM / Drizzle)
```

Each layer depends only on the layer below it. No skipping layers.

## Frontend

- **Vue, React, or Angular** — separate agents handle each framework (vue-developer, react-developer, angular-developer)
- Communicates with backend via REST or GraphQL API
- Domain organization: features organized by domain (auth, posts, users, etc.)

## Database

- Every schema change → new migration file (never modify existing migrations in production)
- Prefer repository pattern: `IPostRepository` interface + `PrismaPostRepository` implementation
- Eager loading via ORM includes/relations to prevent N+1 queries
- Prefer ORM abstractions over raw SQL; use raw queries only for complex aggregations
- Update seeders and factories when data changes

## Performance

- **Node.js** with PM2 cluster mode or native clustering
- **Redis** — caching, sessions, queue management
- **PostgreSQL** with proper indexing
- Structured logging with pino (JSON output, configurable log levels)

## Development Tools

- **Bull Board** — queue monitoring UI at `/admin/queues`
- **Prisma Studio** — database inspector (if using Prisma)
- **Node.js debugger** — attach via `--inspect` flag
- **pino-pretty** — human-readable logs in development
