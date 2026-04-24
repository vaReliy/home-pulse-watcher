# TypeScript Code Style

## Strict TypeScript

- All TypeScript files must have `"strict": true` in tsconfig (covers `strictNullChecks`, `noImplicitAny`, etc.)
- Explicit return types required on all public methods and functions
- No `any` — use `unknown` for catch blocks and external data, then narrow with type guards
- Prefer discriminated unions for state modeling over boolean flags
- Use `const` assertions (`as const`) for literal type inference

## Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Classes, Interfaces, Types, Enums | PascalCase | `CreatePostUseCase`, `IPostRepository` |
| Variables, functions, methods | camelCase | `createPost`, `postId` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| File names | kebab-case | `create-post.usecase.ts` |
| Enum values | UPPER_SNAKE_CASE | `PostStatus.PUBLISHED` |

## Class Organization

Specific order for class elements:
1. Static constants
2. Static properties
3. Instance properties
4. Constructor
5. Public methods
6. Protected methods
7. Private methods

## Import Ordering

1. Node.js built-in modules (`fs`, `path`, `crypto`)
2. External packages (`express`, `prisma`, `bullmq`)
3. Internal modules (absolute paths via tsconfig paths, e.g. `@/services/`)
4. Relative imports (`./`, `../`)

## Code Quality Tools

| Tool | Purpose | Config |
|------|---------|--------|
| ESLint + @typescript-eslint | Linting and code quality | `.eslintrc` with strict ruleset |
| Prettier | Code formatting | `.prettierrc` |
| tsc | Type checking (replaces PHPStan) | `tsconfig.json` with `"strict": true` |

## Error Handling

Use typed custom error classes — never throw untyped errors:

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ValidationError extends AppError {
  constructor(public readonly errors: Record<string, string>) {
    super('Validation failed', 'VALIDATION_ERROR', 422);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}
```
