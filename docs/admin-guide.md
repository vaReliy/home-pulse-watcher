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

**Planned:** `device:update` CLI command.

**Current workaround** (SQL):

```sql
UPDATE "Device" SET "label" = 'New Label' WHERE "id" = 'device-uuid';
```

### Rotate Device Secret

If a secret is compromised:

1. Delete the device:

   ```sql
   DELETE FROM "UserDevice" WHERE "deviceId" = 'device-uuid';
   DELETE FROM "Device" WHERE "id" = 'device-uuid';
   ```

2. Re-register with the same MAC:

   ```bash
   node apps/api/dist/cli.js device:register --mac AA:BB:CC:DD:EE:FF
   ```

3. Update `secrets.h` with the new secret and re-flash the firmware.

### Remove a Device

```sql
-- Remove user links
DELETE FROM "UserDevice" WHERE "deviceId" = 'device-uuid';

-- Remove power events (optional)
DELETE FROM "PowerEvent" WHERE "deviceId" = 'device-uuid';

-- Delete device
DELETE FROM "Device" WHERE "id" = 'device-uuid';
```

## Troubleshooting

### HMAC Signature Mismatch (`INVALID_SIGNATURE`)

- Verify the secret matches exactly (64 hex characters, no spaces)
- Check MAC address format (uppercase, colons: `AA:BB:CC:DD:EE:FF`)
- Ensure payload format is `MAC:TIMESTAMP:STATUS`
- Verify status is `0` or `1` (integer, not string)

### Timestamp Expired (`EXPIRED_TIMESTAMP`)

- Sync ESP32 time with NTP server
- Verify timestamp is in seconds (not milliseconds)
- Check server timezone configuration

### Device Not Found (`DEVICE_NOT_FOUND`)

- Verify MAC address is registered via `device:list`
- Check MAC address case (must match registration)

### No Notifications

- Verify user has `/start`ed the bot
- Check device is linked to user via `/devices` bot command
- Verify device is sending status updates (check backend logs)
- Ensure `TELEGRAM_BOT_TOKEN` is set correctly
