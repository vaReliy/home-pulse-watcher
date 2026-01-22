# Copilot Instructions for HomePulse Watcher

## Project Overview

**Name:** HomePulse Watcher
**Core Objective:** DIY Power Outage Notifier. An ESP32-C3 device monitors GPIO and sends REST requests (HMAC signed) to this backend. The backend stores events and notifies users via Telegram.

## Architectural Rules

- **Onion Architecture (Clean Architecture/DDD):**
  - **Core (Domain):** Entities, Value Objects, Domain Services, Repository Interfaces.
  - **Application (Use Cases):** Application Services, Use Case Implementations.
  - **Infrastructure:** Persistence (Prisma), External Services (Telegram), Third-party Libraries.
  - **Interface:** REST Controllers, Telegram Bot Handlers, CLI Commands.
- **Dependency Rule:** Inner layers (Core) MUST NOT depend on outer layers (Infrastructure, Interface). Dependencies point inwards.
- **Monorepo:** Use Nx Monorepo structure with libraries for each layer/module.

## Tech Stack & Conventions

- **Framework:** NestJS
- **ORM:** Prisma with PostgreSQL
- **Nx Library Prefix:** `@home-pulse-watcher/`
- **Validation:** Use **LIVR** for runtime validation (e.g., input DTOs, config validation).
- **Testing:** Jest for unit and integration tests.
- **CLI:** Use `nest-commander` for administrative tasks (e.g., device registration).

## Coding Standards

- **Strict TypeScript:** No `any`. Use strict null checks.
- **Composition over Inheritance:** Avoid deep class hierarchies.
- **Interfaces:** Every Inbound/Outbound adapter (Infrastructure layer) MUST implement an interface defined in the Core/Application layer.
- **Naming:** Use meaningful, descriptive variable names (e.g., `lastSeenAt` instead of `date`).
