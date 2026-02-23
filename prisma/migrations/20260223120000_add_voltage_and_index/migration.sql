-- AlterTable
ALTER TABLE "PowerEvent" ADD COLUMN     "voltage" INTEGER;

-- CreateIndex
CREATE INDEX "PowerEvent_deviceId_timestamp_idx" ON "PowerEvent"("deviceId", "timestamp");
