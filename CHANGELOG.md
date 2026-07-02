# Changelog

## [Unreleased]

### Chore

- **AI config**: `/cts-update` synced CTS payload to `6503059` (new skills `cts-contribute`/`cts-rule-auditor`/`distill-inbox`, `nx`-first `rules/docker-commands.md`, expanded `security-scanner`). Discovered the whole-file `.ctsignore` on `rules/workflow.md` had frozen it since 2026-06-12, missing two rounds of generic (non-frontend) upstream process improvements — re-merged Foresight gate, Nx Command Execution Policy, sequential quality gate (`tester → reviewer → security-scanner‖qa`, replacing all-parallel), severity floor, and `docs/CLAUDE_TS_CHANGELOG.md` knowledge routing, then re-pruned frontend-only sections. Also rewrote `.claude/skills/vitest-testing/SKILL.md` examples to Jest (this repo has no Vitest dependency) and corrected `tester.md`'s "using Vitest" wording; added new `docs/CLAUDE_TS_CHANGELOG.md` ledger to track these divergences for future upstream contribution. See that file for details.
- **AI config**: CLAUDE.md slimmed to a self-contained dispatcher core (no `@` force-loads); rules now read on-demand. Quality gate is now conditional (`tester`+`reviewer` always, `security-scanner`/`qa` only when relevant); `.claude/rules/workflow.md` updated to match and frontend-agent references removed (none installed in this repo).
- **AI config**: Slimmed `.claude/agents/*.md` frontmatter `description:` fields (removed `<example>` blocks, compressed UA trigger keyword lists to 4–5 terms) — these are loaded into every message, so smaller is cheaper. Downgraded `ba`, `devil`, `security-scanner` from `opus` to `sonnet` (kept `opus` for `ddd-architect` and `debugger`, where wrong answers/retries are costlier). Added a mandatory "Report Format" section to every agent body for terse, structured reports back to the orchestrator.
- **AI config**: Pruned frontend agents/skills (`vue-developer`/`react-developer`/`angular-developer`, `vue-expert`/`react-expert`/`angular-expert` — no UI in this repo) and duplicate skills (`playwright-skill`, `postgresql`, `database-optimizer`); removed non-TS examples from `github-actions` skill; fixed broken `description:` frontmatter on `playwright-expert` and `security-reviewer` skills that prevented correct trigger matching.

### Tests

- **Firmware/OTA**: Added boundary tests (`libs/firmware-shared/test/test_ota/test_ota.cpp`) for the silent URL-truncation guard in `ota.cpp` (`strlen(url) == sizeof(url) - 1`): a 1023-char URL now asserted to return `CheckResult::ParseError`, a 1022-char URL asserted to parse successfully. The guard itself was already shipped in `86b39e4`; only test coverage was missing (task `tmp/tasks/todo/2026-05-23-02-ota-url-buffer-truncation-check.md` predated that commit).

### Refactoring

- **Telegram bot**: Applied "Introduce Parameter Object" to `MessageFormatter.formatPowerLost`/`formatPowerRestored` and `PowerStatusListener.formatNotificationMessage`, replacing repeated 5–6 positional params (including adjacent same-typed `locale?`/`timezone?` strings — a transposition risk) with a shared `PowerEventMessageParams` interface. Pure structural change; no behavior or null-check semantics altered.

### Fixes

