## Stack

Node.js 22+ · TypeScript 5 (strict) · Vue 3 / React 18+ / Angular 17+ · Prisma (primary) / TypeORM / Drizzle · PostgreSQL 17 · Redis · BullMQ · Vitest · Playwright · Docker

## Git Safety

- Never auto-commit — only when explicitly requested.
- Never push to remote without explicit request.
- Never force-push or run destructive git commands without explicit approval.
- Never mention AI tools in PR title/body. Show `git diff`/`git status` before committing.

PR description rules: `rules/cts/git-operations.md`.

## Code Style Essentials

- Strict TS, no `any` — use `unknown` + narrow.
- `.js` extensions in imports (NodeNext); `type` imports for types/interfaces.
- Named exports only; barrel exports via `index.ts`.
- Files kebab-case; classes/types/interfaces PascalCase; `I`-prefix for repo/service abstractions.
- Constants SCREAMING_SNAKE_CASE; enums as `as const` objects.
- No magic numbers — named constants with JSDoc.
- Comments are the exception: write one only when the WHY is non-obvious and cannot be expressed through renaming. Never reference task IDs, decision IDs, or task file paths in comments (`D9`, `task 11`, etc.) — these go stale. Use `// TODO:` / `// FIXME:` for deferred work with a self-contained description; remove them once the work is done.
- **Exact-pin all `package.json` deps** — no `^` or `~` ranges, ever (dependencies, devDependencies, peerDependencies). Audit after every `pnpm add` / generator run. Full procedure: `rules/cts/dependencies.md`.

Details: `rules/cts/code-style.md`.

## Verification Commands

**If your workspace uses Nx, read `rules/cts/workflow.md` § "Command Execution Policy (Nx Targets)" before running any build, test, lint, or type-check command.** That section is the single source of truth for the ✅/❌ command table, useful flags, and project names. Never use raw tool invocations (`tsc`, `eslint`, `vitest`, `webpack`, `playwright`) when an `nx` target exists — always prefer the `nx` target. Non-Nx workspaces: use the project's own scripts (`package.json` `scripts`), not ad-hoc tool invocations.

## Model Tiers

Generic tiers used across rules and task files; each AI vendor maps them to concrete models.

| Tier     | Use for                                                               | Claude mapping |
| -------- | --------------------------------------------------------------------- | -------------- |
| deep     | Rare cascading decisions (architecture), hardest root-cause debugging | opus           |
| standard | Implementation, review, tests, requirements, security checklists      | sonnet         |
| cheap    | Mechanical/template work: docs, config edits, deletions               | haiku          |

Other vendors (Gemini, Codex, Copilot): mappings added when those tools are actually used.

## On-Demand Rules Index

Read when relevant (never preloaded):

- `rules/cts/workflow.md` — before creating teams / running pipelines
- `rules/cts/architecture.md` — layer placement questions
- `rules/cts/testing.md` — writing/structuring tests
- `rules/cts/validation-authorization.md` — input validation, guards
- `rules/cts/migrations-queue.md` — ORM migrations, BullMQ jobs
- `rules/cts/docker-commands.md` — running anything in containers
- `rules/cts/mcp-stack.md` — MCP tool selection
- `rules/cts/git-operations.md` — PR description rules
- `rules/cts/shell-scripting.md` — bash gotchas with traps, symlinks, prettier defaults
- `rules/cts/task-authoring.md` — emitting backlog task files from plan/grill/grooming sessions
- `rules/cts/nx-generators.md` — after running ANY `nx g …` generator (apps, libs, configs) — Nx workspaces only
- `rules/cts/dependencies.md` — adding/updating/removing npm deps; auditing generator-injected ranges
- `rules/cts/docs-style.md` — writing/editing any `.md` file (no manual prose wrapping; Prettier handles it)
- `rules/local/**` — consumer-owned rule overrides and project-specific split files (e.g. `rules/local/architecture-backend.md`); never synced by `cts-sync.sh`. Local wins on conflict with any `rules/cts/**` file it cites.
- `README.md` — setup, install profile, common commands
- `docs/KNOWLEDGE_INBOX.md` — append-only inbox for durable-but-unplaced learnings; any AI tool working in the repo may append entries in the 3-line format from `rules/cts/workflow.md`'s Knowledge Inbox section, which also defines the distillation policy

## Setup

See `README.md` for system requirements, installation, the install profile (pruning agents/skills you don't need), and common commands.

## Local Overrides

@AGENTS.local.md

If `AGENTS.local.md` exists (consumer-owned, never synced), its instructions override any conflicting instruction elsewhere in this file.
