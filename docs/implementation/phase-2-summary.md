# Phase 2 Implementation Summary

**Completed**: January 2026

## Overview

Phase 2 implemented NestJS dependency injection wiring, Chista-style application services, CLI commands using nest-commander, and exception handling infrastructure.

## Architecture Decisions

### Services: Plain Classes with Factory DI

Application services remain **plain TypeScript classes** (no `@Injectable()`) to keep the application layer framework-agnostic. NestJS wiring happens via factory providers:

```typescript
// In application layer - pure TypeScript
export class RegisterDeviceService extends BaseService<Input, Output> {
  constructor(private readonly deviceRepository: IDeviceRepository) {
    super();
  }
}

// In apps/api - NestJS factory provider
{
  provide: SERVICE_TOKENS.REGISTER_DEVICE,
  useFactory: (repo: IDeviceRepository) => new RegisterDeviceService(repo),
  inject: [REPOSITORY_TOKENS.DEVICE],
}
```

### PrismaService Location

PrismaService lives in `apps/api` (not infrastructure) because:

- Uses NestJS decorators (`@Injectable()`)
- Implements NestJS lifecycle interfaces
- Infrastructure layer must remain NestJS-free per architecture

### Prisma 7.3 Adapter Pattern

Prisma 7.3 requires an adapter for the new client engine:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const adapter = new PrismaPg(pool);

new PrismaClient({ adapter });
```

## Files Created

### PrismaModule (`apps/api/src/modules/prisma/`)

| File                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `prisma.service.ts` | NestJS PrismaClient with pg adapter, lifecycle hooks |
| `prisma.module.ts`  | Global module exporting PrismaService                |

### RepositoriesModule (`apps/api/src/modules/repositories/`)

| File                      | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `repository.tokens.ts`    | Symbol tokens: USER, DEVICE, USER_DEVICE, POWER_EVENT   |
| `repository.providers.ts` | Factory providers binding tokens to Prisma repositories |
| `repositories.module.ts`  | Module importing PrismaModule, exporting tokens         |

### ServicesModule (`apps/api/src/modules/services/`)

| File                   | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `service.tokens.ts`    | Symbol tokens for application services                        |
| `service.providers.ts` | Factory providers wiring services to repositories             |
| `services.module.ts`   | Module importing RepositoriesModule, exporting service tokens |

### Application Services (`libs/application/src/lib/services/`)

| File                                | Service               | Dependencies      |
| ----------------------------------- | --------------------- | ----------------- |
| `device/register-device.service.ts` | RegisterDeviceService | IDeviceRepository |
| `device/get-device.service.ts`      | GetDeviceService      | IDeviceRepository |
| `device/list-devices.service.ts`    | ListDevicesService    | IDeviceRepository |
| `user/create-user.service.ts`       | CreateUserService     | IUserRepository   |
| `index.ts`                          | Barrel exports        | -                 |

### Exception Filter (`apps/api/src/filters/`)

| File                          | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `service-exception.filter.ts` | Catches BaseError, maps to HTTP response |

### Interceptors (`apps/api/src/interceptors/`)

| File                              | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `bigint-serializer.interceptor.ts` | Converts BigInt to string in HTTP responses |

### CLI (`apps/api/src/cli/`)

| File                                | Purpose                              |
| ----------------------------------- | ------------------------------------ |
| `cli.ts`                            | CLI entry point using CommandFactory |
| `cli.module.ts`                     | NestJS module for CLI commands       |
| `device/register-device.command.ts` | `device:register` command            |
| `device/list-devices.command.ts`    | `device:list` command                |
| `user/create-user.command.ts`       | `user:create` command                |

## Module Dependency Graph

```
AppModule (HTTP Server)
├── PrismaModule (global)
│   └── PrismaService
├── RepositoriesModule
│   └── REPOSITORY_TOKENS.* → Prisma*Repository
├── ServicesModule
│   └── SERVICE_TOKENS.* → *Service
└── ServiceExceptionFilter

