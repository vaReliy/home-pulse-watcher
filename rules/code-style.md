# TypeScript Code Style

## Strict TypeScript

- All TypeScript files must have `"strict": true` in tsconfig (covers `strictNullChecks`, `noImplicitAny`, etc.)
- Explicit return types required on all public methods and functions
- No `any` — use `unknown` for catch blocks and external data, then narrow with type guards
- Prefer discriminated unions for state modeling over boolean flags
- Use `const` assertions (`as const`) for literal type inference

## Naming Conventions

| Construct                         | Convention       | Example                                |
| --------------------------------- | ---------------- | -------------------------------------- |
| Classes, Interfaces, Types, Enums | PascalCase       | `CreatePostUseCase`, `IPostRepository` |
| Variables, functions, methods     | camelCase        | `createPost`, `postId`                 |
| Constants                         | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`                      |
| File names                        | kebab-case       | `create-post.usecase.ts`               |
| Enum values                       | UPPER_SNAKE_CASE | `PostStatus.PUBLISHED`                 |

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

| Tool                        | Purpose                          | Config                                |
| --------------------------- | -------------------------------- | ------------------------------------- |
| ESLint + @typescript-eslint | Linting and code quality         | `.eslintrc` with strict ruleset       |
| Prettier                    | Code formatting                  | `.prettierrc`                         |
| tsc                         | Type checking (replaces PHPStan) | `tsconfig.json` with `"strict": true` |

## Shell Script Conventions

### Dual-path JSON/grep parsing: jq `//` is NOT equivalent to shell `||`

When a shell script uses two parsing paths (jq as the primary, grep/sed as a fallback), do not assume they behave identically on edge cases. jq's `// "default"` (alternative operator) applies the default only on **successful parses** with missing/null fields. On a parse failure (malformed/non-JSON stdin), jq outputs an empty string. In contrast, the grep/sed fallback's `|| echo "default"` always produces a value when the fallback is invoked.

This mismatch is subtle on correct input but creates a divergence on malformed input, especially when a script chooses between parsing paths (jq vs. grep/sed) based on tool availability. For example:

```bash
# Two alternative branches selected by tool availability — this is where the mismatch bites:
if command -v jq &>/dev/null; then
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')
else
  SESSION_ID=$(printf '%s' "$INPUT" \
    | grep -oP '"session_id"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 \
    || echo "unknown")
fi

# Branch-independent normalization: on malformed input the jq branch yields "" (its
# // default applies only to successful parses), while the grep branch's || echo
# already yielded a value. One empty-check after both branches aligns them.
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"
```

The mismatch arises when a script has a jq branch and a grep/sed fallback branch chosen by `command -v jq`; never assume the two branches handle malformed input identically. Normalize once, branch-independently, after both branches execute — that single empty-check ensures consistent behavior regardless of which path was taken.

## Do Not Drop `!= null` Guards Before Relational Comparisons

`strictNullChecks` rejects relational operators (`>`, `<`, `>=`, `<=`) applied directly to an operand typed `T | null` or `T | undefined` — TS raises `TS2531`/`TS2532` even though the JS runtime semantics of `null > 0` (`false`) would otherwise make the guard look redundant. This applies **regardless of whether the narrowed value is reused afterward** — it's a type error on the comparison expression itself, not just a missed-narrowing issue further downstream.

```typescript
// value: number | null
if (value != null && value > 0) { ... }   // required — value > 0 alone is a TS2531 compile error
```

Keep the explicit `!= null`/`!== null` guard any time the operand's type includes `null`/`undefined`. This pattern is not eligible for simplification in strict TS — don't attempt it even for boolean-only return values.

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
