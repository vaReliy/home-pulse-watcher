# CLI Reference

HomePulse Watcher provides CLI commands for device provisioning and user management.

## Running CLI Commands

### Local Development (recommended)

`npx nx run api:cli` builds `dist/cli.js` if stale and auto-loads the root `.env` — no manual export needed:

```bash
npx nx run api:cli -- <command> [options]
```

### Local Development (manual)

```bash
npx nx build api
set -a && source .env && set +a
node apps/api/dist/cli.js <command> [options]
```

### Docker (Production)

```bash
# If API container is running
docker exec -it home-pulse-api node /srv/dist/cli.js <command> [options]

# Or run dedicated CLI container
docker run --rm \
  --env-file .env \
  --network host \
  home-pulse-watcher:latest \
  node /srv/dist/cli.js <command> [options]
```

## Commands

### device:register

Register a new ESP32 device for power monitoring.

**Usage:**

```bash
node apps/api/dist/cli.js device:register --mac <mac> [--label <label>]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-m, --mac <mac>` | Yes | Device MAC address (format: AA:BB:CC:DD:EE:FF) | | `-l, --label <label>` | No | Human-readable device label (max 100 chars) |

**Example:**

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

**Error Cases:**

- `DEVICE_ALREADY_REGISTERED` - A device with this MAC address already exists
- `VALIDATION_ERROR` - Invalid MAC address format

---

### device:list

List registered devices for a user.

**Usage:**

```bash
node apps/api/dist/cli.js device:list --user-id <uuid>
node apps/api/dist/cli.js device:list --telegram-id <telegramId>
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-u, --user-id <uuid>` | No\* | User UUID to filter devices | | `-t, --telegram-id <telegramId>` | No\* | User's Telegram ID (alternative to `--user-id`) |

\* At least one of `--user-id` or `--telegram-id` is required.

**Examples:**

```bash
# By user ID
node apps/api/dist/cli.js device:list \
  --user-id 8867bdee-bfd6-4158-b8cb-b80e79126958

# By Telegram ID
node apps/api/dist/cli.js device:list \
  --telegram-id 123456789
```

**Output:**

```
Devices for user 8867bdee-bfd6-4158-b8cb-b80e79126958:

ID                                      MAC Address         Label               Status
----------------------------------------------------------------------------------------------------
b894e613-74ed-474b-ae45-7d5a899fb13f    AA:BB:CC:DD:EE:FF   Kitchen Sensor      OFFLINE

Total: 1 device(s)
```

---

### device:link

Link an ESP32 device to a user account.

**Usage:**

```bash
node apps/api/dist/cli.js device:link [options]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-t, --telegram-id <id>` | No* | User's Telegram ID | | `-u, --user-id <uuid>` | No* | User's UUID | | `-m, --mac <mac>` | No** | Device MAC address (format: AA:BB:CC:DD:EE:FF) | | `-d, --device-id <uuid>` | No** | Device UUID | | `-r, --role <role>` | No | Role: OWNER, EDITOR, VIEWER (default: VIEWER) |

\* At least one of `--telegram-id` or `--user-id` is required. \*\* At least one of `--mac` or `--device-id` is required.

**Example:**

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

**Error Cases:**

- `DEVICE_ALREADY_LINKED` - This device is already linked to the specified user
- `NOT_FOUND` - User or device not found with the given identifier
- `VALIDATION_ERROR` - Invalid input format or missing required identifiers

---

### device:unlink

Remove a user's access to a device without affecting other users linked to the same device.

**Usage:**

```bash
node apps/api/dist/cli.js device:unlink [options]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-t, --telegram-id <id>` | No\* | User's Telegram ID | | `-u, --user-id <uuid>` | No\* | User's UUID | | `-m, --mac <mac>` | No\*\* | Device MAC address (format: AA:BB:CC:DD:EE:FF) | | `-d, --device-id <uuid>` | No\*\* | Device UUID |

\* At least one of `--telegram-id` or `--user-id` is required. \*\* At least one of `--mac` or `--device-id` is required.

**Example:**

```bash
node apps/api/dist/cli.js device:unlink \
  --telegram-id 123456789 \
  --mac AA:BB:CC:DD:EE:FF
```

**Output:**

```
=== Device Unlinked Successfully ===
Device:      Kitchen Sensor
MAC Address: AA:BB:CC:DD:EE:FF
User:        johndoe
User ID:     8867bdee-bfd6-4158-b8cb-b80e79126958
```

