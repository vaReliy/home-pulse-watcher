# Database backup execution environment
# Bundles gcloud SDK + PostgreSQL client for backup dumps to GCS
#
# Usage:
#   ./scripts/run-backup-in-docker.sh
#
# This Dockerfile is meant to be built and run by scripts/run-backup-in-docker.sh,
# which handles env-sourcing and mounting credentials. Do not run directly.

FROM google/cloud-sdk:slim

WORKDIR /app

# Install PostgreSQL client (pg_dump) for database backup + jq for JSON parsing
# Uses postgresql-client metapackage (Debian trixie ships 17, forward-compatible with PG 15+)
RUN apt-get update && apt-get install -y postgresql-client jq && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root user with proper home directory
# (nobody user has $HOME=/nonexistent by design, unsuitable for gcloud auth setup)
RUN useradd -m -s /bin/sh backup-runner

# Run as the dedicated backup-runner user with proper HOME
USER backup-runner
ENV HOME=/home/backup-runner

# Entrypoint: Always source .env first, then execute the command passed by wrapper script.
# Backup script and .env are mounted at runtime (read-only) from the host.
# We source .env using the safe pattern (set -a && . && set +a) to avoid word-split
# of multi-line values like JSON credentials.
# Wrapper script may provide service-account auth + project config and/or the backup script path.
ENTRYPOINT ["/bin/sh", "-c"]
