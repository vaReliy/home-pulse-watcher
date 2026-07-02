# Knowledge Inbox

Append-only queue for durable, project-relevant learnings whose final home isn't clear yet. Distilled into PROJECT_CONTEXT.md / CLAUDE.md / a rule / a skill, then deleted from here — this file should trend toward empty.

## 2026-07-02 — battery `0` mV is a sentinel, not a real reading

Why: `apps/api/src/modules/telegram/formatters/message.formatter.ts` (`appendBatteryLine`, `formatDeviceStatus`) only guarded `!= null`, letting `batteryVoltage: 0` through and rendering "🔋 0.00V (0%)" to users. Root cause traced to firmware shipping stale/zero cache (see next entry). Fix: guard with `batteryVoltage > 0` everywhere it's read/displayed (single comparison also covers null/undefined).
Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — firmware `sendPowerStatus()` boot/status-change paths can ship stale battery cache

Why: `firmware/common/main.cpp`'s `lastBatteryAdcValue` cache (holds mV, not raw ADC) was historically refreshed only inside heartbeat/SOS blocks. Boot-time and power-status-change sends read the cache without refreshing it — a reboot mid-outage (before first heartbeat) ships literal `0`. Fixed by sampling `readBatteryVoltage()` immediately before every `sendPowerStatus()` call site. Firmware has no automated test harness — verification is manual call-site trace + real `pio run -e <board>` build.
Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — `gcsPath` CHECK constraint regex must allow semver prerelease correctly

Why: Constraint `firmware_release_gcs_path_check` uses POSIX ERE. Correct prerelease group `(-[a-zA-Z0-9][a-zA-Z0-9.]*)?` — a naive `(-[a-zA-Z0-9.]+)?` wrongly accepts a bare dot after hyphen (e.g. `0.2.0-.`). Final path shape (post `20260523075725_relax_gcs_path_semver_prerelease`): `^firmware/[a-z0-9_-]+/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9][a-zA-Z0-9.]*)?/[A-Za-z0-9._-]+\.bin$` — board is lowercase `[a-z0-9_-]+`, no channel segment in the path. Tests in `firmware-gcs-path.spec.ts` cover acceptance/rejection incl. path traversal and uppercase board.
Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — legacy `gcsPath` rows can break future CHECK-constraint migrations

Why: `ADD CONSTRAINT` validates existing data at apply time. Migration `20260505000002_fix_firmware_release_gcs_path_constraint` broke on staging/prod-shaped data because pre-Phase-5.6 rows used the legacy `{board}/{version}.bin` format, causing Postgres `23514` violation and an unrecoverable `migrate dev` failure blocking later migrations. No backfill migration existed for old rows.
Belongs in (guess): rule (migrations-queue.md) — before `prisma migrate deploy`, check `SELECT "gcsPath" FROM "FirmwareRelease" WHERE "gcsPath" !~ '^firmware/'`; backfill via a NEW forward migration (never edit an already-applied one) if any legacy rows exist, else deploy fails requiring manual `migrate resolve --rolled-back` + cleanup.

## 2026-07-02 — OTA signed-URL `expiresAt` must derive from the same TTL constant as the GCS URL

Why: Response `expiresAt` is computed server-side as `Date.now() + SIGNED_URL_TTL_MS`, NOT extracted from the GCS signed URL's own expiry. If `SIGNED_URL_TTL_MS` (in `@home-pulse-watcher/core`) drifts from the actual GCS TTL, firmware computes a different `expiresAt` and the response HMAC mismatches.
Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — OTA sig-verification rollout order: backend before firmware

Why: New firmware rejects OTA responses missing `sig`. Old backend doesn't emit `sig`. Deploying sig-verifying firmware before backend sig-emit → every OTA check returns `ParseError` → device stuck. Old firmware safely ignores the unknown `sig` field (JSON parser skips unknown keys), so backend-first is always safe.
Belongs in (guess): PROJECT_CONTEXT (deployment/rollout notes)

## 2026-07-02 — shared firmware headers need explicit `<cstdint>`/`<cstddef>` includes

Why: `Arduino.h` pulls in `stdint.h` transitively via the ESP32 toolchain, but a native/clang-analyzer build doesn't have those paths. Any function in `libs/firmware-shared` (e.g. `SecurityUtils.h`) using `uint8_t`/`size_t`/`uint32_t` cascades clang errors without explicit includes.
Belongs in (guess): CLAUDE.md (firmware/embedded-cpp-pro section) or a rule

## 2026-07-02 — Cloud Run rate limiting: trust proxy, cold-start reset, per-IP NAT collision

Why: (1) Without `app.set('trust proxy', 1)` (number, not boolean), Cloud Run's LB rewrite makes all requests share one IP → one global throttle bucket, both a DoS risk and a bypass. Boolean `true` trusts the whole XFF chain and is spoofable — don't build a custom `getTracker()` reading leftmost XFF either. (2) `ThrottlerModule.forRoot`'s default in-memory store resets every Cloud Run cold start (~15 min scale-to-zero); acceptable only while min/max instances = 1 — migrate to `@nest-lab/throttler-storage-redis` before scaling horizontally. (3) Per-IP limiting under-serves NAT'd households — multiple ESP32 devices behind one home NAT share a bucket. Post-MVP: add a per-MAC named throttler inside `HmacAuthGuard` after MAC validation.
Belongs in (guess): PROJECT_CONTEXT (infra/rate-limiting section) or rules/validation-authorization.md