**Error Cases:**

- `DEVICE_NOT_LINKED` - This device is not linked to the specified user
- `NOT_FOUND` - User or device not found with the given identifier
- `VALIDATION_ERROR` - Invalid input format or missing required identifiers

---

### device:update

Update device information (label).

**Usage:**

```bash
node apps/api/dist/cli.js device:update [options]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-m, --mac <mac>` | No\* | Device MAC address (format: AA:BB:CC:DD:EE:FF) | | `-d, --device-id <uuid>` | No\* | Device UUID | | `-l, --label <label>` | Yes | New human-readable device label (max 100 chars) |

\* At least one of `--mac` or `--device-id` is required.

**Example:**

```bash
node apps/api/dist/cli.js device:update \
  --mac AA:BB:CC:DD:EE:FF \
  --label "Living Room Sensor"
```

**Output:**

```
=== Device Updated Successfully ===
ID:          b894e613-74ed-474b-ae45-7d5a899fb13f
MAC Address: AA:BB:CC:DD:EE:FF
Label:       Living Room Sensor
```

**Error Cases:**

- `NOT_FOUND` - Device not found with the given identifier
- `VALIDATION_ERROR` - Invalid input format or missing required identifiers

---

### device:delete

Delete a device and all its associations (user links, power events).

**Usage:**

```bash
node apps/api/dist/cli.js device:delete [options]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-m, --mac <mac>` | No\* | Device MAC address (format: AA:BB:CC:DD:EE:FF) | | `-d, --device-id <uuid>` | No\* | Device UUID |

\* At least one of `--mac` or `--device-id` is required.

**Example:**

```bash
node apps/api/dist/cli.js device:delete \
  --mac AA:BB:CC:DD:EE:FF
```

**Output:**

```
=== Device Deleted Successfully ===
ID:              b894e613-74ed-474b-ae45-7d5a899fb13f
MAC Address:     AA:BB:CC:DD:EE:FF
Label:           Kitchen Sensor
User links:      1 removed
Power events:    42 removed
```

**Error Cases:**

- `NOT_FOUND` - Device not found with the given identifier
- `VALIDATION_ERROR` - Invalid input format or missing required identifiers

---

### device:rotate-secret

Generate a new HMAC secret for a device, replacing the existing one. The device's history and user links are preserved.

**Usage:**

```bash
node apps/api/dist/cli.js device:rotate-secret [options]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-m, --mac <mac>` | No\* | Device MAC address (format: AA:BB:CC:DD:EE:FF) | | `-d, --device-id <uuid>` | No\* | Device UUID |

\* At least one of `--mac` or `--device-id` is required.

**Requires:** `DEVICE_SECRET_ENCRYPTION_KEY` environment variable.

**Example:**

```bash
node apps/api/dist/cli.js device:rotate-secret \
  --mac AA:BB:CC:DD:EE:FF
```

**Output:**

```
=== Device Secret Rotated Successfully ===
ID:          b894e613-74ed-474b-ae45-7d5a899fb13f
MAC Address: AA:BB:CC:DD:EE:FF
Label:       Kitchen Sensor

=== IMPORTANT: Save this secret ===
Secret:      a1b2c3d4e5f6...

This secret will NOT be shown again!
Update secrets.h on the ESP32 and re-flash the firmware.
```

**Error Cases:**

- `NOT_FOUND` - Device not found with the given identifier
- `VALIDATION_ERROR` - Invalid input format or missing required identifiers

---

### user:create

Create a new user from Telegram ID.

**Usage:**

```bash
node apps/api/dist/cli.js user:create --telegram-id <id> [--username <username>]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-t, --telegram-id <id>` | Yes | Telegram user ID | | `-u, --username <username>` | No | Telegram username (max 100 chars) |

**Example:**

```bash
node apps/api/dist/cli.js user:create \
  --telegram-id 123456789 \
  --username johndoe
```

**Output:**

```
=== User Created Successfully ===
ID:          8867bdee-bfd6-4158-b8cb-b80e79126958
Telegram ID: 123456789
Username:    johndoe
Created At:  2026-01-28T21:38:57.936Z
```

**Error Cases:**

- `USER_ALREADY_EXISTS` - A user with this Telegram ID already exists
- `VALIDATION_ERROR` - Invalid input format

---

### user:list

List registered users.

**Usage:**

```bash
node apps/api/dist/cli.js user:list [--username <username>]
```

