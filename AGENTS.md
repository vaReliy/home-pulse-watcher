## Stack

Node.js 22+ · TypeScript 5 strict · NestJS 11 · Nx 22 · Prisma 7 + PostgreSQL · Redis/BullMQ · Jest/Vitest · Docker · ESP32 firmware (PlatformIO)

## Git Safety

- Never auto-commit — only when explicitly requested.
- Never push to remote without explicit request.
- Never force-push or run destructive git commands without explicit approval.
- Never mention AI tools in PR title/body. Show `git diff`/`git status` before committing.

PR description rules: `rules/git-operations.md`.

## Code Style Essentials

- Strict TS, no `any` — use `unknown` + narrow.
- `.js` extensions in imports (NodeNext); `type` imports for types/interfaces.
- Named exports only; barrel exports via `index.ts`.
- Files kebab-case; classes/types/interfaces PascalCase; `I`-prefix for repo/service abstractions.
- Constants SCREAMING_SNAKE_CASE; enums as `as const` objects.
- No magic numbers — named constants with JSDoc.
- LIVR validation rules camelCase (`macAddress`, `telegramId`).

Details: `rules/code-style.md`.

## Model Tiers

Generic tiers used across rules and task files; each AI vendor maps them to concrete models.

| Tier     | Use for                                                                 | Claude mapping |
| -------- | ------------------------------------------------------------------------ | --------------- |
| deep     | Rare cascading decisions (architecture), hardest root-cause debugging   | opus            |
| standard | Implementation, review, tests, requirements, security checklists        | sonnet          |
| cheap    | Mechanical/template work: docs, config edits, deletions                 | haiku           |

Other vendors (Gemini, Codex, Copilot): mappings added when those tools are actually used.

## On-Demand Rules Index

Read when relevant (never preloaded):

- `rules/workflow.md` — before creating teams / running pipelines
- `rules/architecture.md` — layer placement questions
- `rules/testing.md` — writing/structuring tests
- `rules/validation-authorization.md` — input validation, guards
- `rules/migrations-queue.md` — Prisma migrations, BullMQ jobs
- `rules/docker-commands.md` — running anything in containers
- `rules/mcp-stack.md` — MCP tool selection
- `rules/git-operations.md` — PR description rules
- `PROJECT_CONTEXT.md` — domain rules, architecture, incident history
- `README.md` — setup, CLI commands, deployment
