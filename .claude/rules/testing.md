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
    await expect(useCase.execute({ title: 'Test', body: 'Content' }))
      .rejects.toThrow(ConflictError);
  });
});
```

## Testing HTTP Endpoints (Integration)

```typescript
import supertest from 'supertest';

it('POST /posts returns 201', async () => {
  const response = await supertest(app)
    .post('/posts')
    .set('Authorization', `Bearer ${testToken}`)
    .send({ title: 'Test Post', body: 'Content' });

  expect(response.status).toBe(201);
  expect(response.body.title).toBe('Test Post');
});
```

## Test Configuration

- **Database**: use test containers or transaction rollback for isolation — never share DB state between tests
- **Environment**: `vitest.config.ts` with test-specific settings
- **Coverage**: c8/istanbul, reports in `coverage/` directory

## Mutation Testing

Minimum mutation score: **80%** for covered code.

```bash
docker compose exec app npx stryker run
```

Fix surviving mutants by improving test assertions to test behavior, not implementation.
