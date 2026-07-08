# HomePulse Watcher — Project Context

> **Purpose**: Shared Mental Model for AI assistants. Load this first in any new session.

---

## Project Vision & Status

**HomePulse Watcher** is a DIY, high-reliability IoT system that monitors household mains power and delivers instant Telegram alerts to users.

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Current phase     | **Phase 5 — Production Hardening** (5.6 in progress) |
| Active devices    | 2 (real users, live data)                            |
| Deployment        | Google Cloud Run + Neon.tech (PostgreSQL)            |
| Codebase maturity | MVP — no legacy concerns; DB can be recreated        |
| Stack type        | Nx monorepo, NestJS, Prisma, ESP32 firmware          |

---

## Core Tech Stack

| Layer      | Technology                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo   | Nx 22.4 (`@home-pulse-watcher/*` prefix)                                                                                                                                                                                        |
| Backend    | NestJS 11, TypeScript (NodeNext modules)                                                                                                                                                                                        |
| ORM        | Prisma 7.3 + PostgreSQL (`pg` adapter)                                                                                                                                                                                          |
| Validation | LIVR (custom rules: `macAddress`, `hmacFormat`)                                                                                                                                                                                 |
| Bot        | Telegraf (manual NestJS integration)                                                                                                                                                                                            |
| Testing    | Jest 30 + SWC compiler                                                                                                                                                                                                          |
| CLI        | nest-commander                                                                                                                                                                                                                  |
| Firmware   | PlatformIO + Arduino, ESP32-C3 and ESP32-C6; shared sketch at `firmware/common/main.cpp` (both envs via `build_src_filter`); shared headers in `libs/firmware-shared/` (8 modules); Unity/Native tests via `pio test -e native` |
| Bundler    | Webpack (all deps bundled; Prisma + pino + `@google-cloud/storage` kept external)                                                                                                                                               |
| AI Tooling | [vaReliy/claude-ts](https://github.com/vaReliy/claude-ts) — 18 agents, 23 skills, 9 rules via `.claude/`; Claude acts as orchestrator/dispatcher                                                                                |

**GitHub PR access (AI sessions):** `gh` CLI is not authenticated and GitHub MCP is not configured. Use `WebFetch` against the public GitHub REST API instead:

- PR metadata: `https://api.github.com/repos/vaReliy/home-pulse-watcher/pulls/<N>`
- Changed files + diffs: `https://api.github.com/repos/vaReliy/home-pulse-watcher/pulls/<N>/files`
- Review comments: `https://api.github.com/repos/vaReliy/home-pulse-watcher/pulls/<N>/comments`
- Reviews (top-level): `https://api.github.com/repos/vaReliy/home-pulse-watcher/pulls/<N>/reviews`

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

- **GPIO3** with 100k/100k divider for battery voltage sensing — **enabled at runtime** via NVS flag `hasUps` (set during captive-portal provisioning, checkbox labeled "Has UPS")
- Uses `analogReadMilliVolts()` (factory-calibrated ADC) × divider ratio via `HomePulse::calculateBatteryMv(mvAvg, NUM, DEN)`
  - ESP32-C6: `BATTERY_DIVIDER_RATIO_NUM=1993`, `BATTERY_DIVIDER_RATIO_DEN=1000` (empirically calibrated from 4 measurements)
  - ESP32-C3: `BATTERY_DIVIDER_RATIO_NUM=2000`, `BATTERY_DIVIDER_RATIO_DEN=1000` (nominal 100k/100k)
- SOS alert threshold: **3400 mV** (`BATTERY_VOLTAGE_LOW_MV`, `BATTERY_LOW_THRESHOLD_MV`)
- SOS cooldown: 15 min (`SOS_COOLDOWN_MS`) — firmware only sends SOS when power is OFF
- Backend emits `BATTERY_LOW_EVENT` when `batteryVoltage < 3400 && batteryVoltage > 0`
- `/status` shows battery line for UPS devices: `🔋 Battery: 3.85V (79%)`
- **No rebuild needed to switch hardware**: Single compiled binary per board (C3/C6) works for both Standard and UPS variants — the distinction is a captive-portal provisioning step

#### Future Optimizations (TODO)

- **V2.4 (Priority UPS)**: Replace Diode 1 with Schottky (SS34) or P-MOSFET load-sharing for production

### Wi-Fi Provisioning (V3.4)

Credentials are stored in NVS (ESP32 non-volatile flash), not compiled in. No hardcoded secrets.

**First-boot / factory-reset flow:**

- Device starts as AP: `HomePulse-Setup-XXXX` (last 4 hex chars of MAC, open network)
- Captive portal at `http://192.168.4.1/` — user enters WiFi SSID/password, device secret, backend URL
- On save: credentials written to NVS → device reboots → connects as normal STA

**Portal UX (re-provisioning):**

- `GET /config` returns `{"ssid":"...","url":"...","hasSecret":true|false}` — SSID and URL pre-fill the form; secret presence is advertised but the secret value is never sent to the browser.
- Network list (`GET /scan`) shows SSID names only, sorted by signal strength, de-duplicated.
- Submitting blank secret keeps the existing NVS secret (rotation: type a new value to overwrite). Same fallback applies to URL.

**Development shortcut:** If `include/secrets.h` exists at compile time, its non-empty fields are written to NVS on the first boot (per-field via `applyCompileTimeSecrets()`). Leaving `WIFI_SSID` blank while setting `DEVICE_SECRET` + `BACKEND_URL` is valid: the captive portal autofills those two and the user only needs to enter WiFi creds. Fully empty stubs are ignored. Subsequent builds do not need `secrets.h`; credentials persist.

**`GET /config` diagnostic:** Handler logs `ssid=<len> url=<len> hasSecret=<0|1>` to serial — use this to confirm NVS state without exposing secret values.

**Boot invariant — portal opens when:**

- NVS is empty AND `secrets.h` is absent (`!HAS_COMPILE_TIME_SECRETS`)
- NVS is empty AND `secrets.h` is present but fully empty — blank stubs produce no NVS write; `credentialsAreUsable()` then catches the blank struct and opens the portal immediately
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

### Adding a New Webpack External Dependency

When a new npm package must NOT be bundled (native binaries, worker threads, dynamic requires, GCS-style GCP SDKs), three files must be updated together or the Cloud Run build will fail:

1. **`apps/api/webpack.config.js`** — add the package name to `EXTERNAL_PACKAGES`. Webpack emits a bare `require()` instead of bundling.
2. **`apps/api/src/assets/package.json`** — add the package + version to `dependencies`. This minimal file is copied to `dist/` and is what the production Docker stage runs `npm install` against.
3. **Root `package.json`** — only if the package is a direct declared dep (most infra SDKs are NOT needed here; they only need to be in `assets/package.json` for runtime). Do **not** add purely runtime infra deps to root.

> **Phase 5.6 lesson**: `@google-cloud/storage` was added to source but omitted from all three files, causing Cloud Run builds to fail silently (`Build failed; check build logs for details`). The fix: add to `webpack.config.js` `EXTERNAL_PACKAGES` + `assets/package.json` only (root `package.json` not needed).

### Structured Logging (Pino)

- **Library**: `nestjs-pino` + `pino-http`
- **Production** (`NODE_ENV=production`): JSON output with `messageKey: 'message'` and severity mapping for Google Cloud Logging (`INFO`, `WARNING`, `ERROR`, `CRITICAL`)
- **Development**: `pino-pretty` transport with colorized, single-line output
- **Bootstrap buffering**: `NestFactory.create(AppModule, { bufferLogs: true })` + `app.useLogger(app.get(Logger))` — ensures all startup logs go through Pino
- **Pre-bootstrap logging**: `validateEnv()` runs before NestJS — uses `console.error()` directly since neither NestJS Logger nor Pino are available

### Mandatory Env Validation

- **Timing**: Runs before `NestFactory.create()` in `main.ts`
- **Failure mode**: Logs `[EnvValidation] CRITICAL: ...` via `console.error` and calls `process.exit(1)`
- **Required vars**: `DATABASE_URL`, `DEVICE_SECRET_ENCRYPTION_KEY` (64 hex chars), `GCS_BUCKET_NAME`
- **Optional validated var**: `GCP_SERVICE_ACCOUNT_KEY` — if set, JSON is parsed and `private_key` PEM format is verified at startup (catches `\n` escape issues before first OTA request)

### Health Check Endpoints

| Route               | Method | Success (200)                           | Failure (503)                                 |
| ------------------- | ------ | --------------------------------------- | --------------------------------------------- |
| `/api/health/live`  | GET    | `{ "status": "ok" }`                    | N/A (always 200)                              |
| `/api/health/ready` | GET    | `{ "status": "ok", "db": "connected" }` | `{ "status": "error", "db": "disconnected" }` |

- **Liveness**: Confirms the process is running (no dependency checks)
- **Readiness**: Verifies database connectivity via `SELECT 1`; returns 503 if the DB is unreachable

---

## Documentation Map

| Document           | Path                                                                               | Purpose                                                       |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| README             | [`README.md`](README.md)                                                           | Quick start, feature overview                                 |
| AI Workflow        | [`CLAUDE.md`](CLAUDE.md)                                                           | Agent dispatch rules, pipelines, and coding standards         |
| Architecture       | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                     | Layer diagrams, DI patterns, Webpack config                   |
| Power Sensing v2   | [`docs/technical/power-sensing-v2.md`](docs/technical/power-sensing-v2.md)         | Full 4-layer pipeline spec with ADC values                    |
| Admin Guide        | [`docs/admin-guide.md`](docs/admin-guide.md)                                       | Device provisioning, hardware wiring, troubleshooting         |
| CLI Reference      | [`docs/cli-reference.md`](docs/cli-reference.md)                                   | All nest-commander commands with flags and exit codes         |
| Flashing Guide     | [`firmware/docs/FLASHING_GUIDE.md`](firmware/docs/FLASHING_GUIDE.md)               | PlatformIO build, upload, serial monitor                      |
| Firmware Testing   | [`firmware/docs/TESTING.md`](firmware/docs/TESTING.md)                             | Unity/native test setup and adding new test suites            |
| OTA Release Insert | [`docs/firmware-release-manual-insert.md`](docs/firmware-release-manual-insert.md) | Manual SQL guide for inserting `FirmwareRelease` rows into DB |
| HW: Standard       | [`docs/hardware/standard.md`](docs/hardware/standard.md)                           | V2.1 wiring, voltage divider, ADC calibration                 |
| HW: UPS Edition    | [`docs/hardware/ups.md`](docs/hardware/ups.md)                                     | V2.3 battery backup, OR-gate, isolated sensor                 |

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

- **Current firmware version**: See `FIRMWARE_VERSION` constant in `firmware/esp32c3/src/config.h` and `firmware/esp32c6/src/config.h` (both versions may differ)
- Devices report `firmwareVersion` in the JSON body of every status ping
- **Battery voltage reporting**: Devices with the "Has UPS" flag enabled (set via captive-portal checkbox, stored as NVS `hasUps`) also report `batteryVoltage` in the JSON body
- Backend stores it in `Device.firmwareVersion` (nullable `String?` in Prisma)
- Older firmware without the field is handled gracefully (field remains `null`)

### OTA Release Metadata (Phase 5.6)

**Prisma Model: `FirmwareRelease`**

| Field        | Type      | Purpose                                                             |
| ------------ | --------- | ------------------------------------------------------------------- |
| `id`         | String    | Primary key (UUID)                                                  |
| `version`    | String    | Semantic version (e.g., "3.5.0")                                    |
| `boardType`  | BoardType | Target hardware: `ESP32_C3` or `ESP32_C6`                           |
| `channel`    | Channel   | Release stability: `ALPHA`, `BETA`, or `STABLE`                     |
| `checksum`   | String    | SHA256 hex digest of the binary                                     |
| `gcsPath`    | String    | Cloud Storage path (e.g., `firmware/esp32c3/3.5.0/firmware.bin`)    |
| `isCritical` | Boolean   | Marks security/stability-critical releases requiring forced upgrade |
| `createdAt`  | DateTime  | Metadata creation timestamp                                         |

**TypeScript Enums (libs/core)**

- `BoardType`: `ESP32_C3 = 'esp32c3'`, `ESP32_C6 = 'esp32c6'`
- `ReleaseChannel`: `ALPHA`, `BETA`, `STABLE`

**Infrastructure**

- `IFirmwareReleaseRepository` interface in Core layer
- `PrismaFirmwareReleaseRepository` implementation in Infrastructure (with `withPrismaError()` wrapper)
- `FirmwareReleaseMapper` for Prisma ↔ Entity conversions

**Cloud Storage**

- Bucket: `home-pulse-ota-releases` (Always Free tier)
- Binary upload and release registration: use `firmware:upload` CLI command (see Admin CLI section below)

**Storage Layer (Task 2, Complete)**

- `IFirmwareStorageService` interface (core port) + `GcsService` adapter (infrastructure) wired via NestJS DI
- Methods: `uploadBuffer`, `getSignedUrl`, `deleteObject` (used for best-effort cleanup on DB failure)
- Authentication: `GCP_SERVICE_ACCOUNT_KEY` env var (JSON) or application default credentials fallback (Cloud Run Workload Identity)
- Bucket: `GCS_BUCKET_NAME` env var (optional — omit to disable OTA via `NullFirmwareStorageService` fallback)
- Binary upload: buffer-based with `ifGenerationMatch: 0` (prevents silent overwrites — GCS 412 = already exists)
- Signed URLs: V4 format, 15-minute TTL
- Error translation: GCS 404 → `NotFoundError`, 403 → permission denied, etc.

**Admin CLI: Upload & List Commands**

- **`UploadFirmwareService` (extracted UseCase)**: `libs/application/src/lib/services/ota/upload-firmware.service.ts` — reusable firmware upload entry point consumed by both CLI command and new HTTP admin route. Handles file reading, checksum computation, GCS upload with idempotency guard (`ifGenerationMatch: 0`), DB record creation, best-effort GCS cleanup on failure.
- **`firmware:upload` command**: `apps/api/src/cli/firmware/upload-firmware.command.ts` — thin adapter calling `UploadFirmwareService`. Syntax: `node apps/api/dist/cli.js firmware:upload --file <bin> --version <semver> --board <board> --channel <channel> [--critical]`. Interactive prompts via `InquirerService` for version/board/channel when flags omitted. GCS path convention: `firmware/<board>/<version>/<filename>`. Default binary search path: `./tmp/firmware/` (when `--file` is a bare basename).
- **`firmware:list` command** (new): `node apps/api/dist/cli.js firmware:list` — shows current live releases per board/channel, helping admin avoid accidental downgrades/duplicates.
- **`CliModule` imports `StorageModule` directly** — `ServicesModule` does not re-export the storage token, so direct import is required

**Docker Admin Profile (Task 5, Complete)**

- `Dockerfile.admin` at repo root — multi-stage: `google/cloud-sdk:alpine` → `node:22-alpine`; copies pre-built `apps/api/dist/`, `prisma/`, and `prisma.config.ts`; runs `npx prisma generate`; runs as `USER node` (non-root)
- docker-compose `admin` profile: `docker compose --profile admin run --rm admin <command>`
  - Mounts `~/.config/gcloud:/home/node/.config/gcloud:ro` for ADC (Application Default Credentials)
  - Mounts `./tmp/firmware:/firmware:ro` so `--file /firmware/<name>.bin` works without absolute host paths
  - `env_file: .env` — leave `GCP_SERVICE_ACCOUNT_KEY` empty; ADC from mounted gcloud config takes precedence
  - `depends_on: postgres: condition: service_healthy`
- **One-time host setup**: `gcloud auth application-default login` + `npx nx build api` + `docker compose --profile admin build admin`
- `prisma.config.ts` must be copied into the admin image (Prisma 7.x reads DB URL from config, not schema)

**Device Model Fields (Fleet Autonomy)**

- `releaseChannel`: String (default `"STABLE"`) — server-controlled firmware tier; device never forces downgrade via request tampering. Typed as `as const` object in `libs/core`.
- `deviceType`: String (`"UPS"` | `"MAINS"`, default `"MAINS"`) — backend-side hardware category, write-once at provisioning via CLI (`--device-type` flag) or captive portal. For tracking and potential future per-device logic. **Firmware-side equivalent:** NVS flag `hasUps` (set via captive-portal checkbox) — both should be kept in sync during provisioning, but the firmware uses `hasUps` for all battery-monitoring decisions.
- `otaForceCheckRequested`: Boolean (default `false`) — sticky flag set by admin CLI (`device:request-ota-check --mac <mac>`), cleared after being served once in the status response.

**OTA Discovery API & Force-check Mechanism**

- `POST /api/ota/check` endpoint — HMAC-SHA256 authenticated, device queries latest release for its board type + channel
  - Channel waterfall: `STABLE` → `[STABLE]`, `BETA` → `[BETA, STABLE]`, `ALPHA` → `[ALPHA, BETA, STABLE]`
  - Semantic version comparison (returns only releases > current device version)
  - Response: `{ "hasUpdate": boolean, "release": { "version", "checksum", "downloadUrl" } | null }`
  - Guard decorator: `@HmacCanonical()` pluggable (supports both deviceId/MAC canonicalization)
- **`POST /api/device/status` response** (heartbeat) — now includes optional `forceOtaCheck: true` field (omitted when false). When present, firmware resets its OTA-check timer (`lastOtaCheckTime`) to trigger `checkForUpdate()` immediately on the next loop iteration instead of waiting up to 6h (`OTA_CHECK_INTERVAL_MS`, `config.h:120`). Consumed and cleared atomically server-side by `ProcessPowerStatusService` (after response is sent, the flag is reset to false for the next heartbeat).

**Firmware OTA Client (Task 4, Complete + Hardened)**

- `HomePulse::Ota::checkForUpdate()` — HMAC-signed POST to `/api/ota/check`, 5-field canonical (`MAC:TS:boardType:version:channel`); logs HTTP code, body preview, and `CheckResult` to serial
- `HomePulse::Ota::applyUpdate()` — HTTPS download via `HTTPClient` + `Update` (direct stream, not `httpUpdate.h`); `client.setTimeout(60)`, `HTTPC_FORCE_FOLLOW_REDIRECTS`; SHA-256 post-flash verify via `esp_partition_get_sha256`
- **Rollback grace period**: `markCurrentAppValid()` fires only after **≥ 3 heartbeats AND ≥ 5 minutes uptime** (`OTA_VALIDATION_MIN_HEARTBEATS`, `OTA_VALIDATION_MIN_UPTIME_MS`). Controlled by pure predicate `shouldMarkAppValid()` (natively tested). Bootloader auto-reverts if validation never completes.
- **Partial-flash abort**: `Update.abort()` on stream stall, short read, write error. SHA mismatch after `Update.end()` calls `esp_ota_set_boot_partition(running)` to revert next-boot selection. All abort events tagged `[OTA][ABORT]` in serial logs.
- Boot-time check (after WiFi+NTP, before watchdog fires) + periodic check every 6 h in `loop()`; all `CheckResult` branches explicitly logged
- Shared source: both envs use `firmware/common/main.cpp` — OTA logic lives once
- `BACKEND_URL` in NVS/`secrets.h` is the base origin only (`https://your-server.com`); firmware appends `/api/device/status` and `/api/ota/check` at call sites
- OTA confirmed working end-to-end on real ESP32-C6 hardware (v3.5.2 auto-flashed)

**Firmware shared-library boundary:** `libs/firmware-shared` must not include board-specific headers (`config.h`). LED helpers in `ota.cpp` are now suppressed (`(void)statusLed`) to preserve this boundary. The shared sketch (`firmware/common/main.cpp`) consumes `config.h` from each env's `src/` via the implicit `src_dir` include path — zero `#ifdef` in the shared source.

**OTA Security Boundaries (Post-Audit)**

- **`Device.releaseChannel` controls firmware tier** — Prisma schema: `releaseChannel String @default("STABLE")` with CHECK constraint (enforced via raw SQL CHECK in migration, not `@db.Char(6)`). Backend **never** uses the request body `channel` field for security decisions. The field is included only in the HMAC canonical string for backward compat with V3.x firmware that transmits it; `CheckOtaUpdateService` always reads `device.releaseChannel` from DB. Prevents device downgrade via tampering.
- **GCS signed URLs never in stdout/logs** — `IFirmwareStorageService.getSignedUrl()` is for internal use only (backend response to `/api/ota/check`). Must never be printed to stdout or stderr in CLI commands. URLs are time-limited credentials (15 min) and appear in Cloud Logging otherwise. The CLI `firmware:upload` summary prints only the GCS path (not the URL), with a note to use the backend endpoint.
- **Telegram webhook returns 503 when secret is missing** — `TELEGRAM_WEBHOOK_SECRET` is in `REQUIRED_VARS` (app exits on startup if absent). If it's somehow nil at runtime, the controller returns **503 SERVICE_UNAVAILABLE** (`{ error: 'Webhook not configured' }`), not 401/403 — 503 signals misconfiguration rather than an auth failure, which is semantically correct. Wrong secret returns 401.
- **HMAC guard catches canonical builder exceptions** (`hmac-auth.guard.ts`): All throws from `@HmacCanonical()` builder → `AuthenticationError(INVALID_CREDENTIALS)` → 401. Builders can validate fields explicitly (`throw` if missing/unparseable) without risk of unhandled 500s.
- **`gcsPath` is read verbatim, never reconstructed** — `CheckOtaUpdateService.checkForUpdate()` uses `FirmwareRelease.gcsPath` from the DB as-is to generate the signed URL; it does not rebuild the path from `boardType`/`version` at read time. Manually renaming/moving the GCS object without updating the matching DB row causes a 404 on device download. Fix is either: move the object back to the stored path, or update the DB row — never change the path-builder convention (`firmware/{board}/{version}/{filename}.bin`, enforced by a DB CHECK constraint).

**Transport Security: TLS as a Build-Time Flag (2026-07-08)**

- `HPW_USE_TLS` compile-time macro (`libs/firmware-shared/include/HomePulse/transport_client.h`) selects `WiFiClientSecure` (pinned GTS Root R1 CA, single-sourced) vs plaintext `WiFiClient` for both telemetry POSTs and OTA-check requests — previously plaintext by default (HMAC gives integrity, not confidentiality; MAC/power-status/battery-voltage were visible to any network observer). OTA binary download already used `WiFiClientSecure` independently and is unaffected.
- Release envs (`esp32c3`/`esp32c6` in `platformio.ini`) hardcode `-DHPW_USE_TLS=1`. Plaintext is reachable only via explicit `_dev`-suffixed envs (`esp32c3_dev`/`esp32c6_dev`), never invoked by the Docker/CI build pipeline (`scripts/firmware-docker-build.sh` always builds the plain env name) — no runtime/NVS/remote toggle exists, so a release-flashed device cannot be downgraded to plaintext.
- Single shared `TransportClient` instance reused sequentially across telemetry → OTA-check (never held concurrently) to conserve heap on the ESP32-C3's 400KB RAM; OTA binary download deliberately uses its own separate `WiFiClientSecure` instance rather than the shared one, so exactly one TLS session is ever open at a time.

**OTA Response Authentication (C-1 fix)**

- Response signed with HMAC-SHA256; canonical string: `version|url|checksum|isCritical|expiresAt|ts`
- Backend: `CheckOtaUpdateService` → `sig` (hex) + `ts` (Unix s) added to every `hasUpdate: true` response
- Firmware: verifies sig + freshness (±5 min window) before proceeding; fails closed
- Secret: per-device NVS secret (no new key material)
- Rollout constraint: backend MUST be deployed before sig-verifying firmware

**Admin HTTP Route: Browser-based Upload**

- **`GET/POST /admin/firmware`** route in existing `apps/api` (no new Nx app) — browser-based firmware upload alternative to CLI
  - `GET` serves a static HTML form with: drag-drop file input, version/board/channel dropdowns sourced from DB (via `FirmwareReleaseRepository.findAll()`), upload button
  - `POST` accepts `multipart/form-data`: `file` (binary, 4MB limit), `version`, `board`, `channel`, optional `critical` flag. Validates filename (`SAFE_BASENAME` regex), reuses `UploadFirmwareService` for upload logic
  - Auth: single bearer token env var `ADMIN_UPLOAD_TOKEN` (sufficient for solo admin). Missing/invalid token → 401 `Unauthorized`
  - No session/JWT auth built — bearer token only, never logged, only checked at handler entry
  - File validation: size limit 4MB, filename must match `^[A-Za-z0-9._-]+\.bin$` (prevents directory traversal)
  - Response: JSON `{ success: true, path, version, board, channel }` on success, or error details on validation failure

**Still pending:**

- Device → Release linking for tracking upgrade status per-device (deferred to 5.7)
- `firmware:promote` (canary/staged rollout automation) — deferred pending adoption of gradual rollout strategy
