# Manually Inserting a FirmwareRelease Record

Quick reference for creating a `FirmwareRelease` record in the PostgreSQL database for testing OTA endpoints or pre-provisioning releases before running the full OTA pipeline.

## When to Use

- **Testing OTA endpoint logic** — provisioning a release record without going through the full `device:upload` CLI workflow
- **Seeding dev/staging database** — creating test fixtures for firmware update scenarios
- **Rapid iteration** — faster than rebuilding binaries and re-uploading to GCS

## Method 1: Direct psql

### Connect to Database

```bash
docker exec home-pulse-db psql -U admin -d home_pulse_watcher
```

### INSERT Template

```sql
INSERT INTO "FirmwareRelease" (
  "id",
  "version",
  "boardType",
  "channel",
  "checksum",
  "gcsPath",
  "isCritical",
  "createdAt"
) VALUES (
  gen_random_uuid()::text,
  '<version>',
  '<boardType>',
  '<channel>',
  '<checksum>',
  '<gcsPath>',
  <isCritical>,
  CURRENT_TIMESTAMP
);
```

### Working Example

Insert firmware release v3.5.1 for ESP32-C6 (STABLE channel):

```sql
INSERT INTO "FirmwareRelease" (
  "id",
  "version",
  "boardType",
  "channel",
  "checksum",
  "gcsPath",
  "isCritical",
  "createdAt"
) VALUES (
  gen_random_uuid()::text,
  '3.5.1',
  'esp32c6',
  'STABLE',
  'aabe31969eb5e32d823e731aea76118bb49ec51cd8a108d10824d1680c3fa177',
  'firmware/esp32c6/3.5.1/firmware.bin',
  false,
  CURRENT_TIMESTAMP
);
```

Then exit psql:

```
\q
```

## Method 2: Prisma Studio (GUI)

Visual alternative for inserting records:

```bash
npx prisma studio
```

Opens `http://localhost:5555`. Click **FirmwareRelease** → **Add record** → fill in fields → **Save**.

**Note:** Prisma Studio generates the UUID automatically; you only fill in version, boardType, channel, checksum, gcsPath, and isCritical.

## Verify Insertion

List the 5 most recent releases:

```bash
docker exec home-pulse-db psql -U admin -d home_pulse_watcher \
  -c 'SELECT "id", "version", "boardType", "channel", "checksum", "gcsPath", "isCritical", "createdAt" FROM "FirmwareRelease" ORDER BY "createdAt" DESC LIMIT 5;'
```

Or in psql interactive mode:

```sql
SELECT * FROM "FirmwareRelease" ORDER BY "createdAt" DESC LIMIT 5;
```

## Clean Up

Delete a specific release by version and board type:

```bash
docker exec home-pulse-db psql -U admin -d home_pulse_watcher \
  -c "DELETE FROM \"FirmwareRelease\" WHERE version = '3.5.1' AND \"boardType\" = 'esp32c6';"
```

Or in psql:

```sql
DELETE FROM "FirmwareRelease" WHERE version = '3.5.1' AND "boardType" = 'esp32c6';
```

## Field Constraints

| Field        | Type      | Constraint                                                           | Example                                                     |
| ------------ | --------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `id`         | text      | NOT NULL, unique (PK)                                                | `gen_random_uuid()::text`                                   |
| `version`    | text      | NOT NULL, semver format                                              | `'3.5.1'`                                                   |
| `boardType`  | text      | NOT NULL, CHECK: `esp32c3` \| `esp32c6`                              | `'esp32c6'`                                                 |
| `channel`    | text      | NOT NULL, CHECK: `ALPHA` \| `BETA` \| `STABLE`                       | `'STABLE'`                                                  |
| `checksum`   | text      | NOT NULL, UNIQUE, CHECK: 64-char lowercase SHA-256 hex               | `'aabe31969eb5e32d823e731aea76118bb49ec51cd8a108d10824...'` |
| `gcsPath`    | text      | NOT NULL, UNIQUE, CHECK: `^firmware/[a-z0-9_-]+/[semver]/[...].bin$` | `'firmware/esp32c6/3.5.1/firmware.bin'`                     |
| `isCritical` | boolean   | default: `false`                                                     | `false` or `true`                                           |
| `createdAt`  | timestamp | default: `CURRENT_TIMESTAMP`                                         | auto-populated                                              |

**Key points:**

- `version` and `checksum` must be unique together (no duplicates across board types)
- `gcsPath` is unique globally (no path reuse across versions/boards)
- `checksum` must be exactly 64 hex characters (lowercase)
- `gcsPath` format: `firmware/<boardType>/<version>/<filename>.bin` (e.g., `firmware/esp32c6/3.5.1/firmware.bin`)
- `boardType` and `channel` are case-sensitive (must match CHECK values exactly)

### Computing the correct checksum

`checksum` is the **embedded SHA-256** that esptool appends to the binary footer — **not** the file SHA-256 (`shasum -a 256`). The firmware reads it back via `esp_partition_get_sha256()` after flashing.

```bash
# Correct — embedded SHA-256 (last 32 bytes of the .bin file)
python3 -c "data=open('firmware.bin','rb').read(); print(data[-32:].hex())"

# Wrong — do NOT use this as the checksum value
shasum -a 256 firmware.bin
```