**Options:** | Option | Required | Description | |--------|----------|-------------| | `-u, --username <username>` | No | Filter by username (partial match) |

**Examples:**

```bash
# List all users
node apps/api/dist/cli.js user:list

# Filter by username
node apps/api/dist/cli.js user:list --username john
```

**Output:**

```
All registered users:

ID                                      Telegram ID         Username            Created At
----------------------------------------------------------------------------------------------------
8867bdee-bfd6-4158-b8cb-b80e79126958    123456789           johndoe             2026-01-28T21:38:57.936Z

Total: 1 user(s)
```

---

## Help

View all available commands:

```bash
node apps/api/dist/cli.js --help
```

View help for a specific command:

```bash
node apps/api/dist/cli.js device:register --help
```

### firmware:upload

Upload a compiled firmware binary to GCS and register it as a `FirmwareRelease` in the database. Devices discover new releases on their next OTA check.

**Usage:**

```bash
node apps/api/dist/cli.js firmware:upload \
  --file <path-or-basename> \
  --version <semver> \
  --board <board> \
  --channel <channel> \
  [--critical]
```

**Options:**

| Option                    | Required | Description                                                             |
| ------------------------- | -------- | ----------------------------------------------------------------------- |
| `-f, --file <file>`       | Yes      | Path to firmware `.bin`, or bare filename searched in `./tmp/firmware/` |
| `-v, --version <version>` | Yes      | Semantic version tag (e.g. `0.2.0` or `0.2.0-beta.1`)                   |
| `-b, --board <board>`     | Yes      | Board type: `esp32c3` or `esp32c6`                                      |
| `-c, --channel <channel>` | Yes      | Release channel: `ALPHA`, `BETA`, or `STABLE`                           |
| `--critical`              | No       | Mark as critical — all devices on the channel must update               |

**GCS credentials** — two paths (configured via environment):

- `GCP_SERVICE_ACCOUNT_KEY` set → explicit service account JSON (production).
- Not set → [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) (`gcloud auth application-default login`).

**GCS object path** (convention used for all releases):

```
firmware/<board>/<version>/<filename>
```

**Examples:**

```bash
# Upload a BETA release (file in default ./tmp/firmware/)
node apps/api/dist/cli.js firmware:upload \
  --file esp32c6-v0.2.0.bin \
  --version 0.2.0 \
  --board esp32c6 \
  --channel BETA

# Upload using an absolute path and mark critical
node apps/api/dist/cli.js firmware:upload \
  --file /build/output/esp32c6-v0.3.0.bin \
  --version 0.3.0 \
  --board esp32c6 \
  --channel STABLE \
  --critical
```

**Output on success:**

```
Uploading esp32c6-v0.2.0.bin (156432 bytes) → firmware/esp32c6/0.2.0/esp32c6-v0.2.0.bin

=== Firmware Release Created ===
ID:         550e8400-e29b-41d4-a716-446655440000
Version:    0.2.0
Board:      esp32c6
Channel:    BETA
Critical:   no
Checksum:   a3f5...
GCS Path:   firmware/esp32c6/0.2.0/esp32c6-v0.2.0.bin

Devices on this channel will discover this release on their next OTA check.
```

**Note:** Signed URLs are not printed to stdout to avoid capture in shell history or CI logs — they are authentication credentials. Use the backend `/api/ota/check` endpoint for secure delivery.

**Error cases:**

| Situation                                   | Exit code | Message                                  |
| ------------------------------------------- | --------- | ---------------------------------------- |
| File not found                              | 1         | `File not found: <path>`                 |
| Invalid semver / board / channel            | 1         | `Validation failed: ...`                 |
| GCS object already at that path             | 1         | `Release already uploaded — v=X board=Y` |
| DB unique constraint (version+board exists) | 1         | `Release already exists in DB — ...`     |
| GCS upload fails for other reasons          | 1         | GCS error message                        |

## Exit Codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| 0    | Success                                         |
| 1    | Error (validation, domain error, or unexpected) |

## Troubleshooting

### "DATABASE_URL environment variable is required"

Ensure the `.env` file exists and contains `DATABASE_URL`:

```bash
set -a && source .env && set +a
```

### Connection refused to database

Ensure PostgreSQL is running:

```bash
docker compose up -d
```

### Device already registered

Each MAC address can only be registered once. To re-register:

1. Delete the device: `device:delete --mac AA:BB:CC:DD:EE:FF`
2. Re-register: `device:register --mac AA:BB:CC:DD:EE:FF`
