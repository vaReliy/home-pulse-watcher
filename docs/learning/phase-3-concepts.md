# Learning Guide - Phase 3 Concepts

## Concept 1: AES-256-GCM Encryption for Device Secrets

```typescript
// libs/shared/src/lib/crypto/device-secret.crypto.ts
import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

export function encryptDeviceSecret(secret: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
```

**Why AES-GCM over hashing?**

| Approach          | Can Verify Signatures?    | Security              |
| ----------------- | ------------------------- | --------------------- |
| Hash (SHA256)     | ❌ Can't recover original | One-way, can't verify |
| Encrypt (AES-GCM) | ✅ Decrypt to verify      | Reversible with key   |

**Storage format:** `iv:authTag:ciphertext`

- **IV (Initialization Vector)**: Random bytes, ensures same plaintext encrypts differently each time
- **Auth Tag**: Integrity check, detects tampering
- **Ciphertext**: The encrypted secret

**The flow:**

```
Device Registration:
  secret = random 32 bytes → "a1b2c3..."
  encryptedSecret = AES-GCM(secret, ENCRYPTION_KEY) → "iv:tag:cipher"
  Store encryptedSecret in DB
  Return secret to ESP32 (one-time display)

Signature Verification:
  Load encryptedSecret from DB
  secret = decrypt(encryptedSecret, ENCRYPTION_KEY)
  expectedSig = HMAC-SHA256(secret, payload)
  Compare with received signature
```

---

## Concept 2: NestJS Guards for Authentication

```typescript
// apps/api/src/guards/hmac-auth.guard.ts
@Injectable()
export class HmacAuthGuard implements CanActivate {
  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Extract & validate headers
    // 2. Verify timestamp (replay protection)
    // 3. Find device, decrypt secret
    // 4. Verify signature
    // 5. Attach deviceId to request

    (request as any).deviceId = device.id;
    return true;
  }
}
```

**Guard vs Middleware vs Interceptor:**

| Type        | Runs                          | Can Access       | Use Case          |
| ----------- | ----------------------------- | ---------------- | ----------------- |
| Middleware  | Before routing                | Raw request      | Logging, CORS     |
| Guard       | After routing, before handler | ExecutionContext | Auth, permissions |
| Interceptor | Around handler                | Both req & res   | Transform, cache  |

**Guard execution flow:**

```
Request → Middleware → Guard → Interceptor (before) → Handler → Interceptor (after) → Response
                        ↓
                   canActivate()
                   returns false → 403 Forbidden
                   throws error → Exception filter
```

**Why Guards for HMAC?**

- Access to NestJS DI (can inject repositories)
- Can be applied per-controller or per-route
- Clear separation: Guard authenticates, Controller handles business logic

---

## Concept 3: Parameter Decorators

```typescript
// apps/api/src/decorators/device-context.decorator.ts
export const DeviceId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { deviceId?: string }>();

  if (!request.deviceId) {
    throw new Error('DeviceId decorator used without HmacAuthGuard');
  }

  return request.deviceId;
});
```

**Usage in controller:**

```typescript
@Controller('device')
@UseGuards(HmacAuthGuard)
export class DeviceStatusController {
  @Post('status')
  async reportStatus(
    @Body() dto: ReportStatusDto,
    @DeviceId() deviceId: string, // ← Extracted from request
  ) {
    // deviceId is guaranteed to be valid here
  }
}
```

**How it works:**

```
Guard runs first:
  request.deviceId = 'device-123'  // Attached by guard

Controller method called:
  @DeviceId() → createParamDecorator runs
             → Reads request.deviceId
             → Returns 'device-123' as parameter
```

**Common parameter decorators:**

| Decorator     | Source              | Example                             |
| ------------- | ------------------- | ----------------------------------- |
| `@Body()`     | Request body        | `@Body() dto: CreateDto`            |
| `@Param()`    | URL params          | `@Param('id') id: string`           |
| `@Query()`    | Query string        | `@Query('page') page: number`       |
| `@Headers()`  | HTTP headers        | `@Headers('x-api-key') key: string` |
| `@DeviceId()` | Custom (from guard) | `@DeviceId() deviceId: string`      |

---

## Concept 4: Replay Attack Prevention

```typescript
// In HmacAuthGuard
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

const timestampNum = parseInt(timestamp, 10);
const now = Math.floor(Date.now() / 1000);

if (Math.abs(now - timestampNum) > TIMESTAMP_TOLERANCE_SECONDS) {
  throw new AuthenticationError('Request timestamp expired');
}
```

**What is a replay attack?**