- **Docker build**: Production image build (Cloud Run) failed at `npm ci` in the `deps` stage with `Error: Could not find Prisma Schema that is required for this command`. Root cause: the `postinstall` script (`prisma generate`, added in `64a223a`) ran during dependency installation, before `prisma/schema.prisma` was copied into the image (that happens later, in the `build` stage via `COPY . .`). Fixed by running `npm ci --ignore-scripts` in the `deps` stage; `prisma generate` still runs explicitly in the `build` stage once the schema is present.
- **Telegram bot**: UPS devices now show battery percentage in "power restored" notifications, matching "power lost" output. Root cause: `power-status.listener.ts` dropped `event.batteryVoltage` when invoking `formatPowerRestored`, and the formatter had no battery parameter. Fixed by extracting a shared `appendBatteryLine` helper used by both `formatPowerLost` and `formatPowerRestored`.
- **Telegram bot / firmware**: Fixed UPS notifications showing impossible battery readings ("0.00V (0%)") right after a real outage. Two root causes: (1) firmware only refreshed its cached battery voltage on heartbeat/SOS sends, so a device rebooting mid-outage shipped a stale/zero-initialized reading on its next boot-time or status-change send (`firmware/common/main.cpp` now samples `readBatteryVoltage()` before every `sendPowerStatus()` call site); (2) the backend treated `batteryVoltage === 0` as a valid reading instead of the "no reading" sentinel already used elsewhere (`ProcessPowerStatusService`'s SOS guard), so `message.formatter.ts` rendered it to users instead of hiding the line — now guards `<= 0` in `appendBatteryLine`/`formatDeviceStatus`, and `Device.hasUps` was fixed for the same consistency gap.
- **Database migrations**: Removed two pre-existing `FirmwareRelease` rows with legacy `gcsPath` format (`esp32c6/3.5.1.bin`) that violated the Phase 5.6 CHECK constraint regex. Resolved failed migration ledger entry so `20260505000002_fix_firmware_release_gcs_path_constraint` reapplies cleanly (no migration files modified).

### Security

- **firmware/ota**: Detect silent URL buffer truncation in `parseOtaResponse` — if `url[1024]` fills to capacity (strlen == 1023), return `ParseError` and abort OTA rather than proceeding with a truncated signed URL. Added `snprintf` return-value guard on `respCanonical[1280]` in `checkForUpdate` as a secondary defence.

## Phase 5.6 — OTA Updates: Secure Remote Delivery (Complete)

### Summary

Phase 5.6 delivers end-to-end over-the-air firmware updates with cryptographic security. The backend stores firmware releases in GCS (Google Cloud Storage) with signed URLs (15-min TTL) and HMAC-SHA256 response validation. Devices verify certificates against Google Trust Services Root R1, check SHA-256 post-flash, and auto-rollback if validation fails within a 5-minute grace period. Server-side release channels (STABLE/BETA/ALPHA) control which binaries devices can receive, preventing downgrade attacks.

### Features

- **Binary Hosting**: GCS integration with `GcsService` (upload + V4 signed URLs), `StorageModule` DI wiring.
- **Release Management**: Prisma `FirmwareRelease` DB model with version, boardType, channel, checksum, and gcsPath (CHECK constraint enforcing semver + board prefix).
- **Secure Service**: `POST /api/ota/check` endpoint with HMAC-signed canonical string (`version|url|checksum|isCritical|expiresAt|ts`). Response authenticated with device secret; firmware verifies signature before download.
- **Firmware Logic**: `httpUpdate` integration with white LED fast-blink during download. SHA-256 post-flash verification with automatic rollback via `esp_ota_set_boot_partition()` on checksum mismatch.
- **OTA Hardening**: Grace-period validation (`≥ 3 heartbeats + ≥ 5 min uptime`) gates `markCurrentAppValid()`. Rollback protection: pending-verify bootloader flag auto-reverts to previous firmware if device crashes during grace period.
- **Admin CLI**: `firmware:upload` command — idempotent binary upload to GCS with DB record creation. Validates semver, board type, and channel; prints the GCS object path to stdout (signed URLs are never exposed to stdout/stderr — retrieve via the `/api/ota/check` endpoint).
- **Captive Portal**: WPA2-PSK derived from device MAC (last 4 bytes), anti-CSRF token (8-char hex via hardware TRNG), anti-CSRF token validation on `POST /save`.
- **TLS**: GTS Root R1 CA embedded in firmware for OTA binary download verification. Cert expires 2036-06-22 with documented rotation procedure.

### Security Boundaries Closed

- **C-1**: MITM cannot substitute OTA response URL/checksum — HMAC-signed response verified by firmware.
- **I-1**: GTS Root R1 CA pinning for OTA binary download (replaces `setInsecure()`).
- **I-2**: Captive portal WPA2 password + anti-CSRF token (prevents open AP + CSRF attacks).
- **C2**: Global rate limiting (60 req/min default, 12 req/min for `/api/ota/check`, 60 req/sec for webhook).
- **R1**: GCS permission errors typed and return HTTP 403 (not 500).
- **R2**: Firmware release query bounded (`take: MAX_CANDIDATE_RELEASES`).
- **I3**: Dead export cleanup (`checkOtaUpdateRules` removed).
- **I4/I5**: Telegram webhook secret now required at startup; timing-safe secret comparison.
- **I1/I2**: HMAC guard — MAC format validation + unified `INVALID_CREDENTIALS` error code (prevents MAC enumeration).
- **C3**: Firmware basename validation (prevents directory traversal); boardType prefix assertion (prevents wrong-board delivery).

### Fixes

- `extractJsonString` buffer overflow: GCS V4 signed URLs exceed 600 chars. Extended buffer to 1024, fixed escape sequence handling (`\"` → `"`, `\\` → `\`).
- `applyCompileTimeSecrets` empty channel guard: prevents false provisioning when `OTA_CHANNEL` is blank.
- `FirmwareRelease.gcsPath` CHECK constraint: relaxed regex to accept semver prerelease (`-alpha.1`, `-beta.2`, etc.).
- Unsafe `releaseChannel` cast: added type guard; invalid channels throw `DomainError(INVALID_DEVICE_STATE)`.
- GCS signed URL in stdout → stderr: credentials no longer appear in Cloud Logging / terminal history.
- Telegram webhook fallback: missing `TELEGRAM_WEBHOOK_SECRET` → HTTP 503 (not silent accept).
- OTA binary truncation: `httpUpdate` + `Update` streaming loop (not buffered) prevents mid-stream `close_notify` cuts.
- NeoPixel LED starvation: removed `show()` from OTA download callback (WiFi ISR resumption priority).
- OTA validation grace period: `shouldMarkAppValid()` predicate gates bootloader `markCurrentAppValid()` call (prevents crash-loop validation).

### Infrastructure

- Added `Dockerfile.admin` for containerized CLI (gcloud SDK included).
- Added `admin` service to `docker-compose.yml` with ADC credential mounts.
- `firmware:upload` CLI command with file resolution, LIVR validation, idempotency guard (GCS 412).
- 11 unit tests for firmware upload (success, `--critical`, conflict, cleanup scenarios).
- 7 integration tests for `POST /api/ota/check` (validation, HMAC, mocking).
- 9 native tests for OTA rollback (`shouldMarkAppValid` boundary cases).

### Docs

- Updated `README.md` — added Docker admin profile usage.
- Updated `docs/admin-guide.md` — firmware upload workflow, GTS Root R1 rotation, OTA rollback runbook, containerized CLI docs.
- `firmware/README.md` — OTA auto-rollback and white LED progress sections.

---

### Fix: gcsPath channel segment removed from firmware upload

- `upload-firmware.command.ts`: removed `${channel}/` segment from `gcsPath` construction. Path is now `firmware/{board}/{version}/{filename}.bin`, matching the DB CHECK constraint.
- Test fixtures in `upload-firmware.command.spec.ts` and `check-ota-update.service.spec.ts` updated to use the correct path format (channel was present in 9 fixture strings across both files).
- All 183 tests pass.

### Security: Captive portal WPA2 password + anti-CSRF token (I-2)

- `buildApPassword()` added to `portal.h` — derives an 8-char WPA2-PSK password from the last 4 bytes of the device MAC address (uppercased hex). Example: `AA:BB:CC:DD:EE:FF` → password `CCDDEEFF`.
- `WiFi.softAP()` now passes the derived password — provisioning AP no longer open.
- Password printed to Serial on AP start: `[Portal] AP started: HomePulse-Setup-EEFF  password: CCDDEEFF`.
- Anti-CSRF token (8-char uppercase hex, hardware TRNG via `esp_random()`) generated each AP session, exposed via `GET /config` as `"csrf"` field, required in `POST /save` as `_csrf` form field — missing/mismatched token → HTTP 403.
- Portal JS (`portal_html.h`) updated: captures token from `/config` on load, includes it in every save POST.
- `docs/admin-guide.md` updated with password derivation rule and updated Serial log example.

### Security: OTA binary download — replace setInsecure() with GTS Root R1 CA

- `setInsecure()` removed from `applyUpdate()` in `libs/firmware-shared/src/ota.cpp`.
- `libs/firmware-shared/include/HomePulse/gts_root_ca.h` added — embeds Google Trust Services Root R1 PEM (expires 2036-06-22) as a `PROGMEM` string constant.
- `client.setCACert(GTS_ROOT_CA)` used instead — mbedTLS now verifies the full certificate chain for `storage.googleapis.com` during OTA binary download.
- `docs/admin-guide.md` updated with cert expiry date and rotation procedure.
- Closes I-1 from the security audit; combined with C-1 (signed OTA-check response), the full OTA binary-download attack surface is now closed.

### Security: OTA-check response HMAC signing

- Backend (`CheckOtaUpdateService`) now signs every `hasUpdate: true` OTA response with HMAC-SHA256 using the device's per-device secret. Response includes `sig` (64-char hex) and `ts` (Unix seconds).
- Canonical string signed: `version|url|checksum|isCritical|expiresAt|ts`
- `SIGNED_URL_TTL_MS` extracted to `@home-pulse-watcher/core` (`firmware-storage.service.interface.ts`) — single source of truth shared by `GcsService` and `CheckOtaUpdateService`.
- Firmware (`libs/firmware-shared/src/ota.cpp`) verifies `sig` before proceeding with any OTA update:
  - Missing `sig`/`ts` → `ParseError` (fail-closed)
  - Signature mismatch → `AuthError`
  - Response older than 5 min or future-dated >1 min → `AuthError` (replay protection)
- `constantTimeEquals` helper added to `SecurityUtils.h` for constant-time HMAC comparison.
- Fixes C-1 from the security audit: MITM can no longer substitute OTA response to control firmware download URL + checksum.
- **Rollout order**: deploy backend sig-emit BEFORE flashing sig-verifying firmware. Old firmware ignores unknown `sig` field safely; new firmware rejects responses without `sig`.

### Fixed: `extractJsonString` truncates values containing `\"` or `\\` escape sequences

- **Root cause** (`ota.cpp:25`): `strchr(found, '"')` stopped at the literal `"` inside a `\"` escape, truncating the value. `strncpy` also copied raw bytes without unescaping `\\`.
- **Fix**: replaced `strchr`/`strncpy` with a character-by-character loop that unescapes `\"` → `"` and `\\` → `\`; other `\X` sequences copy `X`. Malformed values with no closing quote return `false`.
- **Tests added** (`test_ota`): `test_extract_escaped_quote_in_url`, `test_extract_escaped_backslash_in_url`, `test_extract_value_exceeding_buffer_returns_parse_error`.
- **Defensive comment** added to `ota.h` documenting the parser's scope (single-level escapes sufficient for current OTA fields).

### Fixed: `applyCompileTimeSecrets` empty `OTA_CHANNEL` silently marks NVS as provisioned

- **Guard added** (`credentials.h:215`): `OTA_CHANNEL` block now wrapped with `if (strlen(OTA_CHANNEL) > 0)`, consistent with existing guards on `WIFI_SSID`, `WIFI_PASSWORD`, `DEVICE_SECRET`, and `BACKEND_URL`. An empty `#define OTA_CHANNEL ""` no longer sets `wrote = true`, preventing false provisioning and subsequent backend LIVR rejection of the empty channel string.
- **Example updated**: `secrets.h.example` (both esp32c3 and esp32c6) now shows `#define OTA_CHANNEL "STABLE"` with inline comment "leave empty ("") to use portal provisioning".
- **Unit test added** (`test_apply_empty_ota_channel_does_not_set_wrote`): verifies all-empty inputs return `false` and leave `ota_channel` field empty.

### Fixed: `FirmwareRelease.gcsPath` CHECK Constraint Allows Prerelease Versions

- **Constraint regex corrected**: The DB CHECK constraint on `FirmwareRelease.gcsPath` was rejecting valid semver prerelease versions (e.g. `0.2.0-beta.1`). Old regex: `^firmware/(esp32c3|esp32c6)/[A-Z]+/[0-9]+\.[0-9]+\.[0-9]+/[a-zA-Z0-9._-]+\.bin$`. New regex: `^firmware/(esp32c3|esp32c6)/[A-Z]+/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?/[a-zA-Z0-9._-]+\.bin$` (added optional prerelease segment `(-[a-zA-Z0-9.]+)?`).
- **Migration applied**: New Prisma migration `20260523075725_relax_gcs_path_semver_prerelease` relaxes the constraint to accept semver prerelease format per RFC 3440.
- **Unit tests added**: `libs/application/src/lib/services/ota/firmware-gcs-path.spec.ts` covers stable versions (`0.1.0`), prerelease versions (`0.2.0-beta.1`, `1.0.0-rc.1`), and includes a "bug documentation" block demonstrating the old regex rejection pattern.

## Phase 5.6 — OTA Security & Code Review Hardening (post-audit)

### Fixed: Unsafe `releaseChannel` Cast in `CheckOtaUpdateService`

- **Type guard added** (`isReleaseChannel(value: unknown): value is ReleaseChannel`): exported from `@home-pulse-watcher/core` to validate `device.releaseChannel` against the enum before use.
- **Service-level validation**: `CheckOtaUpdateService` now calls the guard and throws `DomainError(INVALID_DEVICE_STATE)` for invalid channel values instead of propagating an untyped `Error` that would surface as HTTP 500.
- **Error code standardized**: Added `INVALID_DEVICE_STATE` to `DomainErrorCode` enum (HTTP 500 — data-integrity violation, server-side, distinct from validation errors).
- **Unit test added**: mock repo returns `releaseChannel: 'INVALID'` → service throws `DomainError` with `INVALID_DEVICE_STATE` code.

### OTA Release Channel Control + GCS URL Sanitization + Telegram Auth Fallback

- **Server-controlled release channel** (`Device.releaseChannel`): Added `CHAR(6)` column to Prisma `Device` model with CHECK constraint `('ALPHA'|'BETA'|'STABLE')`, default `'STABLE'`. Device's firmware tier is now persistent in DB — server decides which release binary the device receives, not the client. Request body `channel` field is retained **only in the HMAC canonical string** for firmware backward compatibility (V3.x devices still transmit it); it no longer influences release selection. Prevents devices from downgrading to old / test binaries via request tampering. Security boundary: POST `/api/ota/check` receives untrusted `channel` from device, but `CheckOtaUpdateService` ignores it and uses `device.releaseChannel` from DB for the actual release query.
- **GCS signed URL removed from CLI stdout** (`firmware:upload` command): Previously the command printed a 15-minute signed URL preview to stdout for quick testing — this URL was captured in Cloud Logging stdout sinks and terminal scrollback history. URL now printed only to stderr (diagnostic info), and a clear message directs to use the backend `/api/ota/check` endpoint instead. Signed URLs are authentication credentials and must not appear in unencrypted log streams.
- **Telegram webhook fallback to 503** (`telegram.controller.ts`): When `TELEGRAM_WEBHOOK_SECRET` is absent from `process.env` at runtime (config error or crashed supervisor), the controller now returns HTTP 503 (Service Unavailable) instead of silently accepting unsigned webhook payloads. Previously the guard returned early if the header was missing, bypassing validation — a misconfigured deployment would become a bot-spoofing vector (external attackers could forge bot commands). Matches the pattern of `/api/health/ready` — dependent service unavailable → 503.
- **FirmwareRelease `gcsPath` CHECK constraint**: Path format is `firmware/<board>/<version>/<filename>` — the **channel is stored as a separate DB column, not in the GCS path** to avoid collision and maintain single-path-per-release semantics. This prevents the same binary from being uploaded multiple times with different channel tags, ensuring a release is uniquely identified by board + version. The constraint regex uses lowercase `[a-z0-9_-]+` for board type and optionally accepts semver prerelease suffixes like `0.2.0-beta.1`.
- **`BOARD_MISMATCH` domain error maps to HTTP 500** (not 422): The error is a data integrity problem (DB row corruption or release mislink), not a client-side validation failure. Changed `check-ota-update.service.ts` error mapping in `ServiceExceptionFilter` so `BOARD_MISMATCH` → 500 internal error (correct semantic), not 422 unprocessable entity.
- **HMAC guard wraps canonical builder in try/catch** (`hmac-auth.guard.ts`): A throw from the `@HmacCanonical()` builder (missing header, unparseable field) previously bubbled as an unhandled 500. Now wrapped: any builder exception → `AuthenticationError(INVALID_CREDENTIALS)` → HTTP 401. Allows future builders to use explicit field validation (`throw new Error('MAC field missing')`) without risk of exposing the exception chain to the client.

## Security

### Container runs as non-root user (I6)

- **`USER node` added to production Dockerfile stage**: All `COPY` directives in the production stage now use `--chown=node:node`; `USER node` is set before `ENTRYPOINT`. The built-in `node` user (uid 1000) from the `node:22-alpine` base image is used — no custom user created. `docker inspect <image> --format '{{.Config.User}}'` now returns `node` instead of empty (root). Eliminates unnecessary root privilege inside the gVisor sandbox on Cloud Run.

## Reliability & Code Quality

### GCS 403 typed error + query bound + dead export cleanup (R1 + R2 + I3)

- **GCS permission error mapped correctly (R1)**: Added `StoragePermissionError extends BaseError` (`httpStatus = 403`, `code = STORAGE_PERMISSION_DENIED`) in `gcs-error.wrapper.ts`. The 403 branch of `withGcsError` now throws this typed error instead of a plain `Error` with a bolted-on `.code`. Previously, `ServiceExceptionFilter` couldn't catch the plain error → HTTP 500; now the device receives a proper 403.
- **`findLatestForBoard` query bounded (R2)**: Added `orderBy: { createdAt: 'desc' }` and `take: MAX_CANDIDATE_RELEASES` (= 50, named constant with JSDoc) to the `findMany` call in `firmware-release.repository.ts`. Previously the query returned every historical release for the board+channel, with max-semver selection happening in memory.
- **Dead `checkOtaUpdateRules` export removed (I3)**: Deleted the unreachable export and its unused `LivrRules` import from `check-ota-update.dto.ts`. Service-level `validationRules()` is the single source of truth.
- Unit test: `gcs-error.wrapper.spec.ts` extended with `StoragePermissionError` instanceof + `httpStatus === 403` assertions.

## Security

### Telegram webhook: require secret + timing-safe comparison (I4 + I5)

- **`TELEGRAM_WEBHOOK_SECRET` now required** (`env.validation.ts`): added to `REQUIRED_VARS` — app exits on startup if the variable is absent in any environment (not just production). Closes the unauthenticated-webhook / bot-impersonation vector.
- **Timing-safe comparison** (`telegram.controller.ts`): replaced `headerSecret !== webhookSecret` with `crypto.timingSafeEqual` behind a length-equality pre-check. Eliminates timing side-channel that could leak secret length or partial matches.
- Unit tests added: `env.validation.spec.ts` (missing `TELEGRAM_WEBHOOK_SECRET` → process exit), `telegram.controller.spec.ts` (missing header → 401, wrong value → 401, length-extended value → 401, exact match → passes).

### HMAC guard: MAC format validation + unified error codes (I1 + I2)

- **MAC format validation** (`hmac-auth.guard.ts`): added `MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/` check immediately after header normalization, before any DB query — rejects too-short, lowercase, wrong-separator, or non-hex MACs with `INVALID_CREDENTIALS`. Closes log-injection and unbounded-input-to-DB vectors.
- **Unified client error code**: both the "device not found" and "invalid signature" branches now return `{ code: 'INVALID_CREDENTIALS' }` to callers. Prevents MAC enumeration via distinct error codes (Espressif OUI prefix space is only ~16 M addresses — practically enumerable without rate limiting).
- Server logs still emit distinct `DEVICE_NOT_FOUND` / `INVALID_SIGNATURE` context so operators can diagnose without leaking info to callers.
- Unit tests added / updated in `hmac-auth.guard.spec.ts`: invalid MAC format (3 cases), unknown MAC → `INVALID_CREDENTIALS`, bad signature → `INVALID_CREDENTIALS`, anti-enumeration assertions confirm `DEVICE_NOT_FOUND`/`INVALID_SIGNATURE` never appear in response.

### Enforce firmware boardType binding + validate basename (C3)

- **CLI basename guard** (`upload-firmware.command.ts`): validates the firmware filename against `SAFE_BASENAME = /^[A-Za-z0-9._-]+\.bin$/` before constructing the GCS path — rejects directory traversal, spaces, and non-`.bin` extensions with a clear error.
- **Service boardType prefix assertion** (`check-ota-update.service.ts`): after selecting the latest release, asserts `gcsPath.startsWith(firmware/${boardType}/)` before calling `getSignedUrl` — throws `DomainError(BOARD_MISMATCH)` if a DB-row corruption or mislinked release would deliver a wrong-board binary.
- **Shared helper** `firmwareGcsPathPrefix(boardType)` extracted to `libs/application/src/lib/services/ota/firmware-gcs-path.ts` — single source of truth for the GCS path prefix convention.
- **`BOARD_MISMATCH`** added to `DomainErrorCode` enum for machine-readable HTTP boundary handling.
- Defense-in-depth: previously the only protection was SHA-256 hash check; now wrong-board firmware is caught before a signed URL is ever issued.

### Add global rate limiting (C2)

- Installed `@nestjs/throttler` v6+ and configured globally with 60 requests/minute default limit.
- Applied `ThrottlerGuard` as global `APP_GUARD` in `app.module.ts` with per-route overrides via `@Throttle()` decorator:
  - `POST /api/device/status`: 60 req/min/IP (standard power events)
  - `POST /api/ota/check`: 12 req/min/IP (GCS signed URL generation is expensive)
  - `POST /api/telegram/webhook`: 60 req/sec/IP (webhook flood protection)
- Exempt health checks and keep-warm pings via `@SkipThrottle()` on `HealthController` and `AppController`.
- Set `app.set('trust proxy', 1)` in `main.ts` to resolve client IP correctly behind Cloud Run load balancer.
- Added body size limits: `json({ limit: '4kb' })` + `urlencoded({ limit: '4kb', extended: false })`.
- Uses in-memory throttle store; documented migration path to Redis for horizontal scaling.
- Prevents DB amplification attacks (unbounded AES-GCM decrypt on `/api/device/status`), GCS egress amplification (signed URL generation per OTA check), and MAC enumeration via request volume DOS.

### Remove unauthenticated Telegram debug endpoints (C1)

- Deleted `GET /api/telegram/debug-webhook` and `POST /api/telegram/reset-webhook` from `TelegramController`.
- Both had zero authentication and no rate limiting — exposure risk: Cloud Run hostname / error fragments (info disclosure) + unlimited `setWebhook` calls (DoS → bot offline).
- Removed the `Get` import that was only used by the deleted handler.
- All remaining routes and the webhook handler are untouched.

## Phase 5.6 — OTA Release Metadata & Storage Layer (in progress)

### Infra: Docker `admin` profile with gcloud

- Added `Dockerfile.admin` at repo root — multi-stage build (`google/cloud-sdk:alpine` → `node:22-alpine`).
  - Copies pre-built `apps/api/dist/` (requires `npx nx build api` on host first).
  - Copies `prisma/` schema and `prisma.config.ts`; runs `npx prisma generate` at image build time.
  - Installs production deps via `npm install --omit=dev` (no lockfile in `assets/package.json`); installs `prisma@7` + `dotenv` with `--no-save`.
  - Runs as `USER node` (non-root) — gcloud mount target is `/home/node/.config/gcloud`.
  - Entrypoint: `node /app/cli.js`.
- Updated `docker-compose.yml` — added `admin` service under `profiles: [admin]`.
  - `env_file: .env` — leave `GCP_SERVICE_ACCOUNT_KEY` empty; ADC via mounted host credentials takes precedence.
  - Volumes: `~/.config/gcloud:/home/node/.config/gcloud:ro` (ADC) + `./tmp/firmware:/firmware:ro` (firmware binaries).
  - `depends_on: postgres: condition: service_healthy`.
- Updated `README.md` — added "Running Admin CLI in a Container" subsection with step-by-step commands.
- Updated `docs/admin-guide.md` — added containerized CLI runbook section.
- Usage: `docker compose --profile admin run --rm admin firmware:upload --file /firmware/<bin> --version <semver> --board esp32c3 --channel BETA`

### Admin CLI: `firmware:upload` command

- Added `apps/api/src/cli/firmware/upload-firmware.command.ts` — `firmware:upload` nest-commander command.
  - Reads a `.bin` file (absolute path or bare basename searched in `./tmp/firmware/`), computes SHA-256, uploads to GCS, and creates a `FirmwareRelease` DB record.
  - GCS path convention: `firmware/<board>/<version>/<filename>` (channel is DB-only, not in path).
  - Idempotent upload guard: detects GCS 412 (object already exists via `ifGenerationMatch: 0`) and surfaces a clear error message.
  - Best-effort GCS cleanup on DB write failure — calls `deleteObject` and warns if cleanup itself fails.
  - LIVR validation: `version` (semver), `board` (`esp32c3`|`esp32c6`), `channel` (`ALPHA`|`BETA`|`STABLE`).
  - Prints a summary table on success (signed URLs not printed — they are credentials and must not appear in logs).
  - `--critical` flag marks the release, forcing all channel-subscribed devices to update.
- Added `IFirmwareStorageService.deleteObject(gcsPath)` to core interface and `GcsService` implementation.
- Updated `CliModule` — imported `StorageModule` directly (storage token not re-exported through `ServicesModule`) and registered `UploadFirmwareCommand`.
- Added 11 unit tests covering: success, `--critical`, path resolution, file-not-found, LIVR validation failures, GCS 412 conflict, DB unique-constraint + cleanup, generic DB error + cleanup, cleanup-also-fails scenario.

### Backend: OTA controller validation + integration test coverage

- Added `checkOtaUpdateRules` LIVR rule set to `check-ota-update.dto.ts` — validates
  `boardType` (`esp32c3`|`esp32c6`), `currentVersion` (string ≤ 20 chars), `channel` (`ALPHA`|`BETA`|`STABLE`).
- Moved `@UseGuards(HmacAuthGuard)` from the `@Post('check')` method to the `@Controller('ota')`
  class level, aligning with the `device-status.controller.ts` pattern.
- Added `apps/api/src/controllers/ota/ota.controller.spec.ts` — 7 NestJS integration tests
  using `Test.createTestingModule` + Node.js `http` module (no supertest dependency):
  - 400 when `boardType` is missing
  - 400 when `boardType` is invalid (not `esp32c3`/`esp32c6`)
  - 400 when `channel` is not `ALPHA`/`BETA`/`STABLE`
  - 401 when HMAC headers are absent
  - 401 when HMAC signature is invalid
  - 200 `{ hasUpdate: false }` when no release exists
  - 200 `{ hasUpdate: true, version, url, checksum, isCritical }` with mocked `GcsService.getSignedUrl`

### Firmware: OTA rollback hardening + grace-period validation

- Added `HomePulse::Ota::shouldMarkAppValid()` — pure predicate returning `true` only when
  `pendingValidation && heartbeats ≥ minHeartbeats && uptime ≥ minUptimeMs`.
  Exposed in `ota.h` outside `#ifndef UNIT_TEST` so it is natively testable.
- Replaced single-heartbeat `markCurrentAppValid()` trigger in `firmware/common/main.cpp` with
  a grace-period guard (`OTA_VALIDATION_MIN_HEARTBEATS=3`, `OTA_VALIDATION_MIN_UPTIME_MS=300000`).
  Both the setup() initial send and the loop() heartbeat increment the shared `heartbeatsSinceBoot`
  counter; the predicate gates the actual IDF call.
- Added `OTA_VALIDATION_MIN_HEARTBEATS` and `OTA_VALIDATION_MIN_UPTIME_MS` constants to both
  `firmware/esp32c3/src/config.h` and `firmware/esp32c6/src/config.h`.
- Fixed SHA-256 mismatch path in `applyUpdate()`: after `Update.end()` succeeds but checksum
  fails, `esp_ota_set_boot_partition(esp_ota_get_running_partition())` is called to revert the
  next-boot partition selection — prevents a bad build from booting on the next power cycle.
- Standardised abort log tag to `[OTA][ABORT]` on all abort paths
  (short write, incomplete download, checksum mismatch) for grep-ability.
- Added 9 native unit tests in `libs/firmware-shared/test/test_ota_rollback/` covering all
  branches of `shouldMarkAppValid` including exact-boundary cases.
- Documented rollback flow in `firmware/README.md` (OTA Auto-Rollback section) and added
  "OTA Rollback Flow" runbook to `docs/admin-guide.md`.

### Firmware: White LED progress during OTA apply

- Wired `tickFastWhiteLed(statusLed)` into `HomePulse::Ota::applyUpdate()`: called once per download-chunk loop iteration and once before the blocking `esp_partition_get_sha256` partition read.
- Removed `(void)statusLed;` stub that previously discarded the parameter.
- Added `#include "HomePulse/led.h"` to `libs/firmware-shared/src/ota.cpp` (device-only block).
- The 80 ms white fast-blink documented in `firmware/README.md` is now actually driven by code; no README text change required.
- LED ownership contract documented in a single comment at function entry: main loop reclaims LED state via `setPowerStatusLed()` on its next iteration.

### Release Metadata

- Added `FirmwareRelease` Prisma model with fields: `version`, `boardType`, `channel`, `checksum`, `gcsPath`, `isCritical`, `createdAt`.
- Created `BoardType` enum in core lib: `ESP32_C3`, `ESP32_C6`.
- Created `ReleaseChannel` enum in core lib: `ALPHA`, `BETA`, `STABLE`.
- Implemented `IFirmwareReleaseRepository` interface and `PrismaFirmwareReleaseRepository` with Prisma error translation.
- Added `FirmwareReleaseMapper` for entity-to-ORM conversions.
- Cloud Storage bucket: `home-pulse-ota-releases` (Always Free tier).

### GCS Integration

- Added `IFirmwareStorageService` interface in libs/core (port for binary upload and URL generation).
- Implemented `GcsService` in libs/infrastructure: upload-by-buffer with `ifGenerationMatch: 0` (prevents overwrites), V4 signed URL generation (15-minute TTL).
- Added `withGcsError` wrapper mapping GCS HTTP codes to domain errors (`404` → `NotFoundError`, `403` → permission error).
- Wired `StorageModule` in apps/api via NestJS DI with application default credentials (ADC) or service account key JSON auth.
- Added `GCS_BUCKET_NAME` to required env vars; optional `GCP_SERVICE_ACCOUNT_KEY` JSON validation at startup.

### OTA Discovery API

- Implemented `POST /api/ota/check` endpoint — HMAC-SHA256 authenticated via `@HmacCanonical()` decorator (pluggable canonicalization: deviceId or MAC).
- Channel waterfall logic: `STABLE` returns only stable releases, `BETA` returns beta + stable, `ALPHA` returns all channels.
- Semantic version comparison using `semver` library — returns only releases newer than device's current version.
- Response structure: `{ "hasUpdate": boolean, "release": { "version", "checksum", "downloadUrl" } | null }`.
- Device firmware calls endpoint with deviceId/MAC, current version, channel, and HMAC signature; signed response includes GCS V4 download URL with 15-minute TTL.

### Firmware OTA Client

- `HomePulse::Ota::checkForUpdate()` — HMAC-signed `POST /api/ota/check` using 5-field canonical string (`MAC:TS:boardType:version:channel`); returns `UpdateAvailable`, `NoUpdate`, or `Error`.
- `HomePulse::Ota::applyUpdate()` — HTTPS binary download via `httpUpdate.h` (`setInsecure`), SHA-256 post-flash verification via `esp_partition_get_sha256`.
- Passive rollback: `markCurrentAppValid()` deferred until first successful heartbeat; bootloader auto-reverts if device never validates (watchdog fires before heartbeat).
- White-LED fast blink during download/flash (`tickFastWhiteLed`, 80 ms cadence).
- NVS `ota_channel` field (default `STABLE`) configurable via captive portal select.
- OTA-ready partition table (`partitions.csv`) for both ESP32-C3 and ESP32-C6 (4 MB flash, min_spiffs layout).
- Boot-time OTA check (after WiFi + NTP, before watchdog fires) and periodic check every 6 h in `loop()`, both with watchdog pause around flash.
- 9 Unity/native tests added: `checkForUpdate` canonical string format, channel values, signature composition.

### Firmware Refactor — Shared Sketch

- Replaced per-board `firmware/esp32c3/src/main.cpp` and `firmware/esp32c6/src/main.cpp` with a single `firmware/common/main.cpp` consumed by both envs via PlatformIO `build_src_filter`.
- Per-board values (`BOARD_TYPE`, GPIO pins, `BATTERY_DIVIDER_RATIO_*`) remain in each env's `config.h` — zero `#ifdef` in the shared source.
- Added `BATTERY_DIVIDER_RATIO_NUM=2000` / `_DEN=1000` to `esp32c3/src/config.h` (nominal 100k/100k divider); ESP32-C6 retains empirically calibrated `1993/1000`.
- Boot banner now uses `BOARD_TYPE` macro: `Serial.printf("HomePulse Watcher - %s\n", BOARD_TYPE)`.
- IDF version guard for watchdog API (`esp_task_wdt_reconfigure` vs `esp_task_wdt_init`) applied unconditionally — safe on both platforms.

### Bugfixes — Backend OTA Hardening

- Fixed GCS signed URL failure (`error:1E08010C:DECODER routines::unsupported`) on Node 22 / OpenSSL 3: service account `private_key` env vars often contain literal `\n` escape sequences instead of real newlines after JSON round-trips; OpenSSL 3 rejects such PEM blocks. Added `normalizePemKey()` utility that converts escaped sequences to real newlines before passing the key to `@google-cloud/storage`. Validation runs at startup (`validateEnv`) so misconfigured keys are caught before the first OTA request.
- Fixed backend process crash (exit 1) when GCS was unreachable (device on LAN, backend offline): added `bootstrap().catch()` and `process.on('unhandledRejection')` / `process.on('uncaughtException')` handlers so transient network errors from `google-auth-library` retries cannot escape NestJS's exception filter and kill the process. Network errors (`ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN`, `ETIMEDOUT`, `ENETUNREACH`) in `withGcsError` are now classified as `StorageUnavailableError extends BaseError` (HTTP 503) instead of falling through to the 500 catch-all.
- Added `maxRetryDelay: 5000` and `timeout: 10_000` to GCS `Storage` client config to prevent long hangs on offline retries.

### Bugfixes — Firmware OTA Hardening

- `BACKEND_URL` semantics changed: now stores the base origin only (e.g. `https://your-server.com`) with no path. Firmware appends `/api/device/status` for power events and `/api/ota/check` for OTA checks. `secrets.h.example` and README updated accordingly.
- Fixed OTA binary truncation caused by SSL `close_notify` cutting the stream mid-download when using `httpUpdate` / `HTTPUpdate.h`. Rewrote `HomePulse::Ota::applyUpdate()` with direct `HTTPClient` + `Update` (streaming `stream->read()` loop), which keeps the connection open until the full binary is drained. SHA-256 post-flash verification now works correctly end-to-end; automatic flashing confirmed on real hardware.
- Fixed OTA `url[]` buffer overflow: GCS V4 signed URLs exceed 600 characters; `parseOtaResponse` used a `char url[384]` buffer that silently truncated the URL. Buffer extended to `url[1024]`.
- Fixed NeoPixel `show()` calls inside the OTA progress callback starving the WiFi ISR and stalling the download. Removed LED animation from `applyUpdate()` (marked `(void)statusLed`); download no longer interrupts the RF stack.
- Added `client.setTimeout(60)` to `WiFiClientSecure` in `applyUpdate()` to handle slow GCS responses on large binaries.
- Added explicit logging for all `CheckResult` cases in the boot-time OTA switch block (`main.cpp`) — `NoUpdate`, `NetworkError`, `AuthError`, `ParseError` are now printed to serial.
- Added `Serial.printf("[OTA] HTTP %d / body len / body preview"` and `parseOtaResponse` result logging to `checkForUpdate()` for field diagnostics.
- Added `monitor_dtr = 0` / `monitor_rts = 0` to both `platformio.ini` files — prevents the serial monitor from triggering a hardware reset on open (soft-reset support for OTA post-flash verification sessions).
- Added 810-character URL regression test to `test_ota.cpp` verifying that `parseOtaResponse` correctly handles URLs at the new buffer size.
- Fixed `fatal error: config.h: No such file or directory` when building `firmware-shared` library for both boards: added `-I src` to `build_flags` in `firmware/esp32c3/platformio.ini` and `firmware/esp32c6/platformio.ini`. PlatformIO does not add the project's `src/` to the include path when compiling symlinked library sources; `led.h` includes `config.h` which lives in the board-specific `src/`.

**Pending**: Task 5 — `device:upgrade` CLI command; device→release upgrade status linking.

## v3.5.0 — Firmware Refactoring & Quality Assurance (Phase 5.5)

- Extracted `sendPowerStatus` payload/signature building into `libs/firmware-shared/include/HomePulse/telemetry.h`.
- Extracted debounce state machine into `libs/firmware-shared/include/HomePulse/debounce.h`.
- Added Unity/Native unit tests under `libs/firmware-shared/test/` covering Battery, Power, Debounce, Security, Telemetry.
- Both `main.cpp` files reduced from ~530 to ≤400 lines.
- Fixed boot resilience: device now immediately starts captive portal AP when any required credential (SSID, secret, URL) is blank, instead of looping with "SSID too long or missing!" until a 5-minute timeout and reboot (which reproduced the same broken state). Added compile-time empty-stub guard to prevent blank `secrets.h` values from being written to NVS.
- After 5 minutes of failed WiFi retries, device now opens captive portal instead of rebooting (field-recoverable without a USB cable).
- Added `credentialsAreUsable()` helper to `credentials.h` and 6 Unity tests in `test/test_credentials/` covering all missing-field combinations.
- Captive portal UX improvements: network list now shows SSID name only (no RSSI/secured), sorted by signal strength with hidden and duplicate networks filtered out.
- Portal pre-fills backend URL and current SSID from NVS on page load via new `GET /config` endpoint; device secret presence is indicated with a masked placeholder so users can re-provision without re-entering unchanged values.
- Added `× Clear` buttons on secret and URL fields for explicit rotation; submitting the unchanged masked placeholder keeps the existing NVS secret.
- Added `mergeSubmittedCredentials()` and `buildConfigJson()` pure helpers to `credentials.h`; upgraded `Preferences` test mock to an in-memory map; extended test suite to 46 Unity tests covering merge, JSON encoding, and NVS round-trip.
- Fixed autofill regression: compile-time `secrets.h` provisioning now writes each non-empty field individually (`applyCompileTimeSecrets()` helper). Previously, an empty `WIFI_SSID` blocked the entire NVS write even when `DEVICE_SECRET` and `BACKEND_URL` were defined, leaving the captive portal with blank fields. Added 3 Unity tests for the new helper.
- Added diagnostic `Serial.printf` in `GET /config` handler reporting NVS field lengths and `hasSecret` — enables on-device confirmation without logging the secret value.
- Added show/hide password eye toggle (👁/🔒) on the WiFi password field for easier provisioning.

### v3.4.0 — Wi-Fi Provisioning (Phase 5.4)

Removed hardcoded credentials from firmware. All credentials (WiFi SSID/password, device secret, backend URL) are now stored in NVS flash and configured at runtime via a captive portal. On first boot (or after factory reset), the device starts as an open AP named `HomePulse-Setup-XXXX` (last 4 hex chars of MAC) and serves a configuration UI at `http://192.168.4.1/`. After the user saves credentials, the device reboots and connects as a normal STA.

Added factory reset: holding the BOOT button for 10 seconds triggers a progressive orange blink animation, then a 1-second solid purple confirmation flash, before wiping NVS and rebooting into the portal.

Fixed a security/reliability bug: if WiFi is configured but unavailable, the device now retries every 5 s for 5 minutes, then reboots to retry — it never wipes credentials or opens the AP automatically. The captive portal is only opened when NVS is truly empty.

Optional compile-time provisioning via `include/secrets.h` is preserved for development convenience: if the file is present at build time, its values are written to NVS on the first boot and `secrets.h` is no longer needed for subsequent flashes.

Both C3 and C6 variants are updated to firmware v3.4.0.

### v3.3.0 — UPS Battery Monitoring Enabled

Enabled `HAS_UPS_MODULE` in the ESP32-C6 firmware config. UPS is a hardware wiring option available to both C3 and C6; it is disabled by default. Calibrated the battery voltage divider formula using real hardware measurements: 2.95V battery → 1.40V at GPIO3, yielding `BATTERY_CALIBRATED_SCALE = 6953`. Replaced the nominal `adcAvg * 2 * 3300 / 4095` formula with `(long)adcAvg * BATTERY_CALIBRATED_SCALE / 4095`. Backend was fully implemented in advance — no backend changes needed.

### Hardware Wiring Diagram Refactor

Replaced compact ASCII diagrams in `docs/hardware/ups.md` and `docs/hardware/standard.md` with structured schematics using labeled blocks (A: sensing, B: power path, C: battery sense) and an ESP32 box showing all pin connections. Fixed topology bug in `ups.md` where D1 previously routed through the shield instead of directly to it.

### UPS Battery Monitoring

Added UPS Edition hardware variant (V2.3) with TP4056 charge/discharge shield, dual-diode OR-gate, and 18650 battery backup. Full-stack battery voltage monitoring via GPIO3 ADC with low-battery SOS Telegram alerts (3400 mV threshold).

### Device Status Tracking

Added `statusChangedAt` field to track when power status last changed, and `collapseEvents` for aggregating rapid power events in Telegram history.

### Observability & Reliability

Structured JSON logging (pino), health check endpoints (`/health/live`, `/health/ready`), startup env validation, Prisma error translation layer, and Telegram webhook diagnostic endpoints.

### Firmware Version Tracking

Devices report firmware version in every status ping; backend stores and displays `firmwareVersion`. Reduced debounce windows in Firmware V3.1 for faster responsiveness.

### Cloud Run Deployment

Docker multi-stage build, Webpack serverless bundling, CI/CD pipeline via GitHub Actions with Workload Identity Federation, and Cloud Scheduler keep-warm job.

### i18n Support

Internationalization for Telegram bot (Ukrainian + English) with per-user locale and timezone settings via `TranslationService`.

### Telegram UI Upgrade

Migrated from slash commands to interactive Reply/Inline keyboards, implemented MarkdownV2 formatting, and added a stateless Settings menu with locale/timezone support.

### Power Sensing v2

Implemented ADC-based sensing with ADC hysteresis, firmware confirmation (~400 ms), and server-side notification debounce (5 s) to eliminate grid flapping noise.
