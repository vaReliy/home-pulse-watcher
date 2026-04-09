#!/bin/sh
set -e

echo "Running database migrations..."

MAX_RETRIES=5
RETRY_DELAY=3
attempt=1

while [ "$attempt" -le "$MAX_RETRIES" ]; do
  if npx prisma migrate deploy; then
    echo "Migrations applied successfully."
    break
  fi

  if [ "$attempt" -eq "$MAX_RETRIES" ]; then
    echo "Failed to apply migrations after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi

  echo "Migration attempt $attempt/$MAX_RETRIES failed. Retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
  RETRY_DELAY=$((RETRY_DELAY * 2))
  attempt=$((attempt + 1))
done

echo "Starting application..."
exec node main.js