CliModule (CLI)
├── PrismaModule
├── RepositoriesModule
├── ServicesModule
└── *Command providers
```

## Service Implementation Pattern

Each service follows the Chista pattern:

```typescript
export class RegisterDeviceService extends BaseService<
  RegisterDeviceInput,
  RegisterDeviceOutput
> {
  constructor(private readonly deviceRepository: IDeviceRepository) {
    super();
  }

  // LIVR validation rules
  protected validationRules(): LivrRules {
    return {
      macAddress: ['required', 'macAddress'],
      label: { max_length: 100 },
    };
  }

  // Business logic (runs after validation)
  protected async execute(
    params: RegisterDeviceInput,
    context: ServiceContext
  ): Promise<RegisterDeviceOutput> {
    // Config injection via context (not process.env)
    const appSalt = context.config?.appGlobalSalt;
    if (!appSalt) {
      throw new Error('appGlobalSalt not provided in service context');
    }

    // Check uniqueness
    const exists = await this.deviceRepository.existsByMacAddress(params.macAddress);
    if (exists) {
      throw new DomainError(DomainErrorCode.DEVICE_ALREADY_REGISTERED, '...');
    }

    // Generate secret, create device
    const secret = crypto.randomBytes(32).toString('hex');
    const secretHash = crypto.createHmac('sha256', appSalt).update(secret).digest('hex');

    const device = await this.deviceRepository.create({ ... });
    return { device, secret };
  }
}
```

### Config Injection Pattern

Services receive configuration via `ServiceContext`, not `process.env`:

```typescript
// libs/shared/src/lib/types/service-context.type.ts
export interface AppConfig {
  appGlobalSalt: string;
}

export interface ServiceContext {
  userId?: string;
  deviceId?: string;
  config?: AppConfig;
}

// CLI/Controller passes config in context
await service.run(params, {
  config: { appGlobalSalt: process.env['APP_GLOBAL_SALT']! }
});
```

### BigInt Serialization

JavaScript BigInt cannot be JSON.stringify(). The interceptor handles this:

```typescript
// apps/api/src/interceptors/bigint-serializer.interceptor.ts
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.transformBigInt(data)));
  }

  private transformBigInt(obj: unknown): unknown {
    if (typeof obj === 'bigint') return obj.toString();
    // Recursively handles objects/arrays
  }
}
```

## Infrastructure Updates

### Prisma Client Factory

Updated `libs/infrastructure/src/lib/persistence/prisma-client.factory.ts` to use pg adapter:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export function getPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
```

### Webpack Multi-Entry

Updated `apps/api/webpack.config.js` to build both server and CLI:

```javascript
entry: {
  main: './src/main.ts',
  cli: './src/cli.ts',
},
```

## Testing

### Service Unit Tests

```typescript
describe('RegisterDeviceService', () => {
  const mockRepo: jest.Mocked<IDeviceRepository> = {
    existsByMacAddress: jest.fn(),
    create: jest.fn(),
  };

  const validContext = {
    config: { appGlobalSalt: 'test-salt-32-characters-minimum!' },
  };

  it('should register new device', async () => {
    mockRepo.existsByMacAddress.mockResolvedValue(false);
    mockRepo.create.mockResolvedValue(mockDevice);

    const service = new RegisterDeviceService(mockRepo);
    const result = await service.run(
      { macAddress: 'AA:BB:CC:DD:EE:FF' },
      validContext  // Config passed via context
    );

    expect(result.data.device).toBeDefined();
    expect(result.data.secret).toHaveLength(64);
  });

  it('should throw when config missing', async () => {
    const service = new RegisterDeviceService(mockRepo);

    await expect(
      service.run({ macAddress: 'AA:BB:CC:DD:EE:FF' }, {})
    ).rejects.toThrow('appGlobalSalt not provided in service context');
  });
});
```

## Environment Variables

Required for CLI:

- `DATABASE_URL` - PostgreSQL connection string
- `APP_GLOBAL_SALT` - 32+ character salt for HMAC secret hashing

## Dependencies Added

```bash
npm install nest-commander
```
