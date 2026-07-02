---
name: vitest-testing
description: >-
  Testing with Jest (or Vitest) for TypeScript applications. Use when writing
  unit tests, integration tests, mocking, coverage, mutation testing (Stryker),
  or TDD workflows in Node.js/TypeScript.

  Українською: тестування Jest, Vitest, написати тест, юніт тест, інтеграційний
  тест, мок, покриття, мутаційне тестування, TDD, jest.fn, jest.mock, describe, it.
triggers:
  - Jest
  - Vitest
  - test
  - spec
  - TDD
  - assertion
  - coverage
  - mock
  - jest.fn
  - jest.mock
  - Stryker
---

# Jest Testing

This repo runs Jest (`@nx/jest`, `ts-jest`/`@swc/jest`) — no Vitest dependency exists in `package.json`. Examples below use Jest APIs.

## When to Apply

- Creating new unit or integration tests
- Modifying existing tests
- Debugging test failures
- Setting up coverage or mutation testing
- TDD workflow

## Basic Test Structure

```typescript
import { CreatePostUseCase } from '@/use-cases/create-post/create-post.usecase';

describe('CreatePostUseCase', () => {
  let useCase: CreatePostUseCase;
  let mockRepo: {
    save: jest.Mock;
    existsBySlug: jest.Mock;
  };

  beforeEach(() => {
    mockRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      existsBySlug: jest.fn().mockResolvedValue(false),
    };
    useCase = new CreatePostUseCase(mockRepo as any);
  });

  it('creates a post and saves it', async () => {
    const result = await useCase.execute({
      title: 'Test Post',
      body: 'Content',
    });

    expect(result.title).toBe('Test Post');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictError if slug exists', async () => {
    mockRepo.existsBySlug.mockResolvedValue(true);

    await expect(useCase.execute({ title: 'Test', body: 'Content' })).rejects.toThrow(ConflictError);
  });
});
```

## Mocking

```typescript
// Mock entire module
jest.mock('../services/email.service');

// Spy on method
const spy = jest.spyOn(emailService, 'send').mockResolvedValue(undefined);
expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
```

## HTTP Integration Tests

```typescript
import supertest from 'supertest';
import { app } from '@/app';

it('POST /posts returns 201', async () => {
  const response = await supertest(app).post('/posts').set('Authorization', `Bearer ${testToken}`).send({ title: 'New Post', body: 'Content' });

  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({
    id: expect.any(String),
    title: 'New Post',
  });
});

it('POST /posts returns 422 for invalid input', async () => {
  const response = await supertest(app).post('/posts').set('Authorization', `Bearer ${testToken}`).send({ title: '' });

  expect(response.status).toBe(422);
  expect(response.body.fields).toHaveProperty('title');
});
```

## Assertions Reference

| Pattern                                       | Use                            |
| --------------------------------------------- | ------------------------------ |
| `expect(x).toBe(y)`                           | Strict equality (`===`)        |
| `expect(x).toEqual(y)`                        | Deep equality                  |
| `expect(x).toMatchObject(partial)`            | Partial object match           |
| `expect(fn).toHaveBeenCalledTimes(1)`         | Mock called exactly once       |
| `expect(fn).toHaveBeenCalledWith(...)`        | Mock called with specific args |
| `expect(promise).rejects.toThrow(ErrorClass)` | Async error assertion          |

## Models Testing Policy

**DO NOT** create unit tests for basic ORM entity CRUD or simple relationships.

**DO test**: UseCases, Services, complex validators, guards, event handlers.

## Database Testing

- Use test containers for integration tests, or wrap each test in a transaction and roll back
- Never share DB state between tests — always reset in `beforeEach`

## Running Tests

```bash
npx nx test api                          # run once via nx (preferred — see rules/docker-commands.md)
npx nx test api --coverage
npx nx test api --testFile=create-post.spec.ts
npx nx test api --watch
docker compose exec app npx stryker run  # Stryker has no nx plugin, run inside Docker
```

Minimum mutation score: **80%** for covered code.

## Common Pitfalls

- Forgetting to `await` async assertions (`rejects.toThrow`)
- Sharing mock state between tests — always reset in `beforeEach`
- Testing implementation instead of behavior
- Brittle assertions: prefer `toMatchObject` over exact `toEqual` for API responses
- Do not import test helpers (`vi`, `describe`, `it`, `expect`) from `'vitest'` — this repo has no Vitest dependency; `jest` and `describe`/`it`/`expect` are Jest globals, no import needed

## Related Skills

- **test-master** — Testing strategies and planning
