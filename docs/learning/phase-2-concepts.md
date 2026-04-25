# Learning Guide - Phase 2 Concepts

## Concept 1: Symbol-Based Dependency Injection Tokens

```typescript
// repository.tokens.ts
export const REPOSITORY_TOKENS = {
  USER: Symbol('IUserRepository'),
  DEVICE: Symbol('IDeviceRepository'),
} as const;
```

**Why Symbols?**

- Symbols are unique identifiers that prevent naming collisions
- Unlike strings, `Symbol('IUserRepository') !== Symbol('IUserRepository')`
- TypeScript can't type-check string tokens, but Symbol tokens work with `@Inject()`

**How it works:**

```typescript
// Provider: "When someone asks for REPOSITORY_TOKENS.USER, give them this"
{
  provide: REPOSITORY_TOKENS.USER,
  useFactory: (prisma) => new PrismaUserRepository(prisma),
  inject: [PrismaService],
}

// Consumer: "I need whatever REPOSITORY_TOKENS.USER points to"
constructor(@Inject(REPOSITORY_TOKENS.USER) private userRepo: IUserRepository) {}
```

---

## Concept 2: Factory Providers

```typescript
{
  provide: SERVICE_TOKENS.REGISTER_DEVICE,
  useFactory: (deviceRepo: IDeviceRepository) => new RegisterDeviceService(deviceRepo),
  inject: [REPOSITORY_TOKENS.DEVICE],
}
```

**The flow:**

1. NestJS sees `inject: [REPOSITORY_TOKENS.DEVICE]`
2. It resolves that token to get a `PrismaDeviceRepository` instance
3. It passes that instance to `useFactory`
4. `useFactory` creates `RegisterDeviceService` with the repository
5. Result is bound to `SERVICE_TOKENS.REGISTER_DEVICE`

**Why not just `@Injectable()` on services?**

- Keeps application layer NestJS-free (framework agnostic)
- Services can be tested without NestJS DI container
- Same services could work with Express, Fastify, or plain Node.js

---

## Concept 3: Chista Service Pattern

```typescript
export class RegisterDeviceService extends BaseService<Input, Output> {
  // 1. Validation rules (LIVR format)
  protected validationRules(): LivrRules {
    return { macAddress: ['required', 'macAddress'] };
  }

  // 2. Business logic (runs AFTER validation passes)
  protected async execute(params: Input, context: ServiceContext): Promise<Output> {
    // params are already validated here
  }
}
```

**The BaseService.run() flow:**

```
run(params, context)
  └─> validate(params)        // Throws ValidationError if invalid
       └─> execute(params)    // Your business logic
            └─> { data: result }  // Wrapped response
```

**Benefits:**

- Validation is declarative (rules, not code)
- Business logic is separate from transport (HTTP, CLI, etc.)
- Errors are typed and predictable

---

## Concept 4: nest-commander Pattern

```typescript
@Command({
  name: 'device:register',
  description: 'Register a new device',
})
export class RegisterDeviceCommand extends CommandRunner {
  constructor(
    @Inject(SERVICE_TOKENS.REGISTER_DEVICE)
    private readonly service: RegisterDeviceService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    const result = await this.service.run({ macAddress: options.mac });
    console.log(result.data);
  }

  @Option({ flags: '-m, --mac <mac>', required: true })
  parseMac(val: string): string {
    return val.toUpperCase(); // Transform before reaching run()
  }
}
```

**Key concepts:**

- `@Command` defines the CLI command name
- `@Option` defines flags and parses them
- `run()` receives parsed options
- Commands inject services just like controllers

---

## Concept 5: Prisma 7.3 Driver Adapter

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

new PrismaClient({ adapter });
```

**Why adapters?**

- Prisma 7.x moved to a "driver adapter" model
- You bring your own database driver (pg, mysql2, etc.)
- Enables serverless/edge deployments
- Better connection pooling control

**Without adapter (Prisma <7):**

```typescript
new PrismaClient(); // Prisma manages the driver internally
```

**With adapter (Prisma 7+):**

```typescript
new PrismaClient({ adapter }); // You manage the driver
```

---

## Concept 6: Global vs Regular Modules

```typescript
// prisma.module.ts
@Global() // <-- This is key
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**Without `@Global()`:**

```typescript
// Every module that needs PrismaService must import PrismaModule
@Module({
  imports: [PrismaModule], // Required in each module
})
export class RepositoriesModule {}
```

**With `@Global()`:**

