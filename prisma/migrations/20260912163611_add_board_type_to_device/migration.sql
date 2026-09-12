-- Add boardType to Device to record the ESP32 board variant ('esp32c3' | 'esp32c6'),
-- required to join Device rows to applicable FirmwareRelease rows for OTA-eligibility
-- features. Write-once at provisioning (no admin-edit path), same rule as deviceType.
--
-- Required (NOT NULL) column added to a non-empty table needs a 3-step backfill:
-- add nullable -> backfill -> enforce NOT NULL. All existing Device rows (prod and
-- dev) are esp32c6 as of this migration — no esp32c3 device has been provisioned yet.
ALTER TABLE "Device" ADD COLUMN "boardType" TEXT;

UPDATE "Device" SET "boardType" = 'esp32c6' WHERE "boardType" IS NULL;

ALTER TABLE "Device" ALTER COLUMN "boardType" SET NOT NULL;
