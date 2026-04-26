-- Add CHECK constraints to FirmwareRelease for DB-level validation of security-critical fields.
-- Prisma does not support CHECK constraints in its schema DSL, so this is a custom raw SQL migration.

ALTER TABLE "FirmwareRelease"
  ADD CONSTRAINT "FirmwareRelease_boardType_check"
    CHECK ("boardType" IN ('esp32c3', 'esp32c6')),
  ADD CONSTRAINT "FirmwareRelease_channel_check"
    CHECK ("channel" IN ('ALPHA', 'BETA', 'STABLE')),
  ADD CONSTRAINT "FirmwareRelease_checksum_check"
    CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "FirmwareRelease_gcsPath_check"
    CHECK ("gcsPath" ~ '^(esp32c3|esp32c6)/[a-zA-Z0-9._-]+\.bin$');
