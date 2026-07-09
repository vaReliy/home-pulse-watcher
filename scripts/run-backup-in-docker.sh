#!/bin/bash
# Database backup via Docker (portable, no local gcloud setup needed)
# Builds and runs the backup container with .env-sourced service-account auth.
#
# Usage:
#   ./scripts/run-backup-in-docker.sh
#
# Prerequisites:
#   - Docker installed and running
#   - User's .env file with:
#     * DATABASE_URL (PostgreSQL connection string)
#     * GCP_SERVICE_ACCOUNT_KEY (service account JSON key with GCS bucket access)
#
# This script mirrors the firmware build pattern (firmware/Dockerfile +
# scripts/firmware-docker-build.sh): mounts host sources (.env, backup script)
# into the image so changes don't require rebuilds. No local gcloud auth needed.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_IMAGE="home-pulse-backup"
DOCKER_TAG="latest"
CONTAINER_NAME="home-pulse-db-backup"

# Helper functions
log_info() { printf "${YELLOW}[INFO]${NC}  %s\n" "$1"; }
log_ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
log_err()  { printf "${RED}[ERROR]${NC} %s\n" "$1" >&2; exit 1; }

log_info "Database Backup via Docker"
log_info "=============================="

# Verify prerequisites
if [ ! -f "${PROJECT_ROOT}/.env" ]; then
  log_err ".env not found at ${PROJECT_ROOT}/.env"
fi

if [ ! -f "${PROJECT_ROOT}/scripts/backup-database.sh" ]; then
  log_err "backup-database.sh not found"
fi

# Clean up any leftover container from previous run (idempotent)
log_info "Cleaning up previous container..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Build Docker image (or use cached one)
log_info "Building Docker image..."
docker build \
  -f "${PROJECT_ROOT}/scripts/backup-database.Dockerfile" \
  -t "${DOCKER_IMAGE}:${DOCKER_TAG}" \
  "${PROJECT_ROOT}" || {
    log_err "Docker build failed"
  }

log_ok "Docker image built: ${DOCKER_IMAGE}:${DOCKER_TAG}"

# Prepare docker run arguments (no gcloud mount needed)
DOCKER_RUN_ARGS=(
  "--rm"
  "--name=$CONTAINER_NAME"
  "--volume=${PROJECT_ROOT}/.env:/app/.env:ro"
  "--volume=${PROJECT_ROOT}/scripts/backup-database.sh:/app/backup-database.sh:ro"
)

# Run backup inside container
log_info "Starting backup in container..."
echo ""

# Build the command to execute in the container:
# 1. Source .env (safe pattern: set -a && . && set +a)
# 2. Validate GCP_SERVICE_ACCOUNT_KEY is present
# 3. Authenticate with GCP via service account key
# 4. Configure gcloud project from key's project_id field
# 5. Securely delete the temp key file
# 6. Execute the backup script
# Note: GCP_SERVICE_ACCOUNT_KEY is expected to be in .env as a JSON string

BACKUP_CMD='set -a && . /app/.env && set +a && \
trap "shred -vfz -n 3 /tmp/sa-key.json 2>/dev/null || rm -f /tmp/sa-key.json" EXIT && \
if [ -z "$GCP_SERVICE_ACCOUNT_KEY" ]; then \
  echo "ERROR: GCP_SERVICE_ACCOUNT_KEY not set in .env" >&2; \
  exit 1; \
fi && \
(umask 077; echo "$GCP_SERVICE_ACCOUNT_KEY" > /tmp/sa-key.json) && \
gcloud auth activate-service-account --key-file=/tmp/sa-key.json && \
PROJECT_ID=$(jq -r .project_id /tmp/sa-key.json) && \
gcloud config set project "$PROJECT_ID" && \
/app/backup-database.sh'

docker run "${DOCKER_RUN_ARGS[@]}" \
  "${DOCKER_IMAGE}:${DOCKER_TAG}" \
  "$BACKUP_CMD" || {
    BACKUP_EXIT=$?
    echo ""
    log_err "Backup failed (exit code: $BACKUP_EXIT)"
  }

echo ""
log_ok "Backup succeeded"
