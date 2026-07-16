# Knowledge Inbox

Append-only queue for durable, project-relevant learnings whose final home isn't clear yet. Distilled into PROJECT_CONTEXT.md / CLAUDE.md / a rule / a skill, then deleted from here — this file should trend toward empty.

## 2026-07-02 — battery `0` mV is a sentinel, not a real reading

Why: `apps/api/src/modules/telegram/formatters/message.formatter.ts` (`appendBatteryLine`, `formatDeviceStatus`) only guarded `!= null`, letting `batteryVoltage: 0` through and rendering "🔋 0.00V (0%)" to users. Root cause traced to firmware shipping stale/zero cache (see next entry). Fix: guard with `batteryVoltage > 0` everywhere it's read/displayed (single comparison also covers null/undefined). Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — firmware `sendPowerStatus()` boot/status-change paths can ship stale battery cache

Why: `firmware/common/main.cpp`'s `lastBatteryAdcValue` cache (holds mV, not raw ADC) was historically refreshed only inside heartbeat/SOS blocks. Boot-time and power-status-change sends read the cache without refreshing it — a reboot mid-outage (before first heartbeat) ships literal `0`. Fixed by sampling `readBatteryVoltage()` immediately before every `sendPowerStatus()` call site. Firmware has no automated test harness — verification is manual call-site trace + real `pio run -e <board>` build. Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — `gcsPath` CHECK constraint regex must allow semver prerelease correctly

Why: Constraint `firmware_release_gcs_path_check` uses POSIX ERE. Correct prerelease group `(-[a-zA-Z0-9][a-zA-Z0-9.]*)?` — a naive `(-[a-zA-Z0-9.]+)?` wrongly accepts a bare dot after hyphen (e.g. `0.2.0-.`). Final path shape (post `20260523075725_relax_gcs_path_semver_prerelease`): `^firmware/[a-z0-9_-]+/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9][a-zA-Z0-9.]*)?/[A-Za-z0-9._-]+\.bin$` — board is lowercase `[a-z0-9_-]+`, no channel segment in the path. Tests in `firmware-gcs-path.spec.ts` cover acceptance/rejection incl. path traversal and uppercase board. Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — legacy `gcsPath` rows can break future CHECK-constraint migrations

Why: `ADD CONSTRAINT` validates existing data at apply time. Migration `20260505000002_fix_firmware_release_gcs_path_constraint` broke on staging/prod-shaped data because pre-Phase-5.6 rows used the legacy `{board}/{version}.bin` format, causing Postgres `23514` violation and an unrecoverable `migrate dev` failure blocking later migrations. No backfill migration existed for old rows. Belongs in (guess): rule (migrations-queue.md) — before `prisma migrate deploy`, check `SELECT "gcsPath" FROM "FirmwareRelease" WHERE "gcsPath" !~ '^firmware/'`; backfill via a NEW forward migration (never edit an already-applied one) if any legacy rows exist, else deploy fails requiring manual `migrate resolve --rolled-back` + cleanup.

## 2026-07-02 — OTA signed-URL `expiresAt` must derive from the same TTL constant as the GCS URL

Why: Response `expiresAt` is computed server-side as `Date.now() + SIGNED_URL_TTL_MS`, NOT extracted from the GCS signed URL's own expiry. If `SIGNED_URL_TTL_MS` (in `@home-pulse-watcher/core`) drifts from the actual GCS TTL, firmware computes a different `expiresAt` and the response HMAC mismatches. Belongs in (guess): PROJECT_CONTEXT

## 2026-07-02 — OTA sig-verification rollout order: backend before firmware

Why: New firmware rejects OTA responses missing `sig`. Old backend doesn't emit `sig`. Deploying sig-verifying firmware before backend sig-emit → every OTA check returns `ParseError` → device stuck. Old firmware safely ignores the unknown `sig` field (JSON parser skips unknown keys), so backend-first is always safe. Belongs in (guess): PROJECT_CONTEXT (deployment/rollout notes)

## 2026-07-02 — shared firmware headers need explicit `<cstdint>`/`<cstddef>` includes

