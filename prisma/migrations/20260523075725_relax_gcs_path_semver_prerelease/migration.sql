-- Relax the gcsPath CHECK constraint on FirmwareRelease to accept semver prerelease suffixes.
-- Previous constraint pattern `[0-9]+\.[0-9]+\.[0-9]+` rejected versions like `0.2.0-beta.1` or `1.0.0-rc.2`.
-- New pattern adds an optional prerelease segment: `(-[a-zA-Z0-9][a-zA-Z0-9.]*)?`
ALTER TABLE "FirmwareRelease"
DROP CONSTRAINT IF EXISTS "firmware_release_gcs_path_check";

ALTER TABLE "FirmwareRelease"
ADD CONSTRAINT "firmware_release_gcs_path_check"
CHECK ("gcsPath" ~ '^firmware/[a-z0-9_-]+/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9][a-zA-Z0-9.]*)?/[A-Za-z0-9._-]+\.bin$');
