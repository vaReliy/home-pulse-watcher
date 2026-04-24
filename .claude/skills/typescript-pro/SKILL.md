---
name: typescript-pro
description: >-
    Senior TypeScript/Node.js development. Use when writing TypeScript, Node.js,
    NestJS, Express, Fastify, Prisma, strict typing patterns, or making
    TypeScript architecture decisions.

    Українською: TypeScript, Node.js, строга типізація, async/await, NestJS,
    Prisma, Express, Fastify, декоратори, generic типи, utility types.
triggers:
    - TypeScript
    - Node.js
    - NestJS
    - Express
    - Fastify
    - Prisma
    - strict types
    - generic types
    - utility types
    - async/await
role: specialist
scope: implementation
output-format: code
---

# TypeScript Pro

Senior TypeScript developer with deep expertise in TypeScript 5+, Node.js, strict typing, and modern patterns.

## When to Use This Skill

- Building Node.js APIs with TypeScript
- Implementing strict type systems
- Creating typed domain models, DTOs, value objects
- Async patterns and error handling
- Performance optimization in Node.js

## Core Workflow

1. **Analyze architecture** — review layers, dependencies, domain models
2. **Design typed models** — entities, DTOs, interfaces with strict types
3. **Implement** — strict-typed code with DI, repositories, UseCases
4. **Secure** — validated input at boundaries, typed errors
5. **Test** — Vitest tests, tsc strict, ESLint clean

## Modern TypeScript Features

```typescript
// Satisfies operator — type-safe without widening
const config = {
  port: 3000,
  host: 'localhost',
} satisfies Config;

// Template literal types
type EventName = `on${Capitalize<string>}`;

// Discriminated unions — prefer over boolean flags
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };

// Const assertion
const STATUS = ['draft', 'published', 'archived'] as const;
type PostStatus = typeof STATUS[number]; // 'draft' | 'published' | 'archived'
```

## Node.js Patterns

```typescript
// Typed config service — never raw process.env in app code
export class Config {
  readonly port = parseInt(process.env.PORT ?? '3000', 10);
  readonly databaseUrl = this.require('DATABASE_URL');

  private require(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Required env var missing: ${key}`);
    return value;
  }
}

// Structured logging with pino
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.close();
  await prisma.$disconnect();
  process.exit(0);
});
```

## Error Handling

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Catch blocks — always use unknown
try {
  await doSomething();
} catch (error: unknown) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  logger.error({ error }, 'Unexpected error');
  return res.status(500).json({ error: 'Internal server error' });
}
```

## Output Templates

When implementing TypeScript features, provide:

1. Domain models (entities, value objects)
2. UseCase/Service classes
3. Repository interface + implementation
4. Test files (Vitest)
5. Brief explanation of architecture decisions

## Constraints

### MUST DO

- `"strict": true` in tsconfig
- Explicit return types on all public methods
- Use `unknown` in catch blocks, narrow before use
- Dependency injection over global state
- `npm ci` for all package installations

### MUST NOT DO

- `any` types — use `unknown` and narrow with type guards
- Raw `process.env` access — use a typed config service
- Throw raw strings — always throw typed Error subclasses
- Mix business logic with HTTP handlers
- `console.log` in production — use pino/winston

## Code Quality Commands (in Docker)

```bash
docker compose exec app npx tsc --noEmit
docker compose exec app npx eslint .
docker compose exec app npx prettier --check .
```