Why: `Arduino.h` pulls in `stdint.h` transitively via the ESP32 toolchain, but a native/clang-analyzer build doesn't have those paths. Any function in `libs/firmware-shared` (e.g. `SecurityUtils.h`) using `uint8_t`/`size_t`/`uint32_t` cascades clang errors without explicit includes. Belongs in (guess): CLAUDE.md (firmware/embedded-cpp-pro section) or a rule

## 2026-07-02 — Cloud Run rate limiting: trust proxy, cold-start reset, per-IP NAT collision

Why: (1) Without `app.set('trust proxy', 1)` (number, not boolean), Cloud Run's LB rewrite makes all requests share one IP → one global throttle bucket, both a DoS risk and a bypass. Boolean `true` trusts the whole XFF chain and is spoofable — don't build a custom `getTracker()` reading leftmost XFF either. (2) `ThrottlerModule.forRoot`'s default in-memory store resets every Cloud Run cold start (~15 min scale-to-zero); acceptable only while min/max instances = 1 — migrate to `@nest-lab/throttler-storage-redis` before scaling horizontally. (3) Per-IP limiting under-serves NAT'd households — multiple ESP32 devices behind one home NAT share a bucket. Post-MVP: add a per-MAC named throttler inside `HmacAuthGuard` after MAC validation. Belongs in (guess): PROJECT_CONTEXT (infra/rate-limiting section) or rules/validation-authorization.md

## 2026-07-03 — `@FileInterceptor` defaults to disk storage, not memory

Why: `@FileInterceptor('file')` without `storage: memoryStorage()` writes the uploaded file to disk and passes `req.file.path` (string path) to the handler, not `req.file.buffer`. If the consumer expects a `Buffer` (e.g., `UploadFirmwareService` takes a `Buffer` argument for GCS upload), the handler receives a path string, fails type checking, and breaks at runtime. Fix: inject `multer`'s `memoryStorage()` into the interceptor options or accept `Readable` stream / path string and read it in the handler. Unit D's admin route initially hit this (typo in interceptor config) — now uses `storage: memoryStorage()` to match the UseCase contract. Belongs in (guess): rules/validation-authorization.md (HTTP boundary layer) or a new rule about upload handler patterns

## 2026-07-03 — CHECK constraints on new columns with DEFAULT are always safe to add

Why: When adding a new column with `@db.String` and `@default("value")`, even if a CHECK constraint is added in the same migration (e.g., `@db.String @default("MAINS") // @db.Char(6)`), Postgres backfills the default to all existing rows **before** enforcing the constraint. The constraint never fails on existing data, even if logically it should (e.g., a default "MAINS" for a field that was semantically NULL before). This is distinct from the already-documented gotcha (KNOWLEDGE_INBOX lines 20-23) where a CHECK constraint is **retrofitted** onto a column with pre-existing heterogeneous data — that one breaks migrations. New columns with defaults + constraints in one migration always succeed; the danger is mutating/removing the default later without data backfill. Belongs in (guess): rules/migrations-queue.md (Prisma migrations section)

## 2026-07-03 — `sendPowerStatus()` response body was never parsed; even stronger backward-compat than OTA response precedent

Why: `firmware/common/main.cpp`'s `sendPowerStatus()` POSTs to `/api/device/status` and receives a JSON response (lines 265–271), but the response body is only logged, never parsed — the firmware ignores all fields in the response and proceeds with its own state. This is an even stronger backward-compatibility guarantee than the OTA-check endpoint (KNOWLEDGE_INBOX lines 30-33), where the response is actively parsed for `sig`/`version`/`url`/`checksum`/`expiresAt`. The `forceOtaCheck` field added in Unit A is safe to emit from the backend immediately and consume only by firmware that explicitly parses it — old firmware versions will silently ignore it without risk of misbehavior. Cross-reference: if any future `/api/device/status` response field **requires** parsing (not just optional), this guarantee no longer holds; document that change in PROJECT_CONTEXT. Belongs in (guess): PROJECT_CONTEXT (deployment/rollout notes) as a reference note, or directly in the `forceOtaCheck` section

## 2026-07-03 — admin HTML pages: no server-side interpolation of DB data; fetch + `textContent` only

