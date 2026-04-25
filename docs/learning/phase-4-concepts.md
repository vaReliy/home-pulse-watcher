# Learning Guide - Phase 4 Concepts

## Concept 1: Telegraf + NestJS Integration

```typescript
// telegram.service.ts
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Optional()
    @Inject(TELEGRAM_TOKENS.BOT)
    private readonly bot: Telegraf<TelegramContext> | null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Telegram bot not configured');
      return;
    }
    this.setupCommands();
    await this.bot.launch(); // Start long polling
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }
}
```

**Why manual integration over nestjs-telegraf?**

| Approach          | Pros                              | Cons                          |
| ----------------- | --------------------------------- | ----------------------------- |
| Manual (Telegraf) | Full control, simpler DI, lighter | More boilerplate              |
| nestjs-telegraf   | Decorators, scenes support        | Extra dependency, opinionated |

**Long Polling vs Webhooks:**

```
Long Polling (Development):
  Bot ──poll──> Telegram ──updates──> Bot ──poll──> ...
  - Simple setup, no public URL needed
  - Higher latency, more requests

Webhooks (Production):
  Telegram ──POST /webhook──> Your Server
  - Lower latency, efficient
  - Requires HTTPS and public URL
```

**Configuration:**

```typescript
if (config.useWebhook && config.webhookDomain) {
  await this.bot.telegram.setWebhook(`${config.webhookDomain}/api/telegram/webhook`);
} else {
  await this.bot.launch(); // Long polling
}
```

---

## Concept 2: Custom Telegraf Context

```typescript
// types/telegram-context.type.ts
import type { Context } from 'telegraf';
import type { User } from '@home-pulse-watcher/core';

export interface TelegramContext extends Context {
  user?: User; // Populated by auth middleware
}
```

**Why extend Context?**

- Telegraf's `Context` has Telegram-specific data (from, chat, message)
- We add our domain `User` entity after authentication
- Type safety in handlers: `ctx.user?.telegramId`

**Usage in handlers:**

```typescript
async handle(ctx: TelegramContext): Promise<void> {
  const user = ctx.user; // Our domain User, not Telegram user
  if (!user) {
    await ctx.reply('Not registered');
    return;
  }
  // user.id, user.telegramId available
}
```

---

## Concept 3: Command Handler Pattern

```typescript
// handlers/status.handler.ts
@Injectable()
export class StatusHandler {
  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
    @Inject(REPOSITORY_TOKENS.USER_DEVICE)
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly messageFormatter: MessageFormatter,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const user = ctx.user!;
    const userDevices = await this.userDeviceRepository.findByUserId(user.id);
    // ... format and send response
  }
}
```

**Handler responsibilities:**

```
TelegramService (bot commands)
  └─> Handler (Telegram-specific logic)
       └─> Repository/Service (business logic)
            └─> Response formatting (MessageFormatter)
```

**Why separate handlers?**

- Single Responsibility: Each handler does one command
- Testable: Mock dependencies, test in isolation
- Reusable: Same repositories used across handlers

---

## Concept 4: Authentication Middleware Pattern

```typescript
// telegram.service.ts
private async withAuth(
  ctx: TelegramContext,
  handler: () => Promise<void>,
): Promise<void> {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    await ctx.reply(MESSAGES.ERROR_GENERIC);
    return;
  }

  // BigInt conversion for database lookup
  const user = await this.userRepository.findByTelegramId(BigInt(telegramId));

  if (!user) {
    await ctx.reply(MESSAGES.NOT_REGISTERED, { parse_mode: 'HTML' });
    return;
  }

  ctx.user = user; // Attach for handler use
  await handler();
}
```

**Command registration:**

```typescript
// Public (no auth)
this.bot.command('start', (ctx) => this.startHandler.handle(ctx));
this.bot.command('help', (ctx) => this.helpHandler.handle(ctx));

// Protected (requires auth)
this.bot.command('status', (ctx) => this.withAuth(ctx, () => this.statusHandler.handle(ctx)));
this.bot.command('devices', (ctx) => this.withAuth(ctx, () => this.devicesHandler.handle(ctx)));
```

