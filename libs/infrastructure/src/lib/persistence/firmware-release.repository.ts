import type { PrismaClient } from '@prisma/client';
import type {
  IFirmwareReleaseRepository,
  CreateFirmwareReleaseInput,
  FirmwareRelease,
  BoardType,
  ReleaseChannel,
} from '@home-pulse-watcher/core';
import { mapPrismaFirmwareReleaseToEntity } from '../mappers/firmware-release.mapper.js';
import { withPrismaError } from './prisma-error.wrapper.js';

/**
 * Upper bound for candidate rows fetched by findLatestForBoard.
 * 50 is well beyond any realistic number of releases per board+channel
 * combination; semver max-selection happens in memory after this fetch.
 */
const MAX_CANDIDATE_RELEASES = 50;

export class PrismaFirmwareReleaseRepository
  implements IFirmwareReleaseRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateFirmwareReleaseInput): Promise<FirmwareRelease> {
    const row = await withPrismaError('FirmwareRelease', () =>
      this.prisma.firmwareRelease.create({
        data: {
          version: input.version,
          boardType: input.boardType,
          channel: input.channel,
          checksum: input.checksum,
          gcsPath: input.gcsPath,
        },
      }),
    );
    return mapPrismaFirmwareReleaseToEntity(row);
  }

  async findById(id: string): Promise<FirmwareRelease | null> {
    const row = await withPrismaError('FirmwareRelease', () =>
      this.prisma.firmwareRelease.findUnique({ where: { id } }),
    );
    return row ? mapPrismaFirmwareReleaseToEntity(row) : null;
  }

  async findByVersionAndBoard(
    version: string,
    boardType: BoardType,
  ): Promise<FirmwareRelease | null> {
    const row = await withPrismaError('FirmwareRelease', () =>
      this.prisma.firmwareRelease.findUnique({
        where: { version_boardType: { version, boardType } },
      }),
    );
    return row ? mapPrismaFirmwareReleaseToEntity(row) : null;
  }

  async findLatestForBoard(
    boardType: BoardType,
    channels: ReleaseChannel[],
  ): Promise<FirmwareRelease[]> {
    const rows = await withPrismaError('FirmwareRelease', () =>
      this.prisma.firmwareRelease.findMany({
        where: { boardType, channel: { in: channels } },
        orderBy: { createdAt: 'desc' },
        take: MAX_CANDIDATE_RELEASES,
      }),
    );
    return rows.map(mapPrismaFirmwareReleaseToEntity);
  }

  async markCritical(id: string): Promise<FirmwareRelease> {
    const row = await withPrismaError('FirmwareRelease', () =>
      this.prisma.firmwareRelease.update({
        where: { id },
        data: { isCritical: true },
      }),
    );
    return mapPrismaFirmwareReleaseToEntity(row);
  }

  async findAll(): Promise<FirmwareRelease[]> {
    const rows = await withPrismaError('FirmwareRelease', () =>
      this.prisma.firmwareRelease.findMany({
        orderBy: [
          { boardType: 'asc' },
          { channel: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
    );
    return rows.map(mapPrismaFirmwareReleaseToEntity);
  }
}