Why: `admin-firmware.template.ts` is a static string with zero interpolation — DB-sourced release data (version/board/channel) is fetched client-side and rendered via `createElement`/`textContent`, never `innerHTML` or server-side template literals. This eliminates stored/reflected XSS by construction in bolted-on admin pages without a templating engine. A naive variant interpolating the releases table into the HTML string server-side would be one malicious version-string away from XSS. Convention: any future admin/debug HTML route must follow the same pattern. Belongs in (guess): rules/validation-authorization.md ("no server-side string interpolation of untrusted/DB data into HTML" convention)

## 2026-07-06 — firmware OTA hardware variant is now a runtime flag, not compile-time

Why: `HAS_UPS_MODULE` was converted from a compile-time `#define` (in each board's `config.h`) to a runtime NVS-backed flag `hasUps`, set via the captive-portal setup page (`libs/firmware-shared/include/HomePulse/portal.h`/`portal_html.h`) alongside the device secret, read via `hasUpsModule(const DeviceCredentials&)` in `libs/firmware-shared/include/HomePulse/credentials.h`. `firmware/common/main.cpp`'s 9 `#if HAS_UPS_MODULE` gates became runtime `if (hasUpsModule(creds))` checks. One compiled binary per board (esp32c3, esp32c6) now covers both UPS and MAINS hardware — matches the backend's `FirmwareRelease` model which was already keyed only by `(boardType, channel, version)` with no hardware-variant axis. No rebuild needed to support a different hardware variant; it's a runtime provisioning step now. Belongs in (guess): PROJECT_CONTEXT

## 2026-07-06 — firmware Docker build pipeline gotchas

Why: New `firmware/Dockerfile` + `scripts/firmware-docker-build.sh <board> <version>` build ESP32 firmware reproducibly in Docker. Three non-obvious traps: (1) Unpinned `platform = espressif32` in `platformio.ini` can resolve to a DIFFERENT version inside Docker vs. local build — dependency resolution is not guaranteed reproducible. Fix: always pin `platform =` to an explicit version/commit/tag URL, never a bare package name. (2) `lib_extra_dirs`/`symlink://../../libs/firmware-shared` in `platformio.ini` doesn't resolve inside Docker (relative symlink assumes local filesystem layout) — Dockerfile must copy the shared lib to a fixed path and patch `platformio.ini` to reference it directly. (3) `.dockerignore` exclusion patterns must use `**` for nested paths (e.g. `firmware/**/.pio/`, not root-anchored `/firmware/.pio`) — a root-anchored pattern silently let a real dev `secrets.h` file reach the image layers (security finding, since fixed). Docker containers use explicit `--name home-pulse-firmware-build-<board>` with `docker rm -f <name> 2>/dev/null || true` before each run for idempotent re-runs. Belongs in (guess): PROJECT_CONTEXT or rules/docker-commands.md

## 2026-07-06 — Docker task cleanup: named scopes before aggressive system prune

Why: Repeated Docker builds (e.g. multi-stage PlatformIO + ESP-IDF via `firmware/Dockerfile`) accumulate GBs of intermediate layers and can fill the host disk to ENOSPC without cleanup. Named images/containers built by a task must be explicitly removed with `docker rm -f <name>` / `docker rmi -f <image>:<tag>` immediately after the task. For broader intermediate cleanup, use only non-aggressive `docker image prune -f` / `docker builder prune -f` (no `-a` flag, no `--volumes`). **Never run** `docker system prune -a --volumes` or `docker system prune -af --volumes` without explicit user confirmation — it destroys cached layers and named volumes from unrelated projects, not just the current task's artifacts. Full scoping rule and rationale in `rules/docker-commands.md` section "Docker Cleanup". Belongs in (guess): rules/docker-commands.md (done)

## 2026-07-09 — orchestrator must not pause before mandatory Phase 6 (docs-writer + knowledge capture); CHANGELOG + METRICS paired checklist

Why: Orchestrator has twice stopped right after quality gate closes and asked "should I proceed to docs-writer + knowledge capture?" instead of just dispatching — treating a mandatory pipeline stage as discretionary. Separately, docs/METRICS.md is skipped or filled with guessed-wrong values (Cycles/Fix-Now defaulted to 0 instead of extracted from actual tester/reviewer/security-scanner reports) in at least two sessions, while CHANGELOG.md is always updated correctly because it's the naturally-reached narrative artifact and METRICS is easy to treat as supplementary/optional. The fix: when quality gate closes (pass or pass-after-fix-cycle), dispatch docs-writer for both CHANGELOG.md + docs/METRICS.md in the same turn without pausing for permission — only pause for genuinely optional/destructive actions (committing, pushing, moving task files); pull docs/METRICS.md's Cycles/Fix-Now/Emitted counts from the actual quality-gate agent reports, never default to 0 or guess. Belongs in (guess): rule (rules/workflow.md Phase 6 section; clarify mandatory-not-optional framing and "pull counts from reports, don't guess" instruction)

## 2026-07-09 — `.env` loading: `export $(grep -v '^#' .env | xargs)` fails on multi-line values

Why: The `xargs`-based pattern word-splits the entire file, mangling multi-line values like `GCP_SERVICE_ACCOUNT_KEY` (JSON with embedded `\n` and spaces). Results in `not a valid identifier` errors when shell tries to export fragments like `"type":"service_account"` as variable names. Safe alternative: `set -a && source .env && set +a` (bash parses the file as real shell syntax, correctly handling quotes and newlines). Pattern appears in legacy docs for manual CLI/script setup; updated in README.md, docs/cli-reference.md, docs/admin-guide.md, and a warning added to scripts/backup-database.sh. Belongs in (guess): rule (rules/docker-commands.md or shell-scripting convention doc)

## 2026-07-09 — Alpine `google/cloud-sdk:alpine` doesn't ship version-suffixed postgres client packages matching arbitrary Postgres majors

Why: `apk add postgresql15-client` failed because that Alpine release's repo only had postgres 16/17/18 client packages, not 15. Fix: for a Docker image needing both gcloud/gsutil AND a specific `pg_dump` version, prefer `google/cloud-sdk:slim` (Debian-based) + `apt-get install postgresql-client` — Debian's unversioned metapackage resolves predictably to that Debian release's default version, and `pg_dump` is safely forward-compatible (newer client dumping older server works; the reverse isn't guaranteed) so a Debian release shipping a newer default is fine. Belongs in (guess): rules/docker-commands.md or a new gcloud/docker-tooling rule.