**BigInt conversion flow:**

```
Telegram sends: ctx.from.id = 123456789 (number)
We convert:     BigInt(123456789) = 123456789n (bigint)
Database:       telegramId BIGINT column
Match!
```

---

## Concept 5: Event-Driven Notifications

```typescript
// listeners/power-status.listener.ts
@Injectable()
export class PowerStatusListener {
  @OnEvent(POWER_STATUS_CHANGED_EVENT)
  async handlePowerStatusChanged(event: PowerStatusChangedEvent): Promise<void> {
    // 1. Find subscribers
    const userDevices = await this.userDeviceRepository.findByDeviceId(event.deviceId);

    // 2. Format message
    const message = event.isPowerLost ? this.messageFormatter.formatPowerLost(label, event.timestamp) : this.messageFormatter.formatPowerRestored(label, event.timestamp, duration);

    // 3. Send to all subscribers
    await this.sendWithRateLimit(bot, message, recipients);
  }
}
```

**Event flow:**

```
ESP32 sends status
  └─> DeviceStatusController
       └─> ProcessPowerStatusService
            └─> eventEmitter.emit(POWER_STATUS_CHANGED_EVENT)
                 └─> PowerStatusListener.handlePowerStatusChanged()
                      └─> bot.telegram.sendMessage() to each user
```

**Decoupling benefits:**

- Service doesn't know about Telegram
- Multiple listeners can react to same event (logging, analytics, etc.)
- Async: API response not blocked by notifications

---

## Concept 6: Rate Limiting Pattern

```typescript
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

private async sendWithRateLimit(
  bot: Telegraf<TelegramContext>,
  message: string,
  recipients: Array<{ chatId: string; userId: string }>,
): Promise<void> {
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    // Send batch in parallel
    await Promise.allSettled(
      batch.map(({ chatId }) =>
        bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
      )
    );

    // Delay before next batch
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
}
```

**Why rate limiting?**

- Telegram API limit: ~30 messages/second
- Burst scenario: Power restored → 100 users notified
- Without rate limiting: 429 Too Many Requests errors

**Why `Promise.allSettled`?**

```typescript
// ❌ Promise.all: One failure stops everything
await Promise.all(promises); // If user #5 fails, #6-25 never sent

// ✅ Promise.allSettled: All attempts complete
await Promise.allSettled(promises); // User #5 fails, #6-25 still sent
```

---

## Concept 7: HTML Escaping for Telegram

```typescript
// formatters/message.formatter.ts
escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

formatDeviceStatus(device: Device, customName?: string | null): string {
  const rawLabel = customName ?? device.label ?? device.macAddress;
  const label = this.escapeHtml(rawLabel); // ← Always escape user data
  return MESSAGES.DEVICE_STATUS(label, status, lastSeen);
}
```

**Why escape?**

```html
<!-- User sets label: "Kitchen</b><script>" -->

Without escaping:
  <b>Kitchen</b><script></b>  ← Broken HTML!

With escaping:
  <b>Kitchen&lt;/b&gt;&lt;script&gt;</b>  ← Safe
```

**Characters to escape:**

| Character | Escaped | Reason        |
| --------- | ------- | ------------- |
| `&`       | `&amp;` | Entity prefix |
| `<`       | `&lt;`  | Tag start     |
| `>`       | `&gt;`  | Tag end       |

---

## Concept 8: Message Constants Pattern

```typescript
// constants/messages.constants.ts
export const MESSAGES = {
  // Static messages
  WELCOME: `<b>Welcome to HomePulse Watcher!</b>
