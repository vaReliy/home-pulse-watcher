#!/usr/bin/env node
/**
 * Read-only fleet state inspector.
 *
 * Prints what the database actually holds for every device and firmware
 * release. Issues SELECT statements only — no INSERT/UPDATE/DELETE, no schema
 * access, no migrations. Safe to point at production, which is the usual case:
 * it reads DATABASE_URL straight from the repo-root `.env`, and that file
 * normally targets Cloud Run's database.
 *
 * Why this exists rather than `firmware:list` or the Telegram `/devices` view:
 * both of those present a *curated* picture, and the curation is exactly what
 * hides OTA problems. `Device.firmwareVersion` sat five months stale while the
 * bot rendered it as current, because a device reporting an unparseable version
 * has that field silently dropped (`sanitizeFirmwareVersion()`), leaving the
 * previous value untouched with nothing logged. Diagnosing that needs the raw
 * row — `lastSeenAt` proving the heartbeat landed, next to a `firmwareVersion`
 * that did not move.
 *
 * Fields worth reading together:
 *   firmwareVersion         last version the backend accepted as valid semver —
 *                           NOT necessarily what the device is running now
 *   lastSeenAt              updated on every heartbeat, unconditionally; if this
 *                           is fresh but firmwareVersion is old, the device is
 *                           reporting a version the backend is rejecting
 *   releaseChannel          server-controlled; decides which releases the device
 *                           is offered (ALPHA sees all, BETA sees BETA+STABLE,
 *                           STABLE sees STABLE only)
 *   otaForceCheckRequested  sticky flag, consumed at most once on the next
 *                           heartbeat; `true` here means one check is pending
 *
 * Usage:
 *   node scripts/inspect-device-state.cjs
 *
 * Requires: repo-root `.env` with DATABASE_URL, and `pg` installed (it is, as a
 * transitive dependency of @prisma/adapter-pg). Kept as plain CommonJS rather
 * than TypeScript so it runs with a bare `node` and no ts-node/tsconfig setup —
 * a diagnostic reached for when something is already broken should have the
 * fewest moving parts possible.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

/** Pull DATABASE_URL out of .env without adding a dotenv dependency. */
function readDatabaseUrl() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`No .env at ${ENV_PATH}`);
  }
  const match = fs.readFileSync(ENV_PATH, 'utf8').match(/^DATABASE_URL=(.*)$/m);
  if (!match) {
    throw new Error('DATABASE_URL not found in .env');
  }
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/** Host only — never print the full URL, it carries the password. */
function describeTarget(url) {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main() {
  const connectionString = readDatabaseUrl();
  console.log(`READ-ONLY inspection of ${describeTarget(connectionString)}\n`);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const devices = await client.query(
      `SELECT "macAddress", label, "firmwareVersion", "releaseChannel",
              "deviceType", "lastStatus", "batteryVoltage",
              "otaForceCheckRequested", "lastSeenAt"
         FROM "Device"
        ORDER BY label`,
    );
    console.log('Devices:');
    console.table(devices.rows);

    const releases = await client.query(
      `SELECT version, "boardType", channel, "isCritical", "gcsPath", "createdAt"
         FROM "FirmwareRelease"
        ORDER BY "createdAt" DESC
        LIMIT 20`,
    );
    console.log('\nFirmware releases (20 most recent):');
    console.table(releases.rows);

    // A device is only offered releases on its own channel and below it, so a
    // version present here is not necessarily reachable by a given device.
    console.log(
      '\nNote: firmwareVersion is the last value that passed semver validation.' +
        '\nA fresh lastSeenAt beside a stale firmwareVersion means the device is' +
        '\nreporting something the backend is dropping — check the serial log.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
