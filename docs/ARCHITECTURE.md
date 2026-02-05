# Project Architecture: HomePulse Watcher

This document outlines the architectural principles and patterns used in HomePulse Watcher, blending **Onion Architecture** with **[Chista](https://github.com/koorchik/node-chista)** principles for robust and testable service-oriented development.

## 🌟 Core Product Idea

**HomePulse Watcher** is a resilient power-monitoring ecosystem.
The core mission is to bridge the gap between low-power hardware (ESP32-C3/ESP32-C6) and end-users by providing reliable, authenticated, and instant notifications regarding power grid stability.

### The Problem

Power outages are unpredictable. Users need to know exactly _when_ power was lost and _how long_ it lasted to manage food safety, heating, or remote servers.

### The Solution

A distributed system where lightweight sensors report state changes via HMAC-signed payloads to a centralized NestJS engine, which processes logic and dispatches alerts via Telegram.

---

## 🏛 Architectural Principles (Chista + NestJS)

We adopt the **Clean Integrated Services** approach. The application logic is decoupled from the framework (NestJS) and the database (Prisma).

### 1. The Service Pattern (The "Chista" Way)

Every business operation must be a standalone **Service** class.

- **Atomic:** One service = One business action (e.g., `RegisterDevice`, `LogPowerEvent`).
- **Transport Agnostic:** The service doesn't know about `Req` or `Res` objects.
- **Validation-First:** Every service utilizes **LIVR** for strict input validation.

### 2. Layers & Dependency Rule (Pure Onion)

| Layer              | Library                              | Contains                                                     | Framework Code |
| ------------------ | ------------------------------------ | ------------------------------------------------------------ | -------------- |
| **Core**           | `@home-pulse-watcher/core`           | Entities, Repository Interfaces, Enums                       | ❌ None        |
| **Application**    | `@home-pulse-watcher/application`    | BaseService, Chista services                                 | ❌ None        |
| **Infrastructure** | `@home-pulse-watcher/infrastructure` | Prisma Repositories, Mappers, External APIs                  | ❌ None        |
| **Interface**      | `apps/api`                           | NestJS Controllers, Modules, DI Wiring, Guards, Interceptors | ✅ NestJS      |

**Key Principle:** Infrastructure layer contains **plain TypeScript classes** with constructor injection.
NestJS DI wiring (providers, modules, interceptors, guards) lives exclusively in the Interface layer.

### 3. Service Structure Example

A typical service follows this lifecycle:

1. **Validation:** Check `params` using a LIVR schema.
2. **Context:** Access `context` for authorization (e.g., `userId`).
3. **Execution:** Perform logic using injected repositories.
4. **Result:** Return a standardized `{ data: ... }` or throw a specialized `Exception`.

---

## 🛠 Coding Practices & Recommendations

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

- Use specific Error classes (e.g., `NotFoundError`, `DomainError`, `ValidationError`).
- The Transport layer (NestJS) is responsible for mapping these to HTTP Status Codes via `ServiceExceptionFilter`.

---

## 🔧 Key Patterns

### Config Injection

Services must not access `process.env` directly. Configuration is injected via `ServiceContext.config`. The Interface layer (CLI commands, controllers) reads environment variables and passes them to services. This ensures services remain testable without mocking `process.env`.

### BigInt Serialization

JavaScript `BigInt` cannot be serialized with `JSON.stringify()`. The Interface layer handles this via an interceptor that recursively converts `BigInt` values to strings in HTTP responses.

### Factory-Based DI Wiring

Services remain plain TypeScript classes (no `@Injectable()`). NestJS binds them via factory providers using Symbol tokens. This keeps the Application layer framework-agnostic while allowing full DI capabilities in the Interface layer.

---

## 📚 Further Reading

- Implementation details: `docs/implementation/`
- Learning guides with code examples: `docs/learning/`
