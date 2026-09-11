import { PrismaFirmwareReleaseRepository } from './firmware-release.repository.js';
import {
  FirmwareRelease,
  BoardType,
  ReleaseChannel,
} from '@home-pulse-watcher/core';

const mockPrismaClient = {
  firmwareRelease: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const baseRow = {
  id: 'release-1',
  version: '1.2.3',
  boardType: BoardType.ESP32_C3,
  channel: ReleaseChannel.STABLE,
  checksum: 'abc123',
  gcsPath: 'firmware/esp32c3/1.2.3/firmware.bin',
  isCritical: false,
  createdAt: new Date('2024-01-01'),
};

describe('PrismaFirmwareReleaseRepository', () => {
  let repository: PrismaFirmwareReleaseRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PrismaFirmwareReleaseRepository(mockPrismaClient as never);
  });

  describe('create', () => {
    it('should create and return a firmware release', async () => {
      mockPrismaClient.firmwareRelease.create.mockResolvedValue(baseRow);

      const result = await repository.create({
        version: '1.2.3',
        boardType: BoardType.ESP32_C3,
        channel: ReleaseChannel.STABLE,
        checksum: 'abc123',
        gcsPath: 'firmware/esp32c3/1.2.3/firmware.bin',
      });

      expect(result).toBeInstanceOf(FirmwareRelease);
      expect(mockPrismaClient.firmwareRelease.create).toHaveBeenCalledWith({
        data: {
          version: '1.2.3',
          boardType: BoardType.ESP32_C3,
          channel: ReleaseChannel.STABLE,
          checksum: 'abc123',
          gcsPath: 'firmware/esp32c3/1.2.3/firmware.bin',
        },
      });
    });
  });

  describe('findById', () => {
    it('should return the release when found', async () => {
      mockPrismaClient.firmwareRelease.findUnique.mockResolvedValue(baseRow);

      const result = await repository.findById('release-1');

      expect(result).toBeInstanceOf(FirmwareRelease);
      expect(mockPrismaClient.firmwareRelease.findUnique).toHaveBeenCalledWith({
        where: { id: 'release-1' },
      });
    });

    it('should return null when not found', async () => {
      mockPrismaClient.firmwareRelease.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByVersionAndBoard', () => {
    it('should query by the composite version_boardType key', async () => {
      mockPrismaClient.firmwareRelease.findUnique.mockResolvedValue(baseRow);

      const result = await repository.findByVersionAndBoard(
        '1.2.3',
        BoardType.ESP32_C3,
      );

      expect(result).toBeInstanceOf(FirmwareRelease);
      expect(mockPrismaClient.firmwareRelease.findUnique).toHaveBeenCalledWith({
        where: {
          version_boardType: {
            version: '1.2.3',
            boardType: BoardType.ESP32_C3,
          },
        },
      });
    });

    it('should return null when not found', async () => {
      mockPrismaClient.firmwareRelease.findUnique.mockResolvedValue(null);

      const result = await repository.findByVersionAndBoard(
        '9.9.9',
        BoardType.ESP32_C6,
      );

      expect(result).toBeNull();
    });
  });

  describe('findLatestForBoard', () => {
    it('should query by board and channel-in filter with a capped take and desc order', async () => {
      mockPrismaClient.firmwareRelease.findMany.mockResolvedValue([baseRow]);

      const result = await repository.findLatestForBoard(BoardType.ESP32_C3, [
        ReleaseChannel.STABLE,
        ReleaseChannel.BETA,
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(FirmwareRelease);
      expect(mockPrismaClient.firmwareRelease.findMany).toHaveBeenCalledWith({
        where: {
          boardType: BoardType.ESP32_C3,
          channel: { in: [ReleaseChannel.STABLE, ReleaseChannel.BETA] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should return an empty array when no candidates exist', async () => {
      mockPrismaClient.firmwareRelease.findMany.mockResolvedValue([]);

      const result = await repository.findLatestForBoard(BoardType.ESP32_C6, [
        ReleaseChannel.ALPHA,
      ]);

      expect(result).toEqual([]);
    });
  });

  describe('markCritical', () => {
    it('should set isCritical to true', async () => {
      mockPrismaClient.firmwareRelease.update.mockResolvedValue({
        ...baseRow,
        isCritical: true,
      });

      const result = await repository.markCritical('release-1');

      expect(result.isCritical).toBe(true);
      expect(mockPrismaClient.firmwareRelease.update).toHaveBeenCalledWith({
        where: { id: 'release-1' },
        data: { isCritical: true },
      });
    });
  });

  describe('findAll', () => {
    it('should order by boardType asc, channel asc, createdAt desc', async () => {
      mockPrismaClient.firmwareRelease.findMany.mockResolvedValue([baseRow]);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(FirmwareRelease);
      expect(mockPrismaClient.firmwareRelease.findMany).toHaveBeenCalledWith({
        orderBy: [
          { boardType: 'asc' },
          { channel: 'asc' },
          { createdAt: 'desc' },
        ],
      });
    });

    it('should return an empty array when no releases exist', async () => {
      mockPrismaClient.firmwareRelease.findMany.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });
});
