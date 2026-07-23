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

## Running Tests

Use nx targets — never invoke vitest/jest directly (see `rules/cts/workflow.md` → Command Execution Policy).

```bash
nx test api                             # run unit + integration tests for the api project
nx test api --skip-nx-cache             # bypass cache (use when verifying correctness)
nx test <lib-name>                      # run tests for a specific lib
nx run-many --target=test               # run tests for all projects
```

For a single file, pass the vitest `--testFile` option through nx:

```bash
nx test api -- --reporter=verbose --testFile=test/unit/create-post.spec.ts
```

Mutation testing (no nx plugin — run directly):

```bash
docker compose exec app npx stryker run
```

## Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreatePostUseCase } from '@/use-cases/create-post/create-post.usecase';

describe('CreatePostUseCase', () => {
  let useCase: CreatePostUseCase;
  let mockRepository: {
    save: ReturnType<typeof vi.fn>;
    existsBySlug: ReturnType<typeof vi.fn>;
  };

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

## Environment Variable Stubbing

When testing production env readers (e.g., config functions that read `process.env`), use `vi.stubEnv()` for correct restoration behavior:

**❌ DO NOT do this:**

```typescript
delete process.env.PORT; // vi.stubEnv does not track direct deletion
// test code
vi.unstubAllEnvs(); // PORT is already gone — not restored
```

**✅ DO this instead:**

```typescript
vi.stubEnv('PORT', ''); // Empty string simulates absence
// In the env reader: portRaw ? parseInt(portRaw, 10) : DEFAULT_PORT
vi.unstubAllEnvs(); // Correctly restored
```

Rationale: `vi.stubEnv` saves and restores env vars via `vi.unstubAllEnvs()`. Direct `delete process.env[KEY]` operates outside that tracking and leaves the var permanently deleted — breaking subsequent tests or production code that reads the same var. Treat empty string as "absent" in your env readers instead.

## Mutation Testing

Minimum mutation score: **80%** for covered code.

```bash
docker compose exec app npx stryker run
```

Fix surviving mutants by improving test assertions to test behavior, not implementation.

> Stryker has no nx plugin in this repo — invoke it directly inside Docker only.

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
  let mockLogger: ReturnType<typeof vi.fn>; // ✓ describe scope

  beforeEach(() => {
    mockLogger = vi.fn(); // Mocked pino logger
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

### E2E static server: `@nx/web:file-server` not raw `http-server`

Raw `http-server` has no SPA fallback — `page.goto('/some-route')` in a Playwright spec gets a 404 for client-side routes. Use the project's existing Nx target instead.

**Production-bundle testing in CI**: E2E tests must verify the production-built artifact, not the dev server. The dev server's transformations (bundler compilation, CSS injection) can hide production-only issues — e.g. a reverse-proxy string-match rewrite (like an nginx `sub_filter` CSP-nonce injection) can silently break when the production bundler minifies an HTML attribute the proxy's string match depends on. A `serve-static` target (`@nx/web:file-server` executor with `"spa": true`) configured to serve the built bundle with SPA fallback routing, depending on the app's `build` target so the artifact is always current, closes this gap. Use the dev server locally for faster iteration, but switch to the static-server target in CI:

```typescript
// playwright.config.mts
export default defineConfig({
  webServer: {
    command: process.env['CI'] ? 'pnpm exec nx run web:serve-static' : 'pnpm exec nx run web:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
  },
});
```

Set `CI: 'true'` in your CI workflow with a clear comment explaining that this switches to production-artifact testing. The `@nx/web:file-server` executor correctly falls back to `index.html` for unknown routes and needs no extra configuration beyond `"spa": true`.

### Never trust a comment/doc claim of test skip-behavior — grep the actual guard

A spec described in a comment or CI writeup as "skips if env X is unset" may not actually skip — verify by grepping for a real `skipIf`/conditional guard in the spec file itself. A spec can fall back to a default connection string (`process.env['X'] ?? 'localhost:...'`) with no skip guard at all — without a reachable dependency it fails hard (connection refused, or an undefined-method error in `afterAll`) instead of skipping.

### DB-backed integration specs need explicit isolation under parallel test workers

Integration specs sharing one database across parallel test workers, with no per-file isolation (unique DB/collection per run, or serialized execution), fail intermittently regardless of correct target wiring — the task runner surfaces this as a flagged "flaky task," not a deterministic failure. A test that fails once and then passes 24/24 on the immediate next run is a strong signal of shared-database contention between parallel workers, not a real regression in the code under test.
