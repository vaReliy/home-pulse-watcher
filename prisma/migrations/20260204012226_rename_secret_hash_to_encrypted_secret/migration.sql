-- Rename secretHash column to encryptedSecret
ALTER TABLE "Device" RENAME COLUMN "secretHash" TO "encryptedSecret";
