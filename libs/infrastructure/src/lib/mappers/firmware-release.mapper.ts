import type { FirmwareRelease as PrismaFirmwareRelease } from '@prisma/client';
import {
  FirmwareRelease,
  BoardType,
  ReleaseChannel,
} from '@home-pulse-watcher/core';

function assertBoardType(value: string): BoardType {
  if (!Object.values(BoardType).includes(value as BoardType)) {
    throw new Error(`Invalid boardType in FirmwareRelease row: "${value}"`);
  }
  return value as BoardType;
}

function assertReleaseChannel(value: string): ReleaseChannel {
  if (!Object.values(ReleaseChannel).includes(value as ReleaseChannel)) {
    throw new Error(`Invalid channel in FirmwareRelease row: "${value}"`);
  }
  return value as ReleaseChannel;
}

export function mapPrismaFirmwareReleaseToEntity(
  row: PrismaFirmwareRelease,
): FirmwareRelease {
  return new FirmwareRelease({
    id: row.id,
    version: row.version,
    boardType: assertBoardType(row.boardType),
    channel: assertReleaseChannel(row.channel),
    checksum: row.checksum,
    gcsPath: row.gcsPath,
    isCritical: row.isCritical,
    createdAt: row.createdAt,
  });
}
