# Project Architecture: HomePulse Watcher

This document outlines the architectural principles and patterns used in HomePulse Watcher, blending **Onion Architecture** with **[Chista](https://github.com/koorchik/node-chista)** principles for robust and testable service-oriented development.

## Core Product Idea

**HomePulse Watcher** is a resilient power-monitoring ecosystem.
The core mission is to bridge the gap between low-power hardware (ESP32-C3/ESP32-C6) and end-users by providing reliable, authenticated, and instant notifications regarding power grid stability.

### The Problem

Power outages are unpredictable. Users need to know exactly _when_ power was lost and _how long_ it lasted to manage food safety, heating, or remote servers.

### The Solution

A distributed system where lightweight sensors report state changes via HMAC-signed payloads to a centralized NestJS engine, which processes logic and dispatches alerts via Telegram.

---

## Architectural Principles (Chista + NestJS)

We adopt the **Clean Integrated Services** approach. The application logic is decoupled from the framework (NestJS) and the database (Prisma).

### 1. The Service Pattern (The "Chista" Way)

Every business operation must be a standalone **Service** class.

- **Atomic:** One service = One business action (e.g., `RegisterDevice`, `LogPowerEvent`).
- **Transport Agnostic:** The service doesn't know about `Req` or `Res` objects.
- **Validation-First:** Every service utilizes **LIVR** for strict input validation.

### 2. Layers & Dependency Rule (Pure Onion)

| Layer              | Library                              | Contains                                                     | Framework Code |
| ------------------ | ------------------------------------ | ------------------------------------------------------------ | -------------- |
| **Core**           | `@home-pulse-watcher/core`           | Entities, Repository Interfaces, Enums                       | None           |
| **Application**    | `@home-pulse-watcher/application`    | BaseService, Chista services                                 | None           |
| **Infrastructure** | `@home-pulse-watcher/infrastructure` | Prisma Repositories, Mappers, External APIs                  | None           |
| **Interface**      | `apps/api`                           | NestJS Controllers, Modules, DI Wiring, Guards, Interceptors | NestJS         |

**Key Principle:** Infrastructure layer contains **plain TypeScript classes** with constructor injection.
NestJS DI wiring (providers, modules, interceptors, guards) lives exclusively in the Interface layer.

### 3. Service Structure Example

A typical service follows this lifecycle:

1. **Validation:** Check `params` using a LIVR schema.
2. **Context:** Access `context` for authorization (e.g., `userId`).
3. **Execution:** Perform logic using injected repositories.
4. **Result:** Return a standardized `{ data: ... }` or throw a specialized `Exception`.

---

## Coding Practices & Recommendations

### Data Access (Prisma)

- Never leak Prisma models into the Service layer. Always map DB models to **Domain Entities**.
- Use the **Repository Pattern** to wrap Prisma calls.

### Security (HMAC)

- All device-to-backend communication must be signed.
- Signature verification is a **Middleware/Guard** responsibility, passing the verified `deviceId` into the Service `context`.

### Validation (LIVR)

- Use `LIVR.Registration.registerDefaultRules` for custom rules (like MAC-address or HMAC format).
- Validation must happen _before_ any business logic is executed.

### Error Handling

The error system provides defense-in-depth across three layers:

**Error Class Hierarchy** (all extend `BaseError` in `@home-pulse-watcher/shared`):

| Class                 | HTTP Status       | Purpose                                |
| --------------------- | ----------------- | -------------------------------------- |
| `ValidationError`     | 400               | LIVR validation failures               |
| `AuthenticationError` | 401               | HMAC/credential failures               |
| `NotFoundError`       | 404               | Resource not found                     |
| `DomainError`         | 409 / 403 / 422   | Business rule violations               |
| `DatabaseError`       | 409 / 500 / 503   | Translated Prisma errors               |

**Repository Error Translation** (`withPrismaError` wrapper in Infrastructure layer):

All Prisma calls in repositories are wrapped with `withPrismaError('EntityName', () => ...)`, which translates Prisma-specific errors into domain errors:
- `P2025` (record not found) → `NotFoundError`
- `P2002` (unique constraint) → `DatabaseError(UNIQUE_CONSTRAINT)` → 409
- `P2003` (foreign key) → `DatabaseError(FOREIGN_KEY_CONSTRAINT)` → 500
- `PrismaClientValidationError` → `DatabaseError(QUERY_ERROR)` → 500
- `PrismaClientInitializationError` → `DatabaseError(CONNECTION_FAILED)` → 503
- Non-Prisma errors re-thrown unchanged

**Exception Filter Chain** (Interface layer):

1. `ServiceExceptionFilter` — catches `BaseError` subclasses, sanitizes 500+ responses (logs full details, returns generic message to client)
2. `AllExceptionsFilter` — catch-all for anything else (`HttpException`, raw `Error`), returns `{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }`

This ensures Prisma internals never leak outside the Infrastructure layer, and internal error details never reach API clients.

---

## Key Patterns

### Config Injection

Services must not access `process.env` directly. Configuration is injected via `ServiceContext.config`. The Interface layer (CLI commands, controllers) reads environment variables and passes them to services. This ensures services remain testable without mocking `process.env`.

### BigInt Serialization

JavaScript `BigInt` cannot be serialized with `JSON.stringify()`. The Interface layer handles this via an interceptor that recursively converts `BigInt` values to strings in HTTP responses.

### Factory-Based DI Wiring

Services remain plain TypeScript classes (no `@Injectable()`). NestJS binds them via factory providers using Symbol tokens. This keeps the Application layer framework-agnostic while allowing full DI capabilities in the Interface layer.

### Async Event Emission (Cloud Run reliability)

`ProcessPowerStatusService` emits `POWER_STATUS_CHANGED_EVENT` after recording a status change to trigger Telegram notifications via `PowerStatusListener`.

**Why `emitAsync` instead of `emit`**: `EventEmitter2.emit()` fires handlers as fire-and-forget — async handlers continue running after the caller returns. On Cloud Run, CPU is throttled once the HTTP response is sent, which can interrupt in-flight async work (database queries, Telegram API calls) before the notification completes.

`AsyncEventEmitterAdapter` (`apps/api/src/modules/services/async-event-emitter.adapter.ts`) wraps `EventEmitter2.emitAsync()`, which returns a Promise that resolves only after all handlers have completed. The service `await`s this call, ensuring notifications are delivered before the HTTP response goes out.

> ⚠️ Do not replace `emitAsync` with `emit` here — it would silently break notifications under Cloud Run's CPU throttling.

---

## Build & Deployment

### Webpack Bundling

The production build uses Webpack to bundle **all** third-party dependencies directly into the output JS files (`main.js` for the HTTP server, `cli.js` for CLI commands). This eliminates `MODULE_NOT_FOUND` errors that occur when dependency analysis misses packages referenced via decorators or dynamic imports.

**External packages** (not bundled, installed via `npm install` in Docker):

- `@prisma/client` — uses WASM-based query engine and generated code under `.prisma/client`
- `@prisma/adapter-pg` — Prisma's PostgreSQL driver adapter
- `pg` — PostgreSQL client, kept external to avoid duplicate instances with `@prisma/adapter-pg`

Configuration: `apps/api/webpack.config.js`

### Docker (Cloud Run)

The root `Dockerfile` uses a 3-stage build:

1. **deps** — installs all workspace dependencies (`npm ci`)
2. **build** — generates Prisma client, runs `npx nx build api` (Webpack bundles everything except Prisma externals)
3. **production** — copies bundled output + minimal `package.json`, installs only Prisma externals, generates Prisma client, runs migrations at startup via `docker-entrypoint.sh`

---

## Internationalization (i18n)

Translation is a **presentation concern** and lives entirely in the Telegram interface layer (`apps/api/src/modules/telegram/i18n/`).

### Architecture

| Component            | Location               | Purpose                                   |
| -------------------- | ---------------------- | ----------------------------------------- |
| `locale.config.ts`   | `telegram/i18n/`       | Supported locales, defaults, Intl mapping |
| `messages.type.ts`   | `telegram/i18n/`       | `Messages` interface — all string keys    |
| `messages.uk.ts`     | `telegram/i18n/`       | Ukrainian translations (default)          |
| `messages.en.ts`     | `telegram/i18n/`       | English translations                      |
| `TranslationService` | `telegram/i18n/`       | Resolves locale → Messages object         |
| `MessageFormatter`   | `telegram/formatters/` | Formats messages with locale/timezone     |

### Design Decisions

- **Default locale**: `uk` (Ukrainian) — primary user base is Ukrainian
- **Default timezone**: `Europe/Kyiv` — stored per user in the database
- **Per-user settings**: `locale` and `timezone` fields on the User entity allow future per-user language/timezone preferences
- **Notification grouping**: `PowerStatusListener` groups recipients by `locale:timezone` pair and formats one message per group, minimizing duplicate formatting
- **Date formatting**: Uses `Intl.DateTimeFormat` via `toLocaleString()` with the user's timezone — no timezone suffix in output

### Adding a New Locale

1. Add the locale code to `SUPPORTED_LOCALES` in `locale.config.ts`
2. Add the Intl mapping to `LOCALE_INTL_MAP`
3. Create `messages.<code>.ts` implementing the `Messages` interface
4. Register the new messages in the `MESSAGES_MAP` in `translation.service.ts`

---

## Further Reading

- Admin setup workflow: [Admin Guide](./admin-guide.md)
- Implementation details: `docs/implementation/`
- Learning guides with code examples: `docs/learning/`
