# CLI Reference

HomePulse Watcher provides CLI commands for device provisioning and user management.

## Prerequisites

1. Build the application:

   ```bash
   npx nx build api
   ```

2. Ensure environment variables are set:

   ```bash
   export $(grep -v '^#' .env | xargs)
   ```

   Or use Docker (recommended for production).

## Running CLI Commands

### Local Development

```bash
# Load environment and run
export $(grep -v '^#' .env | xargs)
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

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `-m, --mac <mac>` | Yes | Device MAC address (format: AA:BB:CC:DD:EE:FF) |
| `-l, --label <label>` | No | Human-readable device label (max 100 chars) |

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
```

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `-u, --user-id <uuid>` | Yes | User ID to filter devices |

**Example:**

```bash
node apps/api/dist/cli.js device:list \
  --user-id 8867bdee-bfd6-4158-b8cb-b80e79126958
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

### user:create

Create a new user from Telegram ID.

**Usage:**

```bash
node apps/api/dist/cli.js user:create --telegram-id <id> [--username <username>]
```

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `-t, --telegram-id <id>` | Yes | Telegram user ID |
| `-u, --username <username>` | No | Telegram username (max 100 chars) |

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

## Help

View all available commands:

```bash
node apps/api/dist/cli.js --help
```

View help for a specific command:

```bash
node apps/api/dist/cli.js device:register --help
```

## Exit Codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| 0    | Success                                         |
| 1    | Error (validation, domain error, or unexpected) |

## Troubleshooting

### "DATABASE_URL environment variable is required"

Ensure the `.env` file exists and contains `DATABASE_URL`:

```bash
export $(grep -v '^#' .env | xargs)
```

### "APP_GLOBAL_SALT environment variable is required"

The `APP_GLOBAL_SALT` is required for device secret hashing:

```bash
# Add to .env
APP_GLOBAL_SALT=your-32-character-random-string-here
```

### Connection refused to database

Ensure PostgreSQL is running:

```bash
docker compose up -d
```

### Device already registered

Each MAC address can only be registered once. To re-register:

1. Delete the device from the database
2. Or use a different MAC address