Your account has been created.`,

  NOT_REGISTERED: `You are not registered. Use /start to create an account.`,

  // Dynamic messages (functions)
  DEVICE_STATUS: (label: string, status: 'ON' | 'OFF', lastSeen: string): string => `<b>${label}</b>: ${status === 'ON' ? '🟢' : '🔴'} ${status}\nLast seen: ${lastSeen}`,

  POWER_LOST: (label: string, time: string): string => `⚡️ <b>Power Lost</b>\n\nDevice: <b>${label}</b>\nTime: ${time}`,

  // Error messages
  ERROR_GENERIC: `Something went wrong. Please try again later.`,
  ERROR_DEVICE_NOT_OWNED: `You don't have permission to access this device.`,
} as const;
```

**i18n readiness:**

```typescript
// Future: Load from JSON based on user locale
const messages = await loadMessages(user.locale); // 'en', 'uk', etc.
return messages.WELCOME;
```

**Function templates vs string interpolation:**

```typescript
// ✅ Type-safe: Compiler checks arguments
MESSAGES.DEVICE_STATUS('Kitchen', 'ON', 'Jan 1');

// ❌ Error prone: Template literals with variables
`Device ${label} is ${status}`; // No type checking
```

---

## Concept 9: Optional Dependency Injection

```typescript
// telegram.module.ts
{
  provide: TELEGRAM_TOKENS.CONFIG,
  useFactory: (): TelegramConfig | null => {
    try {
      return validateTelegramConfig(); // Throws if no token
    } catch {
      logger.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN not set');
      return null;
    }
  },
},
{
  provide: TELEGRAM_TOKENS.BOT,
  useFactory: (config: TelegramConfig | null) => {
    if (!config) return null;
    return new Telegraf<TelegramContext>(config.botToken);
  },
  inject: [TELEGRAM_TOKENS.CONFIG],
},
```

**Using @Optional() decorator:**

```typescript
constructor(
  @Optional()
  @Inject(TELEGRAM_TOKENS.BOT)
  private readonly bot: Telegraf<TelegramContext> | null,
) {}

async onModuleInit(): Promise<void> {
  if (!this.bot) {
    // Graceful degradation: app works without bot
    return;
  }
  // Bot setup...
}
```

**Benefits:**

- App starts even without `TELEGRAM_BOT_TOKEN`
- Development without Telegram setup
- Conditional feature enablement

---

## Quick Reference: Phase 4 Files

| Layer | File                                 | Purpose                             |
| ----- | ------------------------------------ | ----------------------------------- |
| API   | `telegram.module.ts`                 | NestJS module wiring                |
| API   | `telegram.service.ts`                | Bot lifecycle, command registration |
| API   | `telegram.config.ts`                 | Environment validation              |
| API   | `telegram.tokens.ts`                 | DI tokens (BOT, CONFIG)             |
| API   | `types/telegram-context.type.ts`     | Extended Telegraf context           |
| API   | `handlers/start.handler.ts`          | `/start` - user registration        |
| API   | `handlers/status.handler.ts`         | `/status` - device status           |
| API   | `handlers/devices.handler.ts`        | `/devices` - device list            |
| API   | `handlers/help.handler.ts`           | `/help` - command list              |
| API   | `listeners/power-status.listener.ts` | Event-driven notifications          |
| API   | `formatters/message.formatter.ts`    | HTML formatting with escaping       |
| API   | `constants/messages.constants.ts`    | i18n-ready message templates        |

---

## Environment Variables (Phase 4)

```bash
# Required for Telegram bot
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# Optional: Admin notifications
TELEGRAM_ADMIN_CHAT_ID=123456789

# Production: Use webhooks instead of polling
TELEGRAM_USE_WEBHOOK=false
TELEGRAM_WEBHOOK_DOMAIN=https://your-domain.com
```

**Setup checklist:**

- [ ] Create bot via @BotFather on Telegram
- [ ] Copy token to `.env`
- [ ] Test `/start` command
- [ ] Link a device to user via CLI
- [ ] Test `/status` and `/devices` commands
- [ ] Trigger power event, verify notification arrives