```
Attacker captures: POST /device/status with valid signature
Later, attacker resends the same request
Without timestamp check → Server accepts it again!
```

**Protection mechanism:**

```
ESP32 sends:
  X-Timestamp: 1706500000 (current Unix time)
  X-Signature: HMAC(secret, "MAC:1706500000:1")

Server checks:
  current_time = 1706500100 (100 seconds later)
  |1706500100 - 1706500000| = 100 < 300 ✅ Accept

Replay after 10 minutes:
  current_time = 1706500600
  |1706500600 - 1706500000| = 600 > 300 ❌ Reject
```

**Why 5 minutes?**

- Allows for clock drift between ESP32 and server
- Short enough to limit replay window
- ESP32 doesn't have RTC, may drift slightly

---

## Concept 5: Timing-Safe Comparison

```typescript
// ❌ Bad: Vulnerable to timing attacks
if (signature !== expectedSignature) {
  throw new Error('Invalid signature');
}

// ✅ Good: Constant-time comparison
const sigBuffer = Buffer.from(signature, 'hex');
const expectedBuffer = Buffer.from(expectedSignature, 'hex');

if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
  throw new Error('Invalid signature');
}
```

**What is a timing attack?**

```
String comparison "abc" vs "xyz":
  Compare 'a' vs 'x' → Different! Return false immediately

String comparison "abc" vs "abd":
  Compare 'a' vs 'a' → Same, continue
  Compare 'b' vs 'b' → Same, continue
  Compare 'c' vs 'd' → Different! Return false

The second comparison takes longer!
Attacker measures response time to guess characters.
```

**How `timingSafeEqual` works:**

- Always compares ALL bytes, regardless of match
- Takes same time whether first byte or last byte differs
- Prevents information leakage through timing

---

## Concept 6: Domain Events with EventEmitter

```typescript
// libs/application/src/lib/events/power-status-changed.event.ts
export class PowerStatusChangedEvent {
  readonly deviceId: string;
  readonly previousStatus: PowerStatus | null;
  readonly newStatus: PowerStatus;
  readonly timestamp: Date;

  get isPowerLost(): boolean {
    return this.previousStatus === PowerStatus.ON && this.newStatus === PowerStatus.OFF;
  }

  get isPowerRestored(): boolean {
    return this.previousStatus === PowerStatus.OFF && this.newStatus === PowerStatus.ON;
  }
}

export const POWER_STATUS_CHANGED_EVENT = 'power.status.changed';
```

**Emitting events from service:**

```typescript
// ProcessPowerStatusService
export interface IEventEmitter {
  emit(event: string, payload: unknown): boolean;
}

export class ProcessPowerStatusService extends BaseService<...> {
  constructor(
    private readonly deviceRepository: IDeviceRepository,
    private readonly powerEventRepository: IPowerEventRepository,
    private readonly eventEmitter?: IEventEmitter,  // Optional!
  ) { super(); }

  protected async execute(...) {
    // ... create event, update device ...

    if (this.eventEmitter && isStatusChange) {
      this.eventEmitter.emit(
        POWER_STATUS_CHANGED_EVENT,
        new PowerStatusChangedEvent({ ... })
      );
    }
  }
}
```

**Wiring with NestJS EventEmitter2:**

```typescript
// app.module.ts
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule.forRoot(), ...],
})
export class AppModule {}

// service.providers.ts
{
  provide: SERVICE_TOKENS.PROCESS_POWER_STATUS,
  useFactory: (deviceRepo, powerEventRepo, eventEmitter: EventEmitter2) =>
    new ProcessPowerStatusService(deviceRepo, powerEventRepo, eventEmitter as IEventEmitter),
  inject: [REPOSITORY_TOKENS.DEVICE, REPOSITORY_TOKENS.POWER_EVENT, EventEmitter2],
}
```

**Why optional event emitter?**

- Service remains testable without NestJS
- Unit tests can pass `undefined` or a mock emitter
- Follows dependency inversion principle

**Listening to events (Phase 4):**

```typescript
@Injectable()
export class NotificationListener {
  @OnEvent(POWER_STATUS_CHANGED_EVENT)
  handlePowerChange(event: PowerStatusChangedEvent) {
    if (event.isPowerLost) {
      // Send Telegram notification: "Power outage detected!"
    }
  }
}
```

---

## Concept 7: Duration Calculation Pattern

