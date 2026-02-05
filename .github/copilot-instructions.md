# Copilot Instructions for HomePulse Watcher

## Project Overview

HomePulse Watcher is a DIY power outage monitoring system. ESP32-C3/ESP32-C6 devices monitor power status and send HMAC-signed REST requests to this NestJS backend, which stores events and notifies users via Telegram.

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
- Device secrets are encrypted with AES-256-GCM (stored as `encryptedSecret`)
- Signature verification happens in Guards, passing verified `deviceId` to service context
- Environment variable: `DEVICE_SECRET_ENCRYPTION_KEY` (64 hex chars)

### Telegram Bot Integration

- **Library**: Telegraf (TypeScript-native Telegram bot framework)
- **Module**: `apps/api/src/modules/telegram/`
- **Commands**: `/start`, `/help`, `/status`, `/devices`
- **Notifications**: Event-driven via `@OnEvent(POWER_STATUS_CHANGED_EVENT)`
- **Authentication**: User verification via `telegramId` lookup before protected commands
- **Environment**: `TELEGRAM_BOT_TOKEN` (required), `TELEGRAM_ADMIN_CHAT_ID` (optional)

Bot follows the adapter pattern - handlers call existing Application Services, keeping business logic transport-agnostic.

### ESP32 Firmware

- **Location**: `firmware/` directory (ESP32-C3 and ESP32-C6 variants)
- **Build Tool**: PlatformIO with Arduino framework
- **Features**: WiFi, NTP time sync, HMAC-SHA256 signing, GPIO power detection
- **Configuration**: `config.h` (hardware), `secrets.h` (credentials - not tracked)
- **Documentation**: `docs/device-provisioning-guide.md`, `firmware/docs/FLASHING_GUIDE.md`

## Tech Stack

- **Monorepo**: Nx 22.4 with `@home-pulse-watcher/` prefix
- **Framework**: NestJS 11
- **ORM**: Prisma 7.3 with PostgreSQL
- **Validation**: LIVR (custom rules use camelCase: `macAddress`, `hmacFormat`)
- **Testing**: Jest 30 with SWC compiler
- **CLI**: nest-commander for admin tasks

## Database Models

- **User**: Telegram users (telegramId unique)
- **Device**: ESP32 devices (macAddress unique, encryptedSecret for HMAC verification)
- **UserDevice**: Many-to-many with role (VIEWER default)
- **PowerEvent**: Status changes (1=on, 0=off) with optional duration

## Coding Standards

- **Strict TypeScript**: No `any`, strict null checks
- **Composition over Inheritance**: Avoid deep class hierarchies
- **Interface-First**: Infrastructure adapters implement Core/Application interfaces
- **Descriptive Names**: `lastSeenAt` not `date`
- **camelCase Everywhere**: Including LIVR rules (`macAddress` not `mac_address`)

## Code Formatting Rules

### TypeScript Configuration

- **Module System**: `"module": "nodenext"`, `"moduleResolution": "nodenext"`
- **Target**: ES2022
- **Strict Mode**: All strict flags enabled
- **Compiler Options**:
  - `noUnusedLocals: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
  - `noImplicitOverride: true`

### Import/Export Conventions

- **Always use `.js` extensions** in imports (TypeScript with NodeNext module resolution)
  - `import { User } from './user.entity.js';`
  - `import { BaseService } from '../../base-service.js';`
- **Use `type` imports** for types/interfaces: `import type { Device } from '@home-pulse-watcher/core';`
- **Named exports only** - avoid default exports
- **Barrel exports** through index.ts files for clean API surfaces

### Prettier Configuration

- **Single quotes**: `'string'` not `"string"`
- **Default Prettier rules** for everything else (2-space indent, trailing commas, etc.)

### Naming Conventions

- **Interfaces**: Prefix with `I` for repository/service abstractions (`IDeviceRepository`, `IEventEmitter`)
- **Types**: PascalCase without prefix (`PowerStatus`, `DeviceRole`, `LivrRules`)
- **Classes**: PascalCase (`BaseService`, `PrismaDeviceRepository`, `CreateUserService`)
- **Files**: kebab-case (`device.repository.ts`, `create-user.service.ts`, `power-status.enum.ts`)
- **Constants**: SCREAMING_SNAKE_CASE for error codes (`DEVICE_ALREADY_REGISTERED`)
- **Enums**: Use `as const` objects over TypeScript enums

### Service Structure

```typescript
export interface ServiceNameInput {
  field: string;
}

export interface ServiceNameOutput {
  result: ResultType;
}

export class ServiceNameService extends BaseService<ServiceNameInput, ServiceNameOutput> {
  constructor(private readonly repository: IRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      field: ['required', 'string'],
    };
  }

  protected async execute(params: ServiceNameInput, context: ServiceContext): Promise<ServiceNameOutput> {
    // Implementation
  }
}
```

### Repository Pattern

- **Plain TypeScript classes** in Infrastructure layer (no `@Injectable()`)
- **Constructor injection** of PrismaClient
- **Map Prisma models** to Domain Entities using mapper functions
- **Never expose** Prisma types outside Infrastructure layer

### Error Handling

- **Specific error classes**: `ValidationError`, `DomainError`, `NotFoundError`
- **Error codes as constants**: `DomainErrorCode.DEVICE_ALREADY_REGISTERED`
- **Descriptive messages**: Include identifiers in error messages

### Documentation

- **JSDoc comments** for:
  - All public classes and interfaces
  - All public methods
  - Complex business logic
- **Concise descriptions**: One-line summary preferred
- **Include parameter/return descriptions** for non-obvious cases
