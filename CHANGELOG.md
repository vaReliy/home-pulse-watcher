# Changelog

## Phase 5.6 — OTA Release Metadata & Storage Layer (in progress)

### Admin CLI: `firmware:upload` command

- Added `apps/api/src/cli/firmware/upload-firmware.command.ts` — `firmware:upload` nest-commander command.
  - Reads a `.bin` file (absolute path or bare basename searched in `./tmp/firmware/`), computes SHA-256, uploads to GCS, and creates a `FirmwareRelease` DB record.
  - GCS path convention: `firmware/<board>/<channel>/<version>/<filename>`.
  - Idempotent upload guard: detects GCS 412 (object already exists via `ifGenerationMatch: 0`) and surfaces a clear error message.
  - Best-effort GCS cleanup on DB write failure — calls `deleteObject` and warns if cleanup itself fails.
  - LIVR validation: `version` (semver), `board` (`esp32c3`|`esp32c6`), `channel` (`ALPHA`|`BETA`|`STABLE`).
  - Prints a summary table including a 15-minute signed URL preview on success.
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
