# Copilot Instructions for HomePulse Watcher

## Project Overview

HomePulse Watcher is a DIY power outage monitoring system. ESP32-C3 devices monitor power status and send HMAC-signed REST requests to this NestJS backend, which stores events and notifies users via Telegram.

## Architecture

This project follows **Onion Architecture** with **[Chista](https://github.com/koorchik/node-chista)** (Clean Integrated Services) principles:

### Layer Structure (Dependencies Point Inward)

1. **Core (Domain)** `@home-pulse-watcher/core`: Pure entities, repository interfaces, enums. No external dependencies.
2. **Application (Services)** `@home-pulse-watcher/application`: Chista-style services (BaseService). Depends only on Core.
3. **Infrastructure** `@home-pulse-watcher/infrastructure`: Plain TypeScript Prisma repositories. **No NestJS code**.
4. **Interface (Transport)** `apps/api`: NestJS controllers, modules, DI wiring. Maps errors to HTTP.

### Core Layer Exports

- Entities: `User`, `Device`, `UserDevice`, `PowerEvent`
- Enums: `PowerStatus` (OFF=0, ON=1), `DeviceRole` (OWNER, EDITOR, VIEWER)
- Interfaces: `IUserRepository`, `IDeviceRepository`, `IUserDeviceRepository`, `IPowerEventRepository`

### Infrastructure Layer (Pure TypeScript)

- Repositories are plain classes with constructor injection of PrismaClient
- Use `getPrismaClient()` factory for singleton access
- No `@Injectable()` decorators - DI wiring is in Interface layer

### Service Pattern (Chista)

Every business operation is a standalone service class:

- **Validation-First**: Use LIVR for input validation before any logic
- **Transport Agnostic**: Services don't access `Req`/`Res` objects
- **Repository Pattern**: Map Prisma models to Domain Entities (never leak Prisma to services)
- **Standardized Output**: Return `{ data: ... }` or throw specific Error classes

### Security

- Device-to-backend communication uses HMAC signatures
- Signature verification happens in Middleware/Guards, passing verified `deviceId` to service context
- Environment variables: `APP_GLOBAL_SALT`, `HMAC_SECRET_KEY` (32+ chars each)

## Tech Stack

- **Monorepo**: Nx 22.4 with `@home-pulse-watcher/` prefix
- **Framework**: NestJS 11
- **ORM**: Prisma 7.3 with PostgreSQL
- **Validation**: LIVR (custom rules use camelCase: `macAddress`, `hmacFormat`)
- **Testing**: Jest 30 with SWC compiler
- **CLI**: nest-commander for admin tasks

## Database Models

- **User**: Telegram users (telegramId unique)
- **Device**: ESP32 devices (macAddress unique, secretHash for HMAC)
- **UserDevice**: Many-to-many with role (VIEWER default)
- **PowerEvent**: Status changes (1=on, 0=off) with optional duration

## Coding Standards

- **Strict TypeScript**: No `any`, strict null checks
- **Composition over Inheritance**: Avoid deep class hierarchies
- **Interface-First**: Infrastructure adapters implement Core/Application interfaces
- **Descriptive Names**: `lastSeenAt` not `date`
- **camelCase Everywhere**: Including LIVR rules (`macAddress` not `mac_address`)
