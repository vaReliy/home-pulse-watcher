-- Sticky flag: backend sets this to request an immediate OTA check on next
-- /api/device/status call, firmware/service consumes (clears) it atomically
-- so it is served at most once. Default false backfills existing rows safely.
ALTER TABLE "Device" ADD COLUMN "otaForceCheckRequested" BOOLEAN NOT NULL DEFAULT false;
