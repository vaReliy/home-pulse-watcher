import type { FirmwareRelease } from '../entities/firmware-release.entity.js';
import type { BoardType } from '../types/board-type.enum.js';
import type { ReleaseChannel } from '../types/release-channel.enum.js';

/** `isCritical` defaults to `false` on creation; promote via `markCritical`. */
export interface CreateFirmwareReleaseInput {
  version: string;
  boardType: BoardType;
  channel: ReleaseChannel;
  checksum: string;
  gcsPath: string;
}

export interface IFirmwareReleaseRepository {
  create(input: CreateFirmwareReleaseInput): Promise<FirmwareRelease>;
  findById(id: string): Promise<FirmwareRelease | null>;
  findByVersionAndBoard(
    version: string,
    boardType: BoardType,
  ): Promise<FirmwareRelease | null>;
  findLatestForBoard(
    boardType: BoardType,
    channels: ReleaseChannel[],
  ): Promise<FirmwareRelease[]>;
  markCritical(id: string): Promise<FirmwareRelease>;
}
