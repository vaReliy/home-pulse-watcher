# Database Backup & Recovery

Procedures for backing up the PostgreSQL database and recovering from data loss using GCS storage and Neon PITR.

### Automated Backups

Backups are stored in a GCS bucket with an 8-week retention lifecycle rule.

**Backup details:**

- **Storage:** `gs://{PROJECT_ID}-backups/postgresql/`
- **Retention:** 8 weeks (56 days)
- **Format:** Compressed SQL dumps (gzip)
- **Naming:** `backup-YYYY-MM-DD-HHMMSS.sql.gz` (UTC 24-hour format)

The backup infrastructure (GCS bucket, lifecycle rule) is created automatically during `scripts/gcloud-bootstrap.sh` (Step 8).

**Option A: GitHub Actions Scheduled Workflow (Recommended)**

The workflow (`.github/workflows/backup.yml`) runs backups automatically every **Sunday at 2 AM UTC**. The workflow:

1. Authenticates to GCP via Workload Identity Federation (WIF) using existing deploy service account
2. Installs PostgreSQL client tools (`pg_dump`)
3. Extracts the GCP project ID from the service account email (no additional repo variables needed)
4. Retrieves `DATABASE_URL` from Secret Manager
5. Runs `scripts/backup-database.sh` which dumps and compresses the database to GCS

**Verify backups are running:**

- Open your repository → **Actions** tab → **Database Backup** workflow
- Check recent runs for success/failure status
- Successful backups appear in `gs://{PROJECT_ID}-backups/postgresql/` with timestamps

The backup bucket name is automatically derived from your GCP project ID (format: `{PROJECT_ID}-backups`, created by `scripts/gcloud-bootstrap.sh` Step 8). No additional secrets or configuration beyond the existing deploy service account are needed.

**Manual trigger:** You can also click **Run workflow** in the GitHub Actions tab to trigger a backup immediately.

**Option B: Manual Backup (One-time or ad-hoc)**

**Portable Docker approach** (recommended — works on any machine, no local gcloud setup):

```bash
./scripts/run-backup-in-docker.sh
```

This approach:

- Requires Docker installed (not gcloud CLI or local authentication)
- Reads `DATABASE_URL` and `GCP_SERVICE_ACCOUNT_KEY` from `.env`
- Service account authenticates directly inside the container
- Project ID is derived from the key's own `project_id` field (no extra config needed)
- Bucket name is auto-derived from PROJECT_ID

**Any developer with a populated `.env`** (specifically `GCP_SERVICE_ACCOUNT_KEY` and `DATABASE_URL`) can run the backup on any machine using this single command — no per-machine `gcloud auth login` or mounted credentials needed.

The script handles .env sourcing safely using `set -a && source .env && set +a` (avoids word-splitting multi-line JSON values).

**Alternative: Direct execution** (if you have gcloud + PostgreSQL client installed locally):

```bash
# Set environment variable
set -a && source .env && set +a

# Run backup (bucket name and project are auto-derived from GCP_SERVICE_ACCOUNT_KEY)
bash scripts/backup-database.sh
```

This method requires `gcloud` and `jq` CLI tools, plus either:

- `GCP_SERVICE_ACCOUNT_KEY` set in `.env`, OR
- `gcloud auth application-default login` (one-time local setup)

**Option C: Cloud Scheduler (Advanced)**

Set up a Cloud Scheduler job to invoke a Cloud Run service. This requires additional infrastructure setup beyond the bootstrap script. See the `gcloud scheduler jobs create http` documentation for details.

### Point-In-Time Recovery (Neon PITR)

Neon (free tier) retains **7 days** of transaction history. If data is corrupted or accidentally deleted:

