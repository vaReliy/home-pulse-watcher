# Changelog

## Phase 5.6 — OTA Release Metadata & Storage Layer (in progress)

### Task 1 — Release Metadata

- Added `FirmwareRelease` Prisma model with fields: `version`, `boardType`, `channel`, `checksum`, `gcsPath`, `isCritical`, `createdAt`.
- Created `BoardType` enum in core lib: `ESP32_C3`, `ESP32_C6`.
- Created `ReleaseChannel` enum in core lib: `ALPHA`, `BETA`, `STABLE`.
- Implemented `IFirmwareReleaseRepository` interface and `PrismaFirmwareReleaseRepository` with Prisma error translation.
- Added `FirmwareReleaseMapper` for entity-to-ORM conversions.
- Cloud Storage bucket: `home-pulse-ota-releases` (Always Free tier).

### Task 2 — GCS Integration

- Added `IFirmwareStorageService` interface in libs/core (port for binary upload and URL generation).
- Implemented `GcsService` in libs/infrastructure: upload-by-buffer with `ifGenerationMatch: 0` (prevents overwrites), V4 signed URL generation (15-minute TTL).
- Added `withGcsError` wrapper mapping GCS HTTP codes to domain errors (`404` → `NotFoundError`, `403` → permission error).
- Wired `StorageModule` in apps/api via NestJS DI with application default credentials (ADC) or service account key JSON auth.
- Added `GCS_BUCKET_NAME` to required env vars; optional `GCP_SERVICE_ACCOUNT_KEY` JSON validation at startup.

### Task 3 — OTA Discovery API

- Implemented `POST /api/ota/check` endpoint — HMAC-SHA256 authenticated via `@HmacCanonical()` decorator (pluggable canonicalization: deviceId or MAC).
- Channel waterfall logic: `STABLE` returns only stable releases, `BETA` returns beta + stable, `ALPHA` returns all channels.
- Semantic version comparison using `semver` library — returns only releases newer than device's current version.
- Response structure: `{ "hasUpdate": boolean, "release": { "version", "checksum", "downloadUrl" } | null }`.
- Device firmware calls endpoint with deviceId/MAC, current version, channel, and HMAC signature; signed response includes GCS V4 download URL with 15-minute TTL.

### Task 4 — Firmware OTA Client

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
