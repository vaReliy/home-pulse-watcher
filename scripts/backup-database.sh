#!/usr/bin/env bash
# =============================================================================
# Database Backup Script
#
# Backs up the PostgreSQL database (from DATABASE_URL) and uploads to GCS.
# The backup bucket name is derived from the GCP project ID (from GCP_SERVICE_ACCOUNT_KEY).
#
# Usage:
#
#   Option A: Docker (recommended — portable, no local gcloud setup needed)
#     ./scripts/run-backup-in-docker.sh
#     (requires .env with DATABASE_URL + GCP_SERVICE_ACCOUNT_KEY)
#
#   Option B: Direct (if you have gcloud & PostgreSQL client installed locally)
#     set -a && source .env && set +a
#     bash scripts/backup-database.sh
#     (requires gcloud to be pre-authenticated via: gcloud auth application-default login)
#
# Environment variables:
#   DATABASE_URL (required) - PostgreSQL connection string
#   GCP_SERVICE_ACCOUNT_KEY (optional if gcloud ADC is already authenticated)
#
# WARNING: Do NOT load .env using `export $(grep -v '^#' .env | xargs)`.
# Multi-line values (e.g., GCP_SERVICE_ACCOUNT_KEY with embedded newlines)
# are word-split into garbage tokens. Use instead: set -a && source .env && set +a
#
# =============================================================================
set -euo pipefail

# Colors for output
info()  { printf '\n\033[1;34m[INFO]\033[0m  %s\n' "$1"; }
ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$1"; }
err()   { printf '\033[1;31m[ERROR]\033[0m %s\n' "$1" >&2; exit 1; }

# Verify required environment variables
if [[ -z "${DATABASE_URL:-}" ]]; then
  err "DATABASE_URL not set"
fi

# Derive backup bucket name from GCP project ID (internal, non-configurable)
# Matches gcloud-bootstrap.sh Step 8 derivation
BACKUP_BUCKET_SUFFIX="backups"

# Extract project_id from GCP_SERVICE_ACCOUNT_KEY JSON if available,
# otherwise try gcloud config (for direct execution with ADC)
if [[ -n "${GCP_SERVICE_ACCOUNT_KEY:-}" ]]; then
  PROJECT_ID=$(echo "$GCP_SERVICE_ACCOUNT_KEY" | jq -r .project_id) || err "Failed to parse project_id from GCP_SERVICE_ACCOUNT_KEY"
else
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null) || err "GCP_SERVICE_ACCOUNT_KEY not set and gcloud not configured"
fi

BACKUP_BUCKET="${PROJECT_ID}-${BACKUP_BUCKET_SUFFIX}"

info "Starting database backup..."
ok "Backup bucket: gs://${BACKUP_BUCKET}/"

# Generate backup filename with timestamp
BACKUP_TIMESTAMP=$(date -u +%Y-%m-%d-%H%M%S)
BACKUP_FILENAME="postgresql/backup-${BACKUP_TIMESTAMP}.sql.gz"

info "Dumping database to gs://${BACKUP_BUCKET}/${BACKUP_FILENAME}..."

# Create pg_dump and pipe through gzip to GCS
# PostgreSQL connection string parsing:
# postgresql://user:password@host:port/database?options
# Flags: --no-owner --no-acl to skip Neon-specific role/privilege statements
# (harmless locally, but noisy when restoring into non-Neon Postgres)
BACKUP_STDERR=$(mktemp)
if ! pg_dump --no-owner --no-acl "$DATABASE_URL" 2>"$BACKUP_STDERR" | gzip | gcloud storage cp --cache-control="no-cache" - "gs://${BACKUP_BUCKET}/${BACKUP_FILENAME}"; then
  # Scrub connection string from stderr to avoid leaking DB password
  sed 's|postgresql://[^@]*@[^/]*|postgresql://***@***|g' "$BACKUP_STDERR" >&2
  rm -f "$BACKUP_STDERR"
  err "Backup failed during dump or GCS upload"
fi
rm -f "$BACKUP_STDERR"

ok "Backup completed: gs://${BACKUP_BUCKET}/${BACKUP_FILENAME}"

# List recent backups
info "Recent backups:"
gcloud storage ls --recursive "gs://${BACKUP_BUCKET}/postgresql/backup-*.sql.gz" | tail -5 || true

info "Backup size:"
gcloud storage du "gs://${BACKUP_BUCKET}/${BACKUP_FILENAME}" || true
