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
   export $(grep -v '^#' .env | xargs)
   ```

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

2. Copy the secrets template:

   ```bash
   cp include/secrets.h.example include/secrets.h
   ```

3. Edit `include/secrets.h` with the credentials from Steps 1-2:

   ```cpp
   #define WIFI_SSID "your-wifi-network"
   #define WIFI_PASSWORD "your-wifi-password"
   #define DEVICE_MAC "AA:BB:CC:DD:EE:FF"
   #define DEVICE_SECRET "f9f9a250ad3b12cddff98fe71f28f7d994b3353b764a297f4f888474eef8c834"
   #define BACKEND_URL "https://your-server.com/api/device/status"
   ```

4. Build and flash:
   ```bash
   pio run -t upload
   ```

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

### Voltage Divider Wiring

The ESP32 monitors grid power via a 5V USB adapter and a resistive voltage divider:

```
5V USB Adapter (powered by grid)
        │
       [R1]  10kΩ
        │
        ├──── GPIO 2 (ADC input)
        │                 │
       [R2]  10kΩ       [C1] 0.1µF ceramic
        │                 │
        └────┬────────────┘
             │
            GND
```

- **Full grid power (5V adapter):** 5V × 10k/(10k+10k) = 2.5V at GPIO → ADC ~3100
- **Brownout (~3V adapter):** 3V × 10k/20k = 1.5V → ADC ~1860 (hysteresis band, ignored)
- **Grid down (0V adapter):** 0V → ADC ~0

The 0.1µF ceramic capacitor across R2 filters high-frequency EMI noise on the ADC input, preventing false readings from floating-input antenna effects.

### ADC Thresholds and Anti-Flapping

The firmware uses a three-zone hysteresis model to prevent false triggers during brownouts:

| ADC Range   | Voltage (approx) | Interpretation        |
| ----------- | ---------------- | --------------------- |
| 2200 - 4095 | 1.75V - 3.3V     | Power ON (confirmed)  |
| 1001 - 2199 | 0.8V - 1.75V     | Hysteresis (ignored)  |
| 0 - 1000    | 0V - 0.8V        | Power OFF (confirmed) |

Additional protections:

- **Confirmation window:** State must persist for 10 consecutive readings (10 × 100ms = 1s), tolerating up to 3 noise spikes
- **Cooldown:** Minimum 30s between transitions (firmware) + 30s server-side debounce
- **Voltage logging:** Each status report includes the raw ADC value for diagnostics

### Calibrating Thresholds

If your voltage divider uses different resistor values, adjust `ADC_THRESHOLD_HIGH` and `ADC_THRESHOLD_LOW` in `config.h`:

1. Flash firmware and monitor serial output
2. Observe ADC values during normal operation (should be ~3100 with the 10k/10k divider)
3. Simulate brownout (use a variable power supply or long extension cord under load)
4. Set `ADC_THRESHOLD_HIGH` above brownout ADC values
5. Set `ADC_THRESHOLD_LOW` well below the lowest brownout reading
6. Keep a wide hysteresis band (at least 500 ADC units) to absorb noise

### Hardware Evolution

| Version                        | Divider     | Capacitor               | Notes                                                                                                                            |
| ------------------------------ | ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **V2.1 (Current/Recommended)** | 10kΩ / 10kΩ | 0.1µF ceramic across R2 | Eliminates ghost events from EMI noise on the ADC input                                                                          |
| **V2.0 (Legacy)**              | 10kΩ / 20kΩ | None                    | Prone to "Ghost Power ON" events — high-impedance floating input acts as an antenna, picking up EMI that causes false ADC spikes |

If you are building a new sensor, use V2.1. If you have an existing V2.0 sensor experiencing ghost events, add a 0.1µF ceramic capacitor between GPIO 2 and GND, and replace R2 with a 10kΩ resistor.

## Troubleshooting

### Ghost Power ON Events

The device reports power restored when the grid is actually still down. This typically manifests as rapid ON/OFF pairs in the event history.

**Cause:** The ADC input is floating at high impedance when the USB adapter is off. The long wire between the adapter and the voltage divider acts as an antenna, picking up EMI (from nearby motors, switching power supplies, etc.) that causes the ADC to briefly spike above `ADC_THRESHOLD_HIGH`.

**Solution:** Upgrade to V2.1 hardware — add a 0.1µF ceramic capacitor between GPIO 2 and GND. This filters high-frequency noise and eliminates the ghost readings. See the [Hardware Evolution](#hardware-evolution) table above for details.

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

### No Notifications

- Verify user has `/start`ed the bot
- Check device is linked to user via `/devices` bot command
- Verify device is sending status updates (check backend logs)
- Ensure `TELEGRAM_BOT_TOKEN` is set correctly

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
