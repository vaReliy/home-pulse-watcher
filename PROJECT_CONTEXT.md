# HomePulse Watcher — Project Context

> **Purpose**: Shared Mental Model for AI assistants. Load this first in any new session.

---

## Project Vision & Status

**HomePulse Watcher** is a DIY, high-reliability IoT system that monitors household mains power and delivers instant Telegram alerts to users.

| Field             | Value                                         |
| ----------------- | --------------------------------------------- |
| Current phase     | **Phase 5 — Production Hardening**            |
| Active devices    | 2 (real users, live data)                     |
| Deployment        | Google Cloud Run + Neon.tech (PostgreSQL)     |
| Codebase maturity | MVP — no legacy concerns; DB can be recreated |
| Stack type        | Nx monorepo, NestJS, Prisma, ESP32 firmware   |

---

## Core Tech Stack

| Layer      | Technology                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo   | Nx 22.4 (`@home-pulse-watcher/*` prefix)                                                                                                         |
| Backend    | NestJS 11, TypeScript (NodeNext modules)                                                                                                         |
| ORM        | Prisma 7.3 + PostgreSQL (`pg` adapter)                                                                                                           |
| Validation | LIVR (custom rules: `macAddress`, `hmacFormat`)                                                                                                  |
| Bot        | Telegraf (manual NestJS integration)                                                                                                             |
| Testing    | Jest 30 + SWC compiler                                                                                                                           |
| CLI        | nest-commander                                                                                                                                   |
| Firmware   | PlatformIO + Arduino, ESP32-C3 and ESP32-C6; shared headers in `libs/firmware-shared/` (8 modules); Unity/Native tests via `pio test -e native`  |
| Bundler    | Webpack (all deps bundled; Prisma externals only)                                                                                                |
| AI Tooling | [vaReliy/claude-ts](https://github.com/vaReliy/claude-ts) — 18 agents, 23 skills, 9 rules via `.claude/`; Claude acts as orchestrator/dispatcher |

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
- All Prisma calls wrapped with `withPrismaError()` — raw Prisma errors never leak past repositories

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

| Mechanism         | Details                                                 |
| ----------------- | ------------------------------------------------------- |
| Transport auth    | HMAC-SHA256; payload = `MAC:TIMESTAMP:STATUS`           |
| Replay prevention | Timestamp tolerance: **±5 minutes**                     |
| Timing safety     | `crypto.timingSafeEqual()` on all signature comparisons |
| Secret storage    | AES-256-GCM; format on disk: `iv:authTag:ciphertext`    |
| Key size          | 32-byte encryption key (64 hex chars)                   |

### Power Sensing — 4-Layer Pipeline

Implemented Feb 19, 2026 to eliminate "Grid Flapping" (see [Historical Context](#historical-context)).

#### Layer 1 — ADC Hysteresis (Firmware)

| ADC Range | Voltage     | Decision                                 |
| --------- | ----------- | ---------------------------------------- |
| ≥ 2200    | ~1.75–2.5 V | **POWER ON**                             |
| 1001–2199 | ~0.8–1.75 V | **Hold current state** (hysteresis band) |
| ≤ 1000    | ~0–0.8 V    | **POWER OFF**                            |

- 16 samples averaged, 5 ms between samples (~80 ms per read)
- Hardware V2.1: 5V USB → 10 kΩ / 10 kΩ divider + 0.1 µF ceramic cap → GPIO2
- Voltage divider formula: V_out = V_in × R2/(R1+R2); target 2.2–3.0V (see [Admin Guide](docs/admin-guide.md#voltage-divider-formula) for non-standard adapters)
- Full power: 5V × 10/20 = 2.5V → ADC ~3100

#### Layer 2 — Firmware Confirmation Window (V3)

- 2 consecutive identical reads required before accepting a transition (~400 ms)
- Check interval: 200 ms (`CHECK_INTERVAL_MS`)
- No software spike tolerance — the 0.1 µF ceramic cap on the voltage divider filters high-frequency noise at the hardware level
- Confirmation time: ~400 ms (was ~1 s in V2.1)
- Logic extracted to `HomePulse::debounceTick()` in `libs/firmware-shared/include/HomePulse/debounce.h` (pure, host-testable)

#### Layer 3 — Firmware Cooldown & Heartbeat (V3.1)

- 2 s minimum between HTTP sends (`MIN_STATE_CHANGE_MS`)
- `lastPowerStatus` updated **immediately** on confirmation — never gated by HTTP success or cooldown
- Cooldown only suppresses HTTP sends, not internal state or LED updates
- **Heartbeat**: every 30 min (`HEARTBEAT_INTERVAL_MS`), firmware sends current status to backend — ensures eventual sync even if a state-change HTTP send was suppressed or failed

#### Layer 4 — Server-Side Debounce

- 5 s window (`MIN_DEBOUNCE_SECONDS` in `process-power-status.service.ts`)
- PowerEvent **always** written to DB; Telegram notification suppressed if within window
- Response includes `debounced: boolean` for firmware logging
- **Not debounced**: first event ever, heartbeats (same status), events ≥ 5 s apart

### Hardware Variants

Two hardware configurations are supported. Both use identical ADC sensing. UPS is a wiring option for either chip; the C6 config ships with it enabled.

| Variant              | Power Source                | Battery Backup     | Guide                                                    |
| -------------------- | --------------------------- | ------------------ | -------------------------------------------------------- |
| **Standard V2.1**    | USB adapter only            | No                 | [`docs/hardware/standard.md`](docs/hardware/standard.md) |
| **UPS Edition V2.3** | USB adapter + TP4056 shield | Yes (18650 Li-Ion) | [`docs/hardware/ups.md`](docs/hardware/ups.md)           |

**V2.3 Key Design**: Dual-diode OR-gate (1N4007 x 2). R1 of the voltage divider connects BEFORE Diode 1 (directly to adapter 5V). When mains drops, GPIO2 reads 0V instantly while ESP32 stays powered via battery through Diode 2. This "Isolated Sensor" design is what enables outage detection with battery backup.

#### Battery Monitoring (V2.3 UPS Edition)

- **GPIO3** with 100k/100k divider (calibrated) for battery voltage sensing (enabled via `HAS_UPS_MODULE true` in `config.h`)
- Voltage formula: `(long)adcAvg * BATTERY_CALIBRATED_SCALE / 4095` millivolts (`BATTERY_CALIBRATED_SCALE = 6953`)
- Calibrated from hardware measurement: 2.95V battery → 1.40V at GPIO3 → scale = 3300 × (2950/1400) = 6953
- SOS alert threshold: **3400 mV** (`BATTERY_VOLTAGE_LOW_MV`, `BATTERY_LOW_THRESHOLD_MV`)
- SOS cooldown: 15 min (`SOS_COOLDOWN_MS`) — firmware only sends SOS when power is OFF
- Backend emits `BATTERY_LOW_EVENT` when `batteryVoltage < 3400 && batteryVoltage > 0`
- `/status` shows battery line for UPS devices: `🔋 Battery: 3.85V (79%)`

#### Future Optimizations (TODO)

- **V2.4 (Priority UPS)**: Replace Diode 1 with Schottky (SS34) or P-MOSFET load-sharing for production

### Wi-Fi Provisioning (V3.4)

Credentials are stored in NVS (ESP32 non-volatile flash), not compiled in. No hardcoded secrets.

**First-boot / factory-reset flow:**

- Device starts as AP: `HomePulse-Setup-XXXX` (last 4 hex chars of MAC, open network)
- Captive portal at `http://192.168.4.1/` — user enters WiFi SSID/password, device secret, backend URL
- On save: credentials written to NVS → device reboots → connects as normal STA

**Development shortcut:** If `include/secrets.h` exists at compile time, its values are written to NVS on the first boot (when NVS is empty). Subsequent builds do not need `secrets.h`; credentials persist.

**Boot invariant — portal opens when:**

- NVS is empty AND `secrets.h` is absent (`!HAS_COMPILE_TIME_SECRETS`)
- NVS is empty AND `secrets.h` is present but any required field (`WIFI_SSID`, `DEVICE_SECRET`, `BACKEND_URL`) is an empty string — blank stubs are detected and skipped at write time, then `credentialsAreUsable()` catches the blank struct and opens the portal immediately
- Any required credential is missing after NVS load (partial write, NVS corruption)
- WiFi fails to connect for 5 minutes (stale SSID/password; field-recoverable without USB)
- Factory reset (BOOT button 10 s) → wipe NVS → reboot → portal via empty-credentials path

**WiFi retry (transient failures):**

- If credentials exist but WiFi is unreachable (router down, ISP issue), the device retries every 5 s for 5 minutes
- After 5 minutes, opens captive portal for re-provisioning (instead of rebooting into the same loop)

**Factory reset:**

- Hold BOOT button (GPIO9) for 10 s
- LED: orange blink with accelerating frequency → solid purple (1 s) = confirmed
- Action: wipe NVS + reboot into captive portal

### Telegram Bot

- **Interaction model**: Button-driven via Reply Keyboard (Status, Devices, Settings, Help); `/start` is the only slash command (user registration)
- **Inline Buttons**: Notifications include "Check Status" and "View History" action buttons
- **Settings**: Stateless inline keyboard menu for locale and timezone selection
- **Parse mode**: MarkdownV2 for all bot messages (utility: `escape-markdown.ts`)
- i18n: default locale `uk` (Ukrainian), default timezone `Europe/Kyiv`; per-user overrides stored in DB
- Rate limiting: 25 messages/batch, 1 s delay between batches
- All user-facing strings go through `TranslationService` — no hardcoded display text
- Bot is optional: app degrades gracefully if `TELEGRAM_BOT_TOKEN` is absent

---

## Technical Standards

### Structured Logging (Pino)

- **Library**: `nestjs-pino` + `pino-http`
- **Production** (`NODE_ENV=production`): JSON output with `messageKey: 'message'` and severity mapping for Google Cloud Logging (`INFO`, `WARNING`, `ERROR`, `CRITICAL`)
- **Development**: `pino-pretty` transport with colorized, single-line output
- **Bootstrap buffering**: `NestFactory.create(AppModule, { bufferLogs: true })` + `app.useLogger(app.get(Logger))` — ensures all startup logs go through Pino
- **Pre-bootstrap logging**: `validateEnv()` runs before NestJS — uses `console.error()` directly since neither NestJS Logger nor Pino are available

### Mandatory Env Validation

- **Timing**: Runs before `NestFactory.create()` in `main.ts`
- **Failure mode**: Logs `[EnvValidation] CRITICAL: ...` via `console.error` and calls `process.exit(1)`
- **Required vars**: `DATABASE_URL`, `DEVICE_SECRET_ENCRYPTION_KEY` (64 hex chars)

### Health Check Endpoints

| Route               | Method | Success (200)                           | Failure (503)                                 |
| ------------------- | ------ | --------------------------------------- | --------------------------------------------- |
| `/api/health/live`  | GET    | `{ "status": "ok" }`                    | N/A (always 200)                              |
| `/api/health/ready` | GET    | `{ "status": "ok", "db": "connected" }` | `{ "status": "error", "db": "disconnected" }` |

- **Liveness**: Confirms the process is running (no dependency checks)
- **Readiness**: Verifies database connectivity via `SELECT 1`; returns 503 if the DB is unreachable

---

## Documentation Map

| Document         | Path                                                                       | Purpose                                               |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| README           | [`README.md`](README.md)                                                   | Quick start, feature overview                         |
| AI Workflow      | [`CLAUDE.md`](CLAUDE.md)                                                   | Agent dispatch rules, pipelines, and coding standards |
| Architecture     | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                             | Layer diagrams, DI patterns, Webpack config           |
| Power Sensing v2 | [`docs/technical/power-sensing-v2.md`](docs/technical/power-sensing-v2.md) | Full 4-layer pipeline spec with ADC values            |
| Admin Guide      | [`docs/admin-guide.md`](docs/admin-guide.md)                               | Device provisioning, hardware wiring, troubleshooting |
| CLI Reference    | [`docs/cli-reference.md`](docs/cli-reference.md)                           | All nest-commander commands with flags and exit codes |
| Flashing Guide   | [`firmware/docs/FLASHING_GUIDE.md`](firmware/docs/FLASHING_GUIDE.md)       | PlatformIO build, upload, serial monitor              |
| Firmware Testing | [`firmware/docs/TESTING.md`](firmware/docs/TESTING.md)                     | Unity/native test setup and adding new test suites    |
| HW: Standard     | [`docs/hardware/standard.md`](docs/hardware/standard.md)                   | V2.1 wiring, voltage divider, ADC calibration         |
| HW: UPS Edition  | [`docs/hardware/ups.md`](docs/hardware/ups.md)                             | V2.3 battery backup, OR-gate, isolated sensor         |

---

## Historical Context

### The Evening Flapping Incident (Feb 2026)

**What happened**: Devices were emitting rapid, alternating POWER_ON / POWER_OFF events during brownout conditions and noisy mains transitions (particularly in evenings with high grid load). Users received notification spam and event history became unreliable.

**Root cause**: The original digital-GPIO sensing (single HIGH/LOW read, no debounce) could not distinguish a real outage from a voltage wobble on the divider output.

**Solution** (commit `5f133ef`, Feb 19, 2026): The 4-layer pipeline described above — ADC hysteresis band eliminates noise in the middle range; confirmation window requires sustained state change; firmware cooldown prevents re-triggering; server debounce is last-resort protection.

**Hardware V2.1 resolution**: The 10k/10k divider + 0.1 µF ceramic cap is the definitive hardware fix. The capacitor filters high-frequency noise at the source, eliminating the need for software spike tolerance. Firmware V3 removed `CONFIRMATION_MAX_NOISE` and reduced confirmation reads to 2 (from 10) as a result.

**Do not regress**:

- Never replace ADC-based sensing with a simple `digitalRead()` on GPIO2
- Never remove the hysteresis band (the 1001–2199 range must hold state, not toggle)
- Never remove the 0.1 µF ceramic cap from the voltage divider — it is the primary noise filter
- Never gate `lastPowerStatus` updates on HTTP send success — state must track hardware
- Server debounce is independent of firmware — both layers must remain active
- Keep debounce windows short (single-digit seconds) — Hardware V2.1 (0.1 µF cap) is the primary noise filter; firmware/server should stay lean and responsive
- Never move R1 connection point to after Diode 1 in V2.3 — sensor must read adapter voltage directly, isolated from battery power path
- OR-gate diodes must prevent battery backfeed into the sensing circuit

### Neon Cold Start / Cloud Run Startup Failure (Apr 2026)

**What happened**: Cloud Run revisions started failing with `exit(1)` and `P1001: Can't reach database server` during `prisma migrate deploy`. The app never reached the listen phase.

**Root cause**: Neon free tier suspends compute after ~5 minutes of inactivity (verified: free CPU quota exhausted in March, ~3 weeks of no traffic before the failed deploy on 01.04). The entrypoint had `set -e` and a single unarmed `prisma migrate deploy` call — first connection attempt failed before Neon woke up, killing the container.

**Fix**: `docker-entrypoint.sh` now retries `prisma migrate deploy` up to 5 times with exponential backoff (3 s, 6 s, 12 s, 24 s, 48 s). Total max wait ~93 s, well under Cloud Run's 300 s startup timeout.

**Do not regress**: Never remove retry logic from the entrypoint — Neon free tier cold starts are expected behavior with low-traffic deployments.

---

## Firmware Version Tracking

- Current firmware version: **3.5.0** (both ESP32-C3 and ESP32-C6)
- Defined in `FIRMWARE_VERSION` constant in each `config.h`
- Devices report `firmwareVersion` in the JSON body of every status ping
- Devices with `HAS_UPS_MODULE true` also report `batteryVoltage` in the JSON body
- Backend stores it in `Device.firmwareVersion` (nullable `String?` in Prisma)
- Older firmware without the field is handled gracefully (field remains `null`)

**Firmware hosting** (future Phase 5.6 OTA): Firmware binaries will be stored on Google Cloud Storage (Always Free tier). Release metadata (version, sha256, channel, board type) tracked in a Prisma `Release` model. See `docs/adr/0001-ota-update-architecture.md`.
