-- Add deviceType to Device to record the hardware category ('UPS' | 'MAINS').
-- Write-once at provisioning (no admin-edit path). Default 'MAINS' backfills
-- existing rows before the CHECK constraint is added, so it always passes
-- regardless of prior data (see docs/KNOWLEDGE_INBOX.md CHECK-constraint gotcha).
ALTER TABLE "Device" ADD COLUMN "deviceType" TEXT NOT NULL DEFAULT 'MAINS';

-- Add CHECK constraint to enforce valid deviceType values.
ALTER TABLE "Device" ADD CONSTRAINT "device_device_type_check"
  CHECK ("deviceType" IN ('UPS', 'MAINS'));