```typescript
// ProcessPowerStatusService.execute()

// 1. Get the previous event
const lastEvent = await this.powerEventRepository.findLatestByDeviceId(deviceId);

if (lastEvent) {
  // 2. Calculate how long the previous state lasted
  const duration = Math.floor((timestamp.getTime() - lastEvent.timestamp.getTime()) / 1000);

  // 3. Update the PREVIOUS event with duration
  await this.powerEventRepository.update(lastEvent.id, { duration });
}

// 4. Create new event (duration will be set by NEXT event)
const event = await this.powerEventRepository.create({
  deviceId,
  status: newStatus,
  timestamp,
  duration: null, // Unknown until next event
});
```

**Visual timeline:**

```
Event 1: ON  at 10:00  duration: null
Event 2: OFF at 10:30  duration: null
  → Update Event 1: duration = 30 minutes

Event 3: ON  at 11:00  duration: null
  → Update Event 2: duration = 30 minutes

Current state:
  Event 1: ON  10:00  duration: 1800s (30 min)
  Event 2: OFF 10:30  duration: 1800s (30 min)
  Event 3: ON  11:00  duration: null (ongoing)
```

**Why store duration on previous event?**

- Duration = "how long this state lasted"
- Can only know when state ENDS (next event arrives)
- `null` duration means "currently in this state"

---

## Concept 8: Authentication Error Hierarchy

```typescript
// libs/shared/src/lib/errors/authentication.error.ts
export const AuthenticationErrorCode = {
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EXPIRED_TIMESTAMP: 'EXPIRED_TIMESTAMP',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
} as const;

export class AuthenticationError extends BaseError {
  readonly code: AuthenticationErrorCodeType;
  readonly httpStatus = 401; // Always Unauthorized

  constructor(message: string, code: AuthenticationErrorCodeType) {
    super(message);
    this.code = code;
  }
}
```

**Error hierarchy:**

```
BaseError (abstract)
├── ValidationError      → 400 Bad Request
├── NotFoundError        → 404 Not Found
├── DomainError          → 409/403/422 (varies)
└── AuthenticationError  → 401 Unauthorized (new!)
```

**Why separate AuthenticationError?**

- All auth failures return 401 (HTTP standard)
- Different codes help debugging (was it signature? timestamp?)
- Caught by existing ServiceExceptionFilter

---

## Concept 9: HMAC Signature Protocol

**ESP32 creates signature:**

```c
// Payload format: MAC:TIMESTAMP:STATUS
char payload[128];
sprintf(payload, "%s:%ld:%d", "AA:BB:CC:DD:EE:FF", timestamp, status);

// HMAC-SHA256 with device secret
unsigned char signature[32];
hmac_sha256(device_secret, 64, payload, strlen(payload), signature);
```

**Server verifies:**

```typescript
const payload = `${normalizedMac}:${timestamp}:${status}`;
const expectedSignature = crypto.createHmac('sha256', deviceSecret).update(payload).digest('hex');
```

**Why this format?**

- `MAC`: Identifies the device
- `TIMESTAMP`: Prevents replay attacks
- `STATUS`: The actual data being sent

**Full request example:**

```http
POST /api/device/status HTTP/1.1
X-Device-Mac: AA:BB:CC:DD:EE:FF
X-Timestamp: 1706500000
X-Signature: 5d41402abc4b2a76b9719d911017c592...

{"status": 1}
```

---

## Quick Reference: Phase 3 Files

| Layer       | File                                                    | Purpose                     |
| ----------- | ------------------------------------------------------- | --------------------------- |
| Shared      | `crypto/device-secret.crypto.ts`                        | AES-256-GCM encrypt/decrypt |
| Shared      | `errors/authentication.error.ts`                        | 401 error class             |
| Shared      | `validation/custom-rules/power-status.rule.ts`          | LIVR rule for 0/1           |
| Application | `events/power-status-changed.event.ts`                  | Domain event class          |
| Application | `services/power-event/process-power-status.service.ts`  | Core business logic         |
| Application | `services/power-event/get-power-history.service.ts`     | Query power events          |
| API         | `guards/hmac-auth.guard.ts`                             | HMAC verification           |
| API         | `decorators/device-context.decorator.ts`                | @DeviceId() extractor       |
| API         | `controllers/device-status/device-status.controller.ts` | REST endpoint               |
| API         | `modules/device-status/device-status.module.ts`         | NestJS wiring               |

---

## Environment Variables (Phase 3)

```bash
# Generate with: openssl rand -hex 32
DEVICE_SECRET_ENCRYPTION_KEY=<64 hex characters>
```

**Security checklist:**

- [ ] Key is 64 hex chars (32 bytes)
- [ ] Key is NOT committed to git
- [ ] Key is different per environment (dev/prod)
- [ ] Key rotation plan exists
