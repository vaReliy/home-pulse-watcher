-- AlterTable
ALTER TABLE "Device" ADD COLUMN "batteryVoltage" INTEGER;

-- AlterTable
ALTER TABLE "PowerEvent" ADD COLUMN "batteryVoltage" INTEGER;
