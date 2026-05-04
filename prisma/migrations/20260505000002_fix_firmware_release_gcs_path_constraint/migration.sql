-- Fix the gcsPath CHECK constraint on FirmwareRelease.
-- Previous constraint rejected all valid paths because it was missing the 'firmware/' prefix
-- and subdirectory separators ('/'). Correct pattern matches the CLI-generated paths:
-- firmware/{board}/{CHANNEL}/{version}/{filename}.bin
ALTER TABLE "FirmwareRelease" DROP CONSTRAINT IF EXISTS "FirmwareRelease_gcsPath_check";

ALTER TABLE "FirmwareRelease" ADD CONSTRAINT "firmware_release_gcs_path_check"
  CHECK ("gcsPath" ~ '^firmware/(esp32c3|esp32c6)/[A-Z]+/[0-9]+\.[0-9]+\.[0-9]+/[a-zA-Z0-9._-]+\.bin$');