```typescript
// Import once in AppModule, available everywhere
@Module({
  imports: [PrismaModule], // Only here
})
export class AppModule {}

@Module({
  // No need to import PrismaModule - it's global
})
export class RepositoriesModule {}
```

### Comparison: NestJS @Global() vs Angular providedIn: 'root'

| Aspect              | NestJS `@Global()`                   | Angular `providedIn: 'root'`      |
| ------------------- | ------------------------------------ | --------------------------------- |
| **Scope**           | Module-level decorator               | Service-level decorator           |
| **Where defined**   | On the module class                  | In `@Injectable()` metadata       |
| **Registration**    | Must import module in root once      | Auto-registered, no import needed |
| **Tree-shaking**    | No (always included)                 | Yes (removed if unused)           |
| **Singleton scope** | Yes, within module boundary          | Yes, app-wide                     |
| **Use case**        | Cross-cutting concerns (DB, logging) | App-wide services                 |

**Key difference:** Angular's `providedIn: 'root'` is self-registering - the service declares where it belongs. NestJS `@Global()` requires explicit module import in the root module.

---

## Concept 7: Config Injection via ServiceContext

```typescript
// ❌ Bad: Direct env access in service (breaks testability)
protected async execute(params: Input, context: ServiceContext) {
  const salt = process.env['APP_GLOBAL_SALT'];
}

// ✅ Good: Config injected via context
protected async execute(params: Input, context: ServiceContext) {
  const salt = context.config?.appGlobalSalt;
  if (!salt) {
    throw new Error('appGlobalSalt not provided in service context');
  }
}
```

**Why inject config?**

- **Testability**: Tests can provide mock config without touching `process.env`
- **Explicit dependencies**: Service declares what config it needs
- **Transport layer responsibility**: CLI/Controller reads env and passes to service

**The flow:**

```
CLI/Controller reads process.env
  └─> Creates context with config
       └─> service.run(params, { config: { appGlobalSalt } })
            └─> Service uses context.config (never process.env)
```

**Type definitions:**

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
```

---

## Concept 8: BigInt Serialization

```typescript
// Problem: BigInt can't be JSON.stringify'd
const user = { telegramId: BigInt('123456789') };
JSON.stringify(user); // TypeError: BigInt value can't be serialized

// Solution: NestJS Interceptor transforms response
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.transformBigInt(data)));
  }

  private transformBigInt(obj: unknown): unknown {
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map((item) => this.transformBigInt(item));
    if (obj !== null && typeof obj === 'object') {
      if (obj instanceof Date) return obj; // Preserve Date objects
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, this.transformBigInt(v)]));
    }
    return obj;
  }
}
```

**When to use BigInt?**

- Telegram user IDs can exceed JavaScript's `Number.MAX_SAFE_INTEGER` (2^53 - 1)
- Prisma maps PostgreSQL `BIGINT` columns to JavaScript `bigint`
- The interceptor ensures safe JSON serialization in HTTP responses

**The transformation:**

```
Service returns:    { telegramId: 123456789n }
Interceptor maps:   { telegramId: '123456789' }
HTTP response:      {"telegramId":"123456789"}
```

---

## Concept 9: Exception Filter

```typescript
@Catch(BaseError) // Only catch BaseError and subclasses
export class ServiceExceptionFilter implements ExceptionFilter {
  catch(exception: BaseError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.httpStatus).json(exception.toJSON());
  }
}
```

**Flow:**

```
Controller throws DomainError
  └─> NestJS exception layer catches it
       └─> ServiceExceptionFilter.catch() runs
            └─> HTTP response with proper status/body
```

**Why custom filter?**

- Domain errors have semantic meaning (409 Conflict, 404 Not Found)
- Default NestJS error handler would return 500
- `toJSON()` provides consistent error format

---

## Quick Reference: File → Purpose

| Layer          | File                               | What it does                        |
| -------------- | ---------------------------------- | ----------------------------------- |
| Shared         | `service-context.type.ts`          | ServiceContext with AppConfig type  |
| Core           | `IDeviceRepository`                | Contract (interface)                |
| Infrastructure | `PrismaDeviceRepository`           | Implementation                      |
| Application    | `RegisterDeviceService`            | Business logic                      |
| API            | `repository.tokens.ts`             | DI identifiers                      |
| API            | `repository.providers.ts`          | Wiring (interface → implementation) |
| API            | `service.providers.ts`             | Wiring (service → repositories)     |
| API            | `bigint-serializer.interceptor.ts` | BigInt → string transformation      |
| API            | `register-device.command.ts`       | CLI interface                       |
