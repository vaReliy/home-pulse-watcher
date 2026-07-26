## Overrides AGENTS.md § "Stack"

Node.js 22+ · TypeScript 5 (strict) · NestJS 11 · Nx 22 · Prisma 7 + PostgreSQL · Redis/BullMQ · Jest/ts-jest/@swc-jest (no Vitest) · Docker · ESP32-C3/C6 firmware (PlatformIO + Arduino)

## Overrides AGENTS.md § "Code Style Essentials"

- LIVR validation rules use camelCase field names (`macAddress`, `telegramId`).

## Extends AGENTS.md § "On-Demand Rules Index"

- `rules/task-authoring.md` — **location override**: HPW's default task-file directory is `tmp/tasks/todo/` (`tmp/` is gitignored wholesale, not `tasks/` specifically as CTS assumes) — always use plain `mv`, never `git mv`, for todo/done moves.
- `firmware/` files → adopt the `embedded-cpp-pro` persona (no dedicated CTS agent covers embedded C++/PlatformIO).
- `PROJECT_CONTEXT.md` — domain rules, architecture, incident history (project-authored, not CTS payload).
- `docs/ARCHITECTURE.md` — layers, serving topology (note: lives under `docs/`, not repo root).

## Extends AGENTS.md § "Routing" table

| Need              | Agent                      |
| ----------------- | -------------------------- |
| `firmware/` files | `embedded-cpp-pro` persona |

No frontend framework in this repo — `vue-developer`/`react-developer`/`angular-developer` rows in the synced AGENTS.md do not apply here and are harmless to leave as-is (agents are pruned from `.claude/agents/`, so the dispatcher can't reach them regardless).
