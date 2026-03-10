-- Remove @updatedAt behavior from lastSeenAt (column remains, just no longer auto-updated)
-- Add statusChangedAt column for tracking when power status last changed (ON↔OFF)
ALTER TABLE "Device" ADD COLUMN "statusChangedAt" TIMESTAMP(3);
