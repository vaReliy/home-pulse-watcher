-- CreateTable
CREATE TABLE "FirmwareRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "boardType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "gcsPath" TEXT NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmwareRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FirmwareRelease_checksum_key" ON "FirmwareRelease"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "FirmwareRelease_gcsPath_key" ON "FirmwareRelease"("gcsPath");

-- CreateIndex
CREATE INDEX "FirmwareRelease_boardType_channel_createdAt_idx" ON "FirmwareRelease"("boardType", "channel", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FirmwareRelease_version_boardType_key" ON "FirmwareRelease"("version", "boardType");