1. **Via Neon Console (easiest):**
   - Open [Neon Console](https://console.neon.tech) → Project → Branches
   - Create a new branch from a specific point in time
   - Test queries on the branch
   - Rename or delete the original branch once verified

2. **Via Neon API:**
   ```bash
   # Create a branch at a specific timestamp
   curl -X POST https://api.neon.tech/api/v2/projects/{project_id}/branches \
     -H "Authorization: Bearer $NEON_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "branch": {
         "parent_id": "main",
         "timestamp": "2026-07-08T10:30:00Z"
       }
     }'
   ```

**Limitations:** PITR is only available within the 7-day window. For older data loss, restore from a GCS backup (see below).

### Restore from GCS Backup

**When to use:** Data loss outside the 7-day PITR window.

**Procedure:**

1. **Find the backup:**

   ```bash
   gsutil ls gs://{PROJECT_ID}-backups/postgresql/
   # e.g. backup-2026-07-01-020000.sql.gz
   ```

2. **Download and decompress locally:**

   ```bash
   # Download to tmp/db-dumps/ (directory for local backup scratch files)
   gsutil cp gs://{PROJECT_ID}-backups/postgresql/backup-2026-07-01-020000.sql.gz tmp/db-dumps/
   cd tmp/db-dumps/
   gunzip backup-2026-07-01-020000.sql.gz
   ```

3. **Create a temporary Neon branch and restore (optional — for testing first):**

   ```bash
   # Create a branch from the same parent timestamp
   # (use Neon console or API as above)
   # Then restore into that branch via psql
   psql postgresql://[user]:[pass]@[host]/neondb < backup-2026-07-01-020000.sql
   ```

4. **Restore into production (after verifying):**

   ```bash
   # WARNING: This replaces production data. Verify on a test branch first.
   psql "$DATABASE_URL" < backup-2026-07-01-020000.sql
   ```

5. **Verify integrity:**

   ```bash
   npx prisma migrate status
   ```

   Expected output (all migrations applied):

   ```
   ✓ 20260101_initial
   ✓ 20260205_add_telegram_fields
   ✓ 20260307_add_device_encryption
   (etc.)

   All migrations have been applied.
   ```

   If you see any pending migrations, re-run migrations:

   ```bash
   npx prisma migrate deploy
   ```

   Also verify key tables have data:

   ```bash
   npx prisma db execute "SELECT COUNT(*) FROM \"User\""
   npx prisma db execute "SELECT COUNT(*) FROM \"Device\""
   npx prisma db execute "SELECT COUNT(*) FROM \"PowerEvent\""
   npx prisma db execute "SELECT COUNT(*) FROM \"UserDevice\""
   ```

**Evidence of successful restore:**

- `npx prisma migrate status` shows all migrations ✓ applied
- `npx prisma migrate deploy` completes with no errors
- Row counts on key tables match expectations (compare with production backup before data loss)

### Restore Locally for Testing (Non-Destructive)

Use this procedure to restore a production backup into your local development Postgres (via `docker-compose`) **without touching production**. Useful for data integrity testing, debugging, or verification before touching prod.

**CRITICAL:** Always restore into a fresh, **separate scratch database**, never into your existing dev DB. This avoids merging/conflicting with whatever's already there.

**Prerequisites:**

- Local Postgres running: `docker-compose up -d postgres`
- Backup file already downloaded and decompressed to `tmp/db-dumps/` (from GCS as above)
- Your `.env` specifies `DB_USER`, `DB_PASSWORD`, `DB_NAME` (used by docker-compose for POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB)

**Setup (run once, before any commands below):**

```bash
# Create the backup directory if it doesn't exist (tmp/ is gitignored, so fresh clones won't have it)
mkdir -p tmp/db-dumps

# Load all .env variables safely (handles quoted/multi-line values correctly)
set -a && source .env && set +a

# Name for the scratch/test database (separate from your real dev DB)
export RESTORE_DB_NAME=restore_test

# Local backup file you're restoring from (adjust filename to your actual backup)
export BACKUP_FILE=tmp/db-dumps/backup-2026-07-01-020000.sql
```

**Procedure:**

1. **Create a temporary scratch database:**

   ```bash
   psql -h localhost -p 5432 -U "$DB_USER" -d postgres <<EOF
   CREATE DATABASE $RESTORE_DB_NAME;
   \q
   EOF
   ```

   You'll be prompted for the password — use the value from your `.env` (same as `$DB_PASSWORD`).

2. **Restore the backup into the scratch DB:**

   ```bash
   # Plain SQL dumps from pg_dump are restored via psql (not pg_restore)
   gunzip -c "$BACKUP_FILE".gz | psql -h localhost -p 5432 -U "$DB_USER" -d "$RESTORE_DB_NAME"
   ```

   You'll see output like:

   ```
   CREATE SCHEMA
   CREATE TABLE
   CREATE INDEX
   ...
   ```

3. **Expected benign warnings (do not panic):**
   - `unrecognized configuration parameter "transaction_timeout"`: Neon runs a newer Postgres major version than your local dev image. The dump includes session GUCs the older server doesn't recognize. Harmless.
   - `role "neondb_owner" does not exist` / `role "neon_superuser" does not exist`: Neon-specific ownership/grant statements in the dump. These are irrelevant locally. Future backups will omit these via `--no-owner --no-acl` flags; old backups will still show this message (safe to ignore).

4. **Verify data integrity (before dropping):**

   Sanity-check row counts:

   ```bash
   psql -h localhost -p 5432 -U "$DB_USER" -d "$RESTORE_DB_NAME" -c "SELECT count(*) FROM \"PowerEvent\";"
   ```

   Compare the count with expectations (e.g., the coordinator's test showed 12,266 rows).

   Also verify migration history consistency:

   ```bash
   DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${RESTORE_DB_NAME}?schema=public" npx prisma migrate status
   ```

   This should show all migrations ✓ applied (same as production).

   **Important:** Do verification BEFORE dropping the database (step 5). Once dropped, you'll need to re-download and re-restore to re-check.

5. **Cleanup:**

   Once verified, drop the scratch database:

   ```bash
   psql -h localhost -p 5432 -U "$DB_USER" -d postgres <<EOF
   DROP DATABASE $RESTORE_DB_NAME;
   \q
   EOF
   ```

### Migration Rollback (Emergency)

If `prisma migrate deploy` hangs or fails during Cloud Run startup (in `docker-entrypoint.sh:11`), the service will not start.

**Symptoms:**

- Deployment succeeds, but container crashes with exit code 1
- Logs show "Prisma migration pending" or timeout
- Logs from `docker-entrypoint.sh` show line 11 never completes

**Recovery:**

1. **Identify the failed migration:**

   ```bash
   npx prisma migrate status
   # Will list migrations with status: pending, applied, or rolled_back
   ```

2. **Roll back manually (if the migration is unsafe/failed):**

   ```bash
   npx prisma migrate resolve --rolled-back <migration-name>
   # E.g.: npx prisma migrate resolve --rolled-back 20260708_add_backup_tracking
   ```

3. **Revert the Cloud Run revision:**
   - Open [Cloud Run Console](https://console.cloud.google.com/run)
   - Find `home-pulse-watcher` service
   - Click **Revisions** tab
   - Select the previous working revision
   - Click **Promote** (traffic → 100% to that revision)

   Or via CLI:

   ```bash
   gcloud run services update-traffic home-pulse-watcher \
     --region=europe-west3 \
     --to-revisions=PREVIOUS_REVISION_ID=100
   ```

4. **Fix and redeploy:**
   - Amend the failing migration, or
   - Create a new migration: `npx prisma migrate dev --name <fix_name>`
   - Push to main → deploy workflow runs automatically
