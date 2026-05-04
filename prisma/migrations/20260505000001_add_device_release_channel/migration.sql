-- Add releaseChannel to Device to control which OTA channel a device is enrolled in.
-- Defaults to 'STABLE' so existing devices receive only stable firmware.
ALTER TABLE "Device" ADD COLUMN "releaseChannel" TEXT NOT NULL DEFAULT 'STABLE';

-- Add CHECK constraint to enforce valid channel values.
ALTER TABLE "Device" ADD CONSTRAINT "device_release_channel_check"
  CHECK ("releaseChannel" IN ('ALPHA', 'BETA', 'STABLE'));
