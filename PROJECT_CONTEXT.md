# HomePulse Watcher — Project Context

> **Purpose**: Shared Mental Model for AI assistants. Load this first in any new session.

---

## Project Vision & Status

**HomePulse Watcher** is a DIY, high-reliability IoT system that monitors household mains power and delivers instant Telegram alerts to users.

| Field | Value |
|---|---|
| Current phase | **Phase 5 — Production Hardening** |
| Active devices | 2 (real users, live data) |
| Deployment | Google Cloud Run + Neon.tech (PostgreSQL) |
| Codebase maturity | MVP — no legacy concerns; DB can be recreated |
| Stack type | Nx monorepo, NestJS, Prisma, ESP32 firmware |

---

## Core Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Nx 22.4 (`@home-pulse-watcher/*` prefix) |
| Backend | NestJS 11, TypeScript (NodeNext modules) |
| ORM | Prisma 7.3 + PostgreSQL (`pg` adapter) |
| Validation | LIVR (custom rules: `macAddress`, `hmacFormat`) |
| Bot | Telegraf (manual NestJS integration) |
| Testing | Jest 30 + SWC compiler |
| CLI | nest-commander |
| Firmware | PlatformIO + Arduino, ESP32-C3 and ESP32-C6 |
| Bundler | Webpack (all deps bundled; Prisma externals only) |

---

## Architecture

### Onion Architecture (Strict Layering)

```
┌──────────────────────────────────────────────┐
│ Interface (NestJS: controllers, modules, DI) │
├──────────────────────────────────────────────┤
│ Infrastructure (Prisma repos, mappers)       │
├──────────────────────────────────────────────┤
│ Application (Chista services, use cases)     │
├──────────────────────────────────────────────┤
│ Core (entities, interfaces, enums)           │  ← framework-agnostic
└──────────────────────────────────────────────┘
```

**Rules that must never break:**
- Core has zero framework imports
- Application services are plain TypeScript classes (no `@Injectable()`)
- NestJS DI wiring lives only in the Interface layer, via Symbol tokens and factory providers
- Config injected via `ServiceContext`, never via `process.env` directly (testability)

### Chista Service Pattern

One service = one business action. All services extend `BaseService<Input, Output>`:

```typescript
class MyService extends BaseService<MyInput, MyOutput> {
  protected validationRules(): LivrRules { ... }
  protected async execute(params, context): Promise<MyOutput> { ... }
}
```

### Critical Runtime Decision

`ProcessPowerStatusService` uses **`emitAsync()`** (not `emit()`). On Cloud Run, CPU is throttled between requests — `emit()` would abandon in-flight notifications before they complete. `emitAsync()` ensures notifications finish before the HTTP response is sent.

---

## Key Domain Rules

### Security

| Mechanism | Details |
|---|---|
| Transport auth | HMAC-SHA256; payload = `MAC:TIMESTAMP:STATUS` |
| Replay prevention | Timestamp tolerance: **±5 minutes** |
| Timing safety | `crypto.timingSafeEqual()` on all signature comparisons |
| Secret storage | AES-256-GCM; format on disk: `iv:authTag:ciphertext` |
| Key size | 32-byte encryption key (64 hex chars) |

### Power Sensing — 4-Layer Pipeline

Implemented Feb 19, 2026 to eliminate "Grid Flapping" (see [Historical Context](#historical-context)).

#### Layer 1 — ADC Hysteresis (Firmware)

| ADC Range | Voltage | Decision |
|---|---|---|
| ≥ 2400 | ~1.9–3.3 V | **POWER ON** |
| 801–2399 | ~0.65–1.9 V | **Hold current state** (hysteresis band) |
| ≤ 800 | ~0–0.65 V | **POWER OFF** |

- 16 samples averaged, 5 ms between samples (~80 ms per read)
- Hardware: 5V USB → 10 kΩ / 20 kΩ divider → GPIO2

#### Layer 2 — Firmware Confirmation Window

- 6 consecutive identical reads required before accepting a transition (~3 s)
- Check interval: 500 ms (`CHECK_INTERVAL_MS`)
- Prevents acceptance of momentary glitches

#### Layer 3 — Firmware Cooldown

- 30 s minimum between accepted state changes (`MIN_STATE_CHANGE_MS`)
- `lastPowerStatus` only updated on **successful HTTP send** (retry safety)

#### Layer 4 — Server-Side Debounce

- 30 s window (`MIN_DEBOUNCE_SECONDS` in `process-power-status.service.ts`)
- PowerEvent **always** written to DB; Telegram notification suppressed if within window
- Response includes `debounced: boolean` for firmware logging
- **Not debounced**: first event ever, heartbeats (same status), events ≥ 30 s apart

### Telegram Bot

- i18n: default locale `uk` (Ukrainian), default timezone `Europe/Kyiv`; per-user overrides stored in DB
- Rate limiting: 25 messages/batch, 1 s delay between batches
- All user-facing strings go through `TranslationService` — no hardcoded display text
- Bot is optional: app degrades gracefully if `TELEGRAM_BOT_TOKEN` is absent

---

## Documentation Map

| Document | Path | Purpose |
|---|---|---|
| README | [`README.md`](README.md) | Quick start, feature overview |
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layer diagrams, DI patterns, Webpack config |
| Power Sensing v2 | [`docs/technical/power-sensing-v2.md`](docs/technical/power-sensing-v2.md) | Full 4-layer pipeline spec with ADC values |
| Admin Guide | [`docs/admin-guide.md`](docs/admin-guide.md) | Device provisioning, hardware wiring, troubleshooting |
| CLI Reference | [`docs/cli-reference.md`](docs/cli-reference.md) | All nest-commander commands with flags and exit codes |
| Flashing Guide | [`firmware/docs/FLASHING_GUIDE.md`](firmware/docs/FLASHING_GUIDE.md) | PlatformIO build, upload, serial monitor |

---

## Historical Context

### The Evening Flapping Incident (Feb 2026)

**What happened**: Devices were emitting rapid, alternating POWER_ON / POWER_OFF events during brownout conditions and noisy mains transitions (particularly in evenings with high grid load). Users received notification spam and event history became unreliable.

**Root cause**: The original digital-GPIO sensing (single HIGH/LOW read, no debounce) could not distinguish a real outage from a voltage wobble on the divider output.

**Solution** (commit `5f133ef`, Feb 19, 2026): The 4-layer pipeline described above — ADC hysteresis band eliminates noise in the middle range; confirmation window requires sustained state change; firmware cooldown prevents re-triggering; server debounce is last-resort protection.

**Do not regress**:
- Never replace ADC-based sensing with a simple `digitalRead()` on GPIO2
- Never remove the hysteresis band (the 801–2399 range must hold state, not toggle)
- Never reduce `CONFIRMATION_CHECKS` below 6 without re-validating on real hardware
- Server debounce is independent of firmware — both layers must remain active
