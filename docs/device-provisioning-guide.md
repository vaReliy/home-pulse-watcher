# Device Provisioning Guide

This guide covers the complete workflow for setting up ESP32 power monitoring devices with HomePulse Watcher.

## Overview

```
Register Device (CLI) → Get Secret → Flash ESP32 → User Registration → Link Device → Receive Notifications
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

## Step 1: Register Device (Admin)

Register the ESP32 device using its MAC address. This generates a secret key for HMAC authentication.

```bash
node apps/api/dist/cli.js device:register \
  --mac AA:BB:CC:DD:EE:FF \
  --label "Kitchen Sensor"
```

**Output:**

```
=== Device Registered Successfully ===
ID:          b894e613-74ed-474b-ae45-7d5a899fb13f
MAC Address: AA:BB:CC:DD:EE:FF
Label:       Kitchen Sensor

=== IMPORTANT: Save this secret ===
Secret:      f9f9a250ad3b12cddff98fe71f28f7d994b3353b764a297f4f888474eef8c834

This secret will NOT be shown again!
Configure your ESP32 with this secret for HMAC signing.
```

**Save the secret immediately.** It's encrypted in the database and cannot be retrieved later.

### Finding Device MAC Address

The MAC address can be found by:

- Flashing a test sketch that prints `WiFi.macAddress()`
- Reading the label on some ESP32 boards
- Using `esptool.py read_mac`

## Step 2: Configure ESP32 Firmware

Copy the secret and device MAC to your firmware configuration.

1. Navigate to the firmware directory:

   ```bash
   cd firmware/esp32c3  # or esp32c6
   ```

2. Copy the secrets template:

   ```bash
   cp include/secrets.h.example include/secrets.h
   ```

3. Edit `include/secrets.h`:

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

See [firmware/README.md](../firmware/README.md) for detailed build instructions.

## Step 3: User Registration

Users must register with the Telegram bot to receive notifications.

### Option A: Telegram Bot (Recommended)

User sends `/start` to your bot. This creates their account automatically.

### Option B: CLI (Admin)

```bash
node apps/api/dist/cli.js user:create \
  --telegram-id 123456789 \
  --username johndoe
```

To find a user's Telegram ID, they can message [@userinfobot](https://t.me/userinfobot).

## Step 4: Link Device to User

Link the registered device to a user account. This determines who receives notifications.

```bash
node apps/api/dist/cli.js device:link \
  --telegram-id 123456789 \
  --mac AA:BB:CC:DD:EE:FF \
  --role OWNER
```

**Output:**

```
=== Device Linked Successfully ===
Device:      Kitchen Sensor
MAC Address: AA:BB:CC:DD:EE:FF
User:        johndoe
User ID:     8867bdee-bfd6-4158-b8cb-b80e79126958
Role:        OWNER
```

You can identify the user by `--telegram-id` or `--user-id`, and the device by `--mac` or `--device-id`. The default role is `VIEWER` if `--role` is omitted.

### Alternative: Using Prisma Studio

```bash
npx prisma studio
```

Navigate to `UserDevice` table and create a new record:

- `userId`: User's UUID (from Step 3)
- `deviceId`: Device's UUID (from Step 1)
- `role`: `OWNER`, `EDITOR`, or `VIEWER`

### Alternative: Using SQL

```sql
INSERT INTO "UserDevice" ("id", "userId", "deviceId", "role", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'user-uuid-here',
  'device-uuid-here',
  'OWNER',
  NOW(),
  NOW()
);
```

### Roles

| Role     | Permissions                     |
| -------- | ------------------------------- |
| `OWNER`  | Full control, can delete device |
| `EDITOR` | Modify settings, view events    |
| `VIEWER` | Read-only access (default)      |

## Step 5: Verify Setup

### Check Device Link

User sends `/devices` to the bot:

```
Your devices:

🟢 Kitchen Sensor
   MAC: AA:BB:CC:DD:EE:FF
   Role: OWNER
```

### Check Power Status

User sends `/status`:

```
Power Status:

🟢 Kitchen Sensor: ON
   Last seen: 2 minutes ago
```

### Trigger Test Event

Power cycle the monitored circuit. The user should receive a Telegram notification:

```
⚡ Power Status Changed

Device: Kitchen Sensor
Status: 🔴 OFF
Time: 2026-02-05 14:30:45 UTC
```

## Updating Devices

### Change Device Label

**Planned:** `device:update` CLI command.

**Current workaround** (Prisma Studio or SQL):

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

3. Update firmware with new secret and re-flash.

## Removing Devices

### Unlink from User

```sql
DELETE FROM "UserDevice"
WHERE "userId" = 'user-uuid' AND "deviceId" = 'device-uuid';
```

### Delete Device Completely

```sql
-- Remove all user links first
DELETE FROM "UserDevice" WHERE "deviceId" = 'device-uuid';

-- Remove power events (optional, for cleanup)
DELETE FROM "PowerEvent" WHERE "deviceId" = 'device-uuid';

-- Delete device
DELETE FROM "Device" WHERE "id" = 'device-uuid';
```

## HMAC Protocol Reference

ESP32 devices authenticate requests using HMAC-SHA256 signatures.

### Request Headers

| Header         | Description                                     |
| -------------- | ----------------------------------------------- |
| `X-Device-Mac` | Device MAC address (uppercase, colon-separated) |
| `X-Timestamp`  | Unix timestamp in seconds                       |
| `X-Signature`  | HMAC-SHA256 signature (64 hex characters)       |

### Signature Computation

```
payload = MAC + ":" + TIMESTAMP + ":" + STATUS
signature = HMAC-SHA256(device_secret, payload)
```

**Example:**

```
MAC: AA:BB:CC:DD:EE:FF
TIMESTAMP: 1738765845
STATUS: 1

payload = "AA:BB:CC:DD:EE:FF:1738765845:1"
signature = HMAC-SHA256(secret, payload)
```

### Timestamp Tolerance

Requests must have a timestamp within **5 minutes** of server time. Ensure your ESP32 syncs time via NTP.

## Troubleshooting

### HMAC Signature Mismatch

**Error:** `INVALID_SIGNATURE`

- Verify the secret matches exactly (64 hex characters)
- Check MAC address format (uppercase, colons: `AA:BB:CC:DD:EE:FF`)
- Ensure payload format is correct: `MAC:TIMESTAMP:STATUS`
- Verify status is `0` or `1` (integer, not string)

### Timestamp Expired

**Error:** `EXPIRED_TIMESTAMP`

- Sync ESP32 time with NTP server
- Check server timezone configuration
- Verify timestamp is in seconds (not milliseconds)

### Device Not Found

**Error:** `DEVICE_NOT_FOUND`

- Verify MAC address is registered
- Check MAC address case (must match registration)

### Connection Refused

- Verify backend URL is correct
- Check HTTPS certificate validity
- Ensure ESP32 has internet access

### No Notifications

- Verify user has `/start`ed the bot
- Check device is linked to user (`UserDevice` record exists)
- Verify device is sending status updates (check logs)
