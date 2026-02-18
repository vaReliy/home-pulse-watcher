-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'uk',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Kyiv';