## 2026-07-09 — Debian's `nobody` user has `$HOME=/nonexistent` by design

Why: Any container step needing `nobody` to write files under its home dir (e.g. `gcloud auth activate-service-account`, which writes `~/.config/gcloud`) fails with "Permission denied" trying to create that directory. Fix: don't reuse `nobody` for anything that needs a writable home; create a dedicated non-root user with a real home dir instead (`useradd -m -s /bin/sh <name>` + `ENV HOME=/home/<name>`). Belongs in (guess): rules/docker-commands.md.

## 2026-07-09 — Cloud Scheduler's `--oidc-service-account-email=X` makes X the invoking identity for `run.invoker` purposes

Why: Granting `run.invoker` to the Cloud Scheduler service agent itself (`*@gcp-sa-cloudscheduler.iam.gserviceaccount.com`) is incorrect. The IAM binding actually needed is `run.invoker` on the specific Cloud Run service, granted to whichever SA is named in `--oidc-service-account-email`. Discovered via a security-scanner finding during Batch C's quality gate — the original script granted the wrong identity, which was silently masked by the Cloud Run service having `--allow-unauthenticated` (so it worked anyway, but the IAM code was misleading/broken). Belongs in (guess): PROJECT_CONTEXT (infra/GCP section) or rules/docker-commands.md.

## 2026-07-09 — A value that's a deterministic function of an existing input shouldn't become its own separate secret

Why: Example: `GCS_BACKUP_BUCKET` was initially added as its own required env var/GitHub secret, but its value is always `${PROJECT_ID}-backups` — fully derivable from the already-known/authenticated GCP project. Storing it separately created a manual-sync footgun (the secret could silently drift from what bootstrap actually created). Fix: compute it inline from the authenticated context (`gcloud config get-value project`) rather than duplicating it as configuration. General principle, not backup-specific. Belongs in (guess): rules/code-style.md or a general engineering-principles note.
