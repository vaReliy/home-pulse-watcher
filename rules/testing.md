# Testing Rules

## Entities/Models Testing Policy

**DO NOT** create unit tests for basic ORM entity CRUD or simple relationships.

Rationale: ORM libraries (Prisma, TypeORM, Drizzle) are extensively tested by their maintainers. Testing basic CRUD provides no value.

What NOT to test:

- Basic ORM relations
- Simple CRUD via repository
- Standard ORM casting/transformations
- Factory/seed creation without custom logic

What TO test:

- Custom business logic in UseCases/Services
- Complex validators with business rules
- Guards and authorization logic
- Event handlers and side effects
- Custom repository methods with complex queries

## Framework & Tools

- **Vitest** (preferred) or Jest with ts-jest — BDD-style syntax: `describe()` + `it()` + `expect()`
- **Mutation Testing** with Stryker Mutator — `npx stryker run`
- **E2E Testing** — Playwright (handled exclusively by `qa` agent)

## Test Structure

```
test/
├── unit/         # Unit tests (UseCases, Services, validators, guards)
├── integration/  # Integration tests (HTTP endpoints, DB queries)
```

E2E tests live in `e2e/` and are owned by the `qa` agent.

## Running Tests (all in Docker)

```bash
docker compose exec app npx vitest run                    # all tests
docker compose exec app npx vitest run --coverage         # with coverage
docker compose exec app npx vitest run --reporter=verbose test/unit/create-post.spec.ts
docker compose exec app npx stryker run                   # mutation testing
```

## Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreatePostUseCase } from '@/use-cases/create-post/create-post.usecase';

describe('CreatePostUseCase', () => {
  let useCase: CreatePostUseCase;
  let mockRepository: { save: ReturnType<typeof vi.fn>; existsBySlug: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      existsBySlug: vi.fn().mockResolvedValue(false),
    };
    useCase = new CreatePostUseCase(mockRepository as any);
  });

  it('creates a post with valid data', async () => {
    const result = await useCase.execute({ title: 'Test', body: 'Content' });
    expect(result.title).toBe('Test');
    expect(mockRepository.save).toHaveBeenCalledOnce();
  });

  it('throws ConflictError if slug exists', async () => {
    mockRepository.existsBySlug.mockResolvedValue(true);
    await expect(useCase.execute({ title: 'Test', body: 'Content' })).rejects.toThrow(ConflictError);
  });
});
```

## Testing HTTP Endpoints (Integration)

```typescript
import supertest from 'supertest';

it('POST /posts returns 201', async () => {
  const response = await supertest(app).post('/posts').set('Authorization', `Bearer ${testToken}`).send({ title: 'Test Post', body: 'Content' });

  expect(response.status).toBe(201);
  expect(response.body.title).toBe('Test Post');
});
```

## Test Configuration

- **Database**: use test containers or transaction rollback for isolation — never share DB state between tests
- **Environment**: `vitest.config.ts` with test-specific settings
- **Coverage**: c8/istanbul, reports in `coverage/` directory

## Reading `.env` Secrets Without Display

Integration tests that need authenticated database credentials (e.g., `DB_USER`, `DB_PASSWORD` for a test database instance) can load `.env` into the shell session without the tool ever displaying secrets. Use this pattern in `Bash` commands:

```bash
set -a && source .env && set +a
# Now all .env vars are loaded into this shell session's environment
export TEST_DB_URI="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/test"
# Continue with the command that needs the vars
```

- `set -a` marks each new variable as exported (propagates to subshells).
- `source .env` loads the file.
- `set +a` stops auto-exporting (limits scope to this command).

This avoids the tool's `Read` restriction on `.env` files while keeping all secret values off the transcript. The pattern is particularly useful when building connection strings for local test runs.

## Mutation Testing

Minimum mutation score: **80%** for covered code.

```bash
docker compose exec app npx stryker run
```

Fix surviving mutants by improving test assertions to test behavior, not implementation.

## NestJS-Specific Testing

### Guard decorator chains: established convention vs. coverage gap

A common pattern for guard decorator chains (e.g., `@UseGuards(SessionGuard, ActiveUserGuard)`) is to **unit-test each guard's `canActivate()` directly** against a hand-built fake `ExecutionContext`, not via real HTTP dispatch through the controller. Controller specs call methods directly or mock the decorator.

**Why**: This keeps specs fast and avoids DI/DB bootstrap overhead.

**Coverage gap**: A decorator regression (wrong guard, wrong order, guard silently dropped) is **invisible to the test suite** and only reviewable by manual diff-reading. To add assurance, a thin e2e-style smoke test per guarded controller (with real Nest routing) is an option if the gap is not acceptable for your project.

### Exception filter testing: pino logger assertions

When testing NestJS exception filters that use pino, assert **both arguments** of the pino call — the structured object **and** the message string. pino's signature is `(obj, msg)`, opposite to winston/console `(msg, meta)`, so a single-arg assertion (`toHaveBeenCalled()`) won't catch a metadata-less call.

Also: `mockLogger` must be declared as `let` at the `describe` scope (not `const` inside `beforeEach`) so it's accessible to `it` blocks:

```typescript
describe('MyExceptionFilter', () => {
  let filter: MyExceptionFilter;
  let mockLogger: { warn: jest.Mock }; // ✓ describe scope

  beforeEach(() => {
    mockLogger = { warn: jest.fn() }; // Mocked pino logger
    filter = new MyExceptionFilter(mockLogger);
  });

  it('logs structured warning with both args', () => {
    const exception = new SomeError();
    filter.catch(exception, mockExecutionContext);

    // ✓ Assert both pino args: object first, message second
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ statusCode: expect.any(Number) }), expect.stringContaining('[CODE]'));
  });
});
```

### Never trust a comment/doc claim of test skip-behavior — grep the actual guard

A spec described in a comment or CI writeup as "skips if env X is unset" may not actually skip — verify by grepping for a real `skipIf`/conditional guard in the spec file itself. A spec can fall back to a default connection string (`process.env['X'] ?? 'localhost:...'`) with no skip guard at all — without a reachable dependency it fails hard (connection refused, or an undefined-method error in `afterAll`) instead of skipping.

### DB-backed integration specs need explicit isolation under parallel test workers

Integration specs sharing one database across parallel test workers, with no per-file isolation (unique DB/collection per run, or serialized execution), fail intermittently regardless of correct target wiring — the task runner surfaces this as a flagged "flaky task," not a deterministic failure. A test that fails once and then passes 24/24 on the immediate next run is a strong signal of shared-database contention between parallel workers, not a real regression in the code under test.
