# Admin Guide

Step-by-step workflow for provisioning ESP32 power monitoring devices with HomePulse Watcher.

## Overview

```
Create User (CLI) -> Register Device (CLI) -> Flash ESP32 -> Link Device (CLI) -> Verify (Telegram)
```

## Prerequisites

1. **Backend running** with environment variables configured:
   - `DATABASE_URL` - PostgreSQL connection string
   - `DEVICE_SECRET_ENCRYPTION_KEY` - 32-byte hex key for AES-256-GCM encryption
   - `TELEGRAM_BOT_TOKEN` - From [@BotFather](https://t.me/BotFather)

2. **Generate encryption key** (if not set):

   ```bash
   openssl rand -hex 32
   ```

3. **Database migrated**:

   ```bash
   npx prisma migrate deploy
   ```

4. **API built**:

   ```bash
   npx nx build api
   ```

5. **Environment loaded** (local development):
   ```bash
   set -a && source .env && set +a
   ```

> **Docker alternative:** If you don't have Node.js installed locally, all CLI commands can run inside the Docker admin container (includes gcloud SDK). See [Running Admin CLI in a Container](#running-admin-cli-in-a-container) at the end of this guide.

## Step 1: Create User Account

Create the user who will receive Telegram notifications.

```bash
node apps/api/dist/cli.js user:create \
  --telegram-id 123456789 \
  --username johndoe
```

To find a user's Telegram ID, they can message [@userinfobot](https://t.me/userinfobot).

Alternatively, users can self-register by sending `/start` to your Telegram bot.

**Verify:** List users to confirm:

```bash
node apps/api/dist/cli.js user:list
```

See [CLI Reference](./cli-reference.md#usercreate) for full options.

## Step 2: Register Device

Register the ESP32 device by its MAC address. This generates the HMAC secret.

```bash
node apps/api/dist/cli.js device:register \
  --mac AA:BB:CC:DD:EE:FF \
  --label "Kitchen Sensor"
```

**Save the secret immediately.** It is encrypted in the database and cannot be retrieved later.

### Finding the MAC Address

- Flash a test sketch that prints `WiFi.macAddress()`
- Read the label on some ESP32 boards
- Use `esptool.py read_mac`

See [CLI Reference](./cli-reference.md#deviceregister) for full options.

## Step 3: Configure and Flash Firmware

1. Navigate to the firmware directory:

   ```bash
   cd firmware/esp32c3  # or esp32c6
   ```

2. Build and flash (no secrets file needed):

   ```bash
   pio run -t upload
   ```

3. Provision via captive portal:

   On first boot the device broadcasts a `HomePulse-Setup-XXXX` Wi-Fi AP (last 4 hex digits of the MAC address). The AP is protected by a WPA2 password derived from the device MAC — look for it in the Serial monitor output:

   ```
   [Portal] AP started: HomePulse-Setup-EEFF  password: CCDDEEFF
   ```

   The password is the **last 8 hex digits of the MAC address**, uppercased (e.g. MAC `AA:BB:CC:DD:EE:FF` → password `CCDDEEFF`). Connect to the AP using that password, then open `http://192.168.4.1`. Fill in:

   | Field          | Value                                     |
   | -------------- | ----------------------------------------- |
   | Wi-Fi SSID     | Your network name                         |
   | Wi-Fi Password | Your network password                     |
   | Device Secret  | 64-char hex string (from Step 1)          |
   | Backend URL    | `https://your-server.com` (base URL only) |

   After saving, the device reboots and connects automatically. Credentials are stored in NVS (non-volatile flash) and persist across reboots and reflashes.

   > **Dev shortcut**: Copy `include/secrets.h.example` to `include/secrets.h`, fill in the values, and rebuild. If `secrets.h` exists at compile time, its values are written to NVS on the first boot (when NVS is empty) — the captive portal is skipped. Do **not** commit `secrets.h` to version control.

   > **Factory reset**: Hold the BOOT button (GPIO9) for 10 s. The LED flashes SOS, credentials are cleared, and the captive portal restarts with the same MAC-derived password.

See [Flashing Guide](../firmware/docs/FLASHING_GUIDE.md) for detailed PlatformIO setup, USB drivers, and troubleshooting upload issues.

## Step 4: Link Device to User

Connect the device to the user account so they receive notifications.

```bash
node apps/api/dist/cli.js device:link \
  --telegram-id 123456789 \
  --mac AA:BB:CC:DD:EE:FF \
  --role OWNER
```

You can identify the user by `--telegram-id` or `--user-id`, and the device by `--mac` or `--device-id`. The default role is `VIEWER` if `--role` is omitted.

### Roles

| Role     | Permissions                     |
| -------- | ------------------------------- |
| `OWNER`  | Full control, can delete device |
| `EDITOR` | Modify settings, view events    |
| `VIEWER` | Read-only access (default)      |

See [CLI Reference](./cli-reference.md#devicelink) for full options.

## Step 5: Verify End-to-End

1. **Telegram bot:** User sends `/start` to the bot (if not done already).

2. **Check linked devices:** User sends `/devices`:

   ```
   Your devices:

   Kitchen Sensor
   MAC: AA:BB:CC:DD:EE:FF
   Role: OWNER
   ```

3. **Check power status:** User sends `/status`:

   ```
   Power Status:

   Kitchen Sensor: ON
   Last seen: 2 minutes ago
   ```

4. **Test notification:** Power cycle the monitored circuit. The user should receive:

   ```
   Power Status Changed

   Device: Kitchen Sensor
   Status: OFF
   Time: 2026-02-05 14:30:45 UTC
   ```

See [Database Backup & Recovery](db-backup-recovery.md) for automated backups, point-in-time recovery, restore procedures, and migration rollback.

## Maintenance

### Change Device Label

```bash
node apps/api/dist/cli.js device:update \
  --mac AA:BB:CC:DD:EE:FF \
  --label "New Label"
```

See [CLI Reference](./cli-reference.md#deviceupdate) for full options.

### Rotate Device Secret

If a secret is compromised:

1. Rotate the secret:

   ```bash
   node apps/api/dist/cli.js device:rotate-secret --mac AA:BB:CC:DD:EE:FF
   ```

2. **Save the new secret immediately.** It will not be shown again.

3. Update `secrets.h` with the new secret and re-flash the firmware.

Device history and user links are preserved.

See [CLI Reference](./cli-reference.md#devicerotate-secret) for full options.

### Remove a Device

```bash
node apps/api/dist/cli.js device:delete --mac AA:BB:CC:DD:EE:FF
```

This removes all user links and power events for the device.

See [CLI Reference](./cli-reference.md#devicedelete) for full options.

## Hardware: Power Sense Circuit

Two hardware variants are supported. Choose based on your needs:

| Variant              | Use Case                                           | Guide                                             |
| -------------------- | -------------------------------------------------- | ------------------------------------------------- |
| **Standard V2.1**    | Grid-only monitoring (no battery)                  | [docs/hardware/standard.md](hardware/standard.md) |
| **UPS Edition V2.3** | Battery backup — ESP32 stays online during outages | [docs/hardware/ups.md](hardware/ups.md)           |

Both variants use the **same compiled firmware binary** — there is a single binary per board type (ESP32-C3 or ESP32-C6). The hardware variant (Standard vs. UPS) is provisioned at setup time via a captive-portal checkbox, which sets a runtime NVS flag (`hasUps`). No rebuild needed when switching hardware. The UPS edition adds a dual-diode OR-gate for battery failover while keeping the power sensor isolated from the backup supply.

> For ADC thresholds, voltage divider formula, and calibration — see the hardware guide for your variant.

## Troubleshooting

### HMAC Signature Mismatch (`INVALID_SIGNATURE`)

The server found the device and decrypted the stored secret, but the HMAC signature from the ESP32 doesn't match the expected value.

**Common causes:**

1. **Secret mismatch** — the `DEVICE_SECRET` in `secrets.h` doesn't exactly match the 64-character hex string printed during `device:register`. Copy-paste errors, trailing whitespace, or truncation are frequent culprits.
2. **MAC address format mismatch** — `DEVICE_MAC` in `secrets.h` differs from the registered MAC. Must be uppercase with colons: `AA:BB:CC:DD:EE:FF`.
3. **Encryption key changed** — if `DEVICE_SECRET_ENCRYPTION_KEY` was regenerated after devices were registered, decryption produces invalid data. This usually shows as `Failed to decrypt device secret` in logs, but can sometimes surface as a signature mismatch.

**Diagnostic steps:**

1. Check the log line before the error — if you see the Prisma query returning a device, it means the MAC matched and decryption succeeded.
2. Verify `DEVICE_SECRET` in `secrets.h` is exactly 64 hex characters with no trailing spaces or newlines.
3. Verify `DEVICE_MAC` in `secrets.h` matches the registered MAC (uppercase, colon-separated).
4. Confirm the ESP32 is sending `status` as an integer (`0` or `1`) in the JSON body.

**Resolution:**

- **Rotate the secret** (preserves device history and user links):

  ```bash
  node apps/api/dist/cli.js device:rotate-secret --mac AA:BB:CC:DD:EE:FF
  ```

  Copy the new secret to `secrets.h` and re-flash the firmware.

- **Re-register** (if rotation doesn't help — clears all device data):
  ```bash
  node apps/api/dist/cli.js device:delete --mac AA:BB:CC:DD:EE:FF
  node apps/api/dist/cli.js device:register --mac AA:BB:CC:DD:EE:FF --label "My Sensor"
  ```
  Copy the new secret, update `secrets.h`, re-flash, then re-link the device to the user.

### Timestamp Expired (`EXPIRED_TIMESTAMP`)

- Sync ESP32 time with NTP server
- Verify timestamp is in seconds (not milliseconds)
- Check server timezone configuration

### Device Not Found (`DEVICE_NOT_FOUND`)

- Verify MAC address is registered via `device:list`
- Check MAC address case (must match registration)

### No Bot Response on Cloud Run

The Telegram bot uses webhooks in production. If commands like `/status` get no response:

1. **Check webhook status:**

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```

   If `url` is empty, the webhook was cleared.

2. **Common cause — local dev clears production webhook:**

   Telegraf's polling mode (`bot.launch()`) internally calls `deleteWebhook`. If the same bot token is used for local development and production, running the app locally wipes the production webhook.

   **Prevention:** Use separate bot tokens for development and production (create a second bot via [@BotFather](https://t.me/BotFather)).

3. **Re-register the webhook manually:**

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<CLOUD_RUN_URL>/api/telegram/webhook"
   ```

   Or redeploy — the webhook is re-registered automatically on startup.

4. **Webhook security:** Set `TELEGRAM_WEBHOOK_SECRET` in GCP Secret Manager to validate that incoming webhook requests originate from Telegram (via the `X-Telegram-Bot-Api-Secret-Token` header).

## Running Admin CLI in a Container

If you don't have Node.js or gcloud SDK installed locally, all CLI commands can run inside the Docker admin container.

### Prerequisites

1. **gcloud authenticated** (one-time):

   ```bash
   gcloud auth application-default login
   ```

   This creates credentials at `~/.config/gcloud`, which the container mounts as read-only.

2. **Application built**:

   ```bash
   npx nx build api
   ```

3. **Admin container image built**:

   ```bash
   docker compose --profile admin build admin
   ```

### Usage

Run any CLI command with `docker compose --profile admin run --rm admin`:

```bash
# Create a user
docker compose --profile admin run --rm admin user:create \
  --telegram-id 123456789 \
  --username johndoe

# List users
docker compose --profile admin run --rm admin user:list

# Register a device
docker compose --profile admin run --rm admin device:register \
  --mac AA:BB:CC:DD:EE:FF \
  --label "Kitchen Sensor"

# Link device to user
docker compose --profile admin run --rm admin device:link \
  --telegram-id 123456789 \
  --mac AA:BB:CC:DD:EE:FF \
  --role OWNER

# Upload firmware to GCS
docker compose --profile admin run --rm admin firmware:upload \
  --file /firmware/esp32c3-v0.2.0.bin \
  --version 0.2.0 \
  --board esp32c3 \
  --channel BETA
```

**Firmware files:** Place binary files in `./tmp/firmware/` — the container has this mounted at `/firmware`. Reference them in commands as `/firmware/<name>.bin`.

### Authentication

The container uses **Application Default Credentials (ADC)** from your host's gcloud installation. Leave `GCP_SERVICE_ACCOUNT_KEY` empty in `.env` for ADC to activate automatically.

If you need to use a specific GCP service account instead:

```bash
export GCP_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
docker compose --profile admin run --rm admin firmware:upload ...
```

See [CLI Reference](./cli-reference.md) for all available commands.

## Post-Deploy Setup (GCP Console)

One-time steps to complete after the first Cloud Run deployment.

### 1. Create Webhook Secret

This secret validates that incoming webhook requests originate from Telegram.

1. Open [Secret Manager](https://console.cloud.google.com/security/secret-manager) in GCP Console
2. Click **Create Secret**
3. **Name:** `telegram-webhook-secret`
4. **Secret value:** Generate a random 64-character hex string (e.g. using a password generator or running `openssl rand -hex 32` locally)
5. Click **Create**

The deploy workflow will automatically mount this secret as the `TELEGRAM_WEBHOOK_SECRET` env var on the next deploy.

### 2. Create Keep-Warm Scheduler Job

Cloud Run scales to zero after ~15 minutes of inactivity. A scheduler job pings the health endpoint to keep the instance warm for responsive Telegram bot interactions.

1. Open [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler) in GCP Console
2. Click **Create Job**
3. Fill in:
   - **Name:** `home-pulse-keep-warm`
   - **Region:** `europe-west3` (same as your Cloud Run service)
   - **Frequency:** `*/15 * * * *` (every 15 minutes)
   - **Timezone:** any (e.g. `UTC`)
4. Click **Continue**, then configure the target:
   - **Target type:** HTTP
   - **URL:** `https://<your-cloud-run-url>/api`
   - **HTTP method:** GET
5. Expand **Advanced** (optional):
   - **Attempt deadline:** 30s
6. Click **Create**

Free tier includes 3 scheduler jobs. This job sends 96 requests/day — negligible resource usage.

### 3. Create a Development Bot Token

Using the same bot token for local development and production can cause the production webhook to be deleted when running locally.

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow the prompts to create a development bot (e.g. `HomePulse Dev`)
3. Copy the token and set it as `TELEGRAM_BOT_TOKEN` in your local `.env` file
4. Keep the production bot token only in GCP Secret Manager

## Publishing a Firmware Release

Use the `firmware:upload` CLI command to publish a new firmware binary. It uploads the file to GCS and creates a `FirmwareRelease` DB record in one step. Devices discover the new release on their next OTA check (every 6 hours, or on boot).

### Prerequisites

- GCS bucket configured (`GCS_BUCKET_NAME` env var).
- GCS credentials available — one of:
  - `GCP_SERVICE_ACCOUNT_KEY` in `.env` (production service account JSON), or
  - Application Default Credentials via `gcloud auth application-default login` (local dev).
- Database running and `DATABASE_URL` set.
- Firmware binary built with PlatformIO (`pio run -d firmware/esp32c6`).

### Workflow

1. Build the firmware binary:

   ```bash
   cd firmware/esp32c6   # or esp32c3
   pio run
   # output: .pio/build/esp32c6/firmware.bin
   ```

2. Copy the binary to `./tmp/firmware/` and rename it with the version:

   ```bash
   mkdir -p tmp/firmware
   cp firmware/esp32c6/.pio/build/esp32c6/firmware.bin \
      tmp/firmware/esp32c6-v0.2.0.bin
   ```

3. Upload and register:

   ```bash
   # Load environment
   set -a && source .env && set +a

   node apps/api/dist/cli.js firmware:upload \
     --file esp32c6-v0.2.0.bin \
     --version 0.2.0 \
     --board esp32c6 \
     --channel STABLE
   ```

4. Confirm output shows the GCS path (e.g. `firmware/esp32c6/0.2.0/esp32c6-v0.2.0.bin`).

Devices set to the same channel will download and apply the release on their next OTA check without any additional action.

### Using Docker (admin profile)

See the Docker admin profile docs (task 05) for running `firmware:upload` inside a container with ADC credentials mounted from the host.

### Idempotency

- Uploading the same version + board combination twice is rejected (GCS 412 + DB unique constraint).
- To re-publish, use a new version tag or delete the existing GCS object and DB row manually.

## OTA TLS Certificate

OTA binary downloads verify the server certificate against the **Google Trust Services Root R1** CA. The PEM is embedded in `libs/firmware-shared/include/HomePulse/gts_root_ca.h`.

| Field   | Value                                   |
| ------- | --------------------------------------- |
| Subject | GTS Root R1 (Google Trust Services LLC) |
| Source  | https://pki.goog/roots.pem              |
| Expires | **2036-06-22**                          |

### Rotation procedure

If TLS handshake fails after expiry (or if Google rotates the root early):

1. Download the replacement PEM from https://pki.goog/repository/.
2. Replace the cert string in `libs/firmware-shared/include/HomePulse/gts_root_ca.h`.
3. Update the `Expires` line in this table.
4. Build and release new firmware via the standard `firmware:upload` pipeline.

## OTA Rollback Flow

### How it works

1. A new firmware binary is flashed over-the-air.
2. The ESP32 bootloader boots the new image in `ESP_OTA_IMG_PENDING_VERIFY` state.
3. The firmware counts successful heartbeats (HMAC-signed POSTs to `/api/device/status`).
4. After **≥ 3 heartbeats AND ≥ 5 minutes uptime**, it calls `esp_ota_mark_app_valid_cancel_rollback()`.
5. If the firmware crashes, reboots, or fails to reach the backend within the grace period, the bootloader detects the uncleared `PENDING_VERIFY` flag and **automatically boots the previous firmware** on the next restart.

> The grace period ensures a firmware with a memory leak, WiFi regression, or crash-loop cannot survive long enough to mark itself valid.

### Monitoring validation in serial logs

Connect to the device serial port (115200 baud). Key log lines:

```
[OTA] Checking for update...
[OTA] Update available: 3.6.0
[OTA] Flash OK, rebooting.
... (device reboots into new firmware) ...
Heartbeat sent          ← count 1
Heartbeat sent          ← count 2
Heartbeat sent          ← count 3 + uptime ≥ 5 min
[OTA] App validated, rollback cancelled.
```

If validation does **not** complete within the grace period, the next reboot will restore the previous firmware. No manual action required.

### Detecting a rollback

After a suspected rollback, check the serial log on the next boot. If the reported `FIRMWARE_VERSION` is lower than the deployed version, the rollback triggered. Common causes:

- Firmware crashes early (check for exception/backtrace in serial output)
- WiFi or backend unreachable during the first 5 minutes (transient network issue)
- New firmware introduced a regression that prevents heartbeat sends

### Abort events during flash

All flash-abort events log `[OTA][ABORT]` to serial output. To grep:

```bash
# If using pio device monitor piped to a log file:
grep '\[OTA\]\[ABORT\]' serial.log
```

Causes logged: stream stall (>30 s), short read, flash write failure, SHA-256 mismatch.

### Manual rollback (emergency)

If the new firmware boots and marks itself valid (logged as `[OTA] App validated`) but later proves defective, the bootloader auto-revert is no longer available. Options:

1. **Re-deploy previous version** via the `firmware:upload` CLI command (creates a new `FirmwareRelease`) — the device will pick it up on the next OTA check (every 6 hours) or on next boot.
2. **USB re-flash** using PlatformIO: `pio run -t upload -d firmware/esp32c3` (or `esp32c6`).

## Related Guides

- [Database Backup & Recovery](db-backup-recovery.md) — automated backups, PITR, restore, and rollback
- [Manually inserting a FirmwareRelease record](firmware-release-manual-insert.md) — dev/testing shortcut
