import type {
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
  FirmwareRelease,
} from '@home-pulse-watcher/core';
import { BoardType, ReleaseChannel } from '@home-pulse-watcher/core';
import { ValidationError } from '@home-pulse-watcher/shared';
import { CheckOtaUpdateService } from './check-ota-update.service.js';

const makeFirmwareRelease = (
  overrides: Partial<FirmwareRelease> = {},
): FirmwareRelease => ({
  id: 'release-1',
  version: '2.0.0',
  boardType: BoardType.ESP32_C3,
  channel: ReleaseChannel.STABLE,
  checksum: 'abc123def456',
  gcsPath: 'firmware/esp32c3/2.0.0.bin',
  isCritical: false,
  createdAt: new Date('2024-01-15'),
  ...overrides,
});

const createMockFirmwareRepo = (): jest.Mocked<IFirmwareReleaseRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByVersionAndBoard: jest.fn(),
  findLatestForBoard: jest.fn().mockResolvedValue([]),
  markCritical: jest.fn(),
});

const createMockStorage = (): jest.Mocked<IFirmwareStorageService> => ({
  uploadBuffer: jest.fn(),
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://signed-url.example.com/firmware.bin'),
  deleteObject: jest.fn().mockResolvedValue(undefined),
});

describe('CheckOtaUpdateService', () => {
  let firmwareRepo: jest.Mocked<IFirmwareReleaseRepository>;
  let storage: jest.Mocked<IFirmwareStorageService>;
  let service: CheckOtaUpdateService;

  beforeEach(() => {
    firmwareRepo = createMockFirmwareRepo();
    storage = createMockStorage();
    service = new CheckOtaUpdateService(firmwareRepo, storage);
  });

  const validInput = {
    boardType: BoardType.ESP32_C3,
    currentVersion: '1.0.0',
    channel: ReleaseChannel.STABLE,
  };

  describe('no release found', () => {
    it('returns hasUpdate: false when no release exists for the board', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const result = await service.run(validInput);

      expect(result.data).toEqual({ hasUpdate: false });
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('version comparison — no update needed', () => {
    it('returns hasUpdate: false when current version equals latest', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([
        makeFirmwareRelease({ version: '1.0.0' }),
      ]);

      const result = await service.run({
        ...validInput,
        currentVersion: '1.0.0',
      });

      expect(result.data).toEqual({ hasUpdate: false });
    });

    it('returns hasUpdate: false when current version is newer than latest', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([
        makeFirmwareRelease({ version: '0.9.5' }),
      ]);

      const result = await service.run({
        ...validInput,
        currentVersion: '1.0.0',
      });

      expect(result.data).toEqual({ hasUpdate: false });
    });
  });

  describe('update available', () => {
    it('returns hasUpdate: true with url, version, checksum when newer release exists', async () => {
      const release = makeFirmwareRelease({
        version: '2.0.0',
        checksum: 'sha256checksum',
        gcsPath: 'firmware/esp32c3/2.0.0.bin',
        isCritical: false,
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([release]);
      storage.getSignedUrl.mockResolvedValue(
        'https://cdn.example.com/firmware.bin',
      );

      const result = await service.run({
        ...validInput,
        currentVersion: '1.0.0',
      });

      expect(result.data).toEqual({
        hasUpdate: true,
        version: '2.0.0',
        url: 'https://cdn.example.com/firmware.bin',
        checksum: 'sha256checksum',
        isCritical: false,
      });
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'firmware/esp32c3/2.0.0.bin',
      );
    });

    it('passes isCritical: true when release is marked critical', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([
        makeFirmwareRelease({ version: '2.0.0', isCritical: true }),
      ]);

      const result = await service.run({
        ...validInput,
        currentVersion: '1.0.0',
      });

      expect(result.data).toMatchObject({ hasUpdate: true, isCritical: true });
    });
  });

  describe('channel waterfall', () => {
    it('BETA channel — only STABLE newer release exists — returns STABLE release', async () => {
      const stableRelease = makeFirmwareRelease({
        version: '2.0.0',
        channel: ReleaseChannel.STABLE,
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([stableRelease]);

      const result = await service.run({
        boardType: BoardType.ESP32_C3,
        currentVersion: '1.0.0',
        channel: ReleaseChannel.BETA,
      });

      expect(result.data).toMatchObject({ hasUpdate: true, version: '2.0.0' });
      expect(firmwareRepo.findLatestForBoard).toHaveBeenCalledWith(
        BoardType.ESP32_C3,
        [ReleaseChannel.BETA, ReleaseChannel.STABLE],
      );
    });

    it('STABLE channel — only BETA newer release exists — no update returned', async () => {
      // STABLE channel only sees STABLE; findLatestForBoard returns [] when no STABLE release exists
      firmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const result = await service.run({
        boardType: BoardType.ESP32_C3,
        currentVersion: '1.0.0',
        channel: ReleaseChannel.STABLE,
      });

      expect(result.data).toEqual({ hasUpdate: false });
      expect(firmwareRepo.findLatestForBoard).toHaveBeenCalledWith(
        BoardType.ESP32_C3,
        [ReleaseChannel.STABLE],
      );
    });

    it('ALPHA channel — ALPHA newer release exists — returns ALPHA release', async () => {
      const alphaRelease = makeFirmwareRelease({
        version: '3.0.0-alpha.1',
        channel: ReleaseChannel.ALPHA,
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([alphaRelease]);

      const result = await service.run({
        boardType: BoardType.ESP32_C3,
        currentVersion: '2.0.0',
        channel: ReleaseChannel.ALPHA,
      });

      expect(result.data).toMatchObject({
        hasUpdate: true,
        version: '3.0.0-alpha.1',
      });
      expect(firmwareRepo.findLatestForBoard).toHaveBeenCalledWith(
        BoardType.ESP32_C3,
        [ReleaseChannel.ALPHA, ReleaseChannel.BETA, ReleaseChannel.STABLE],
      );
    });
  });

  describe('input validation', () => {
    it('throws ValidationError for invalid boardType (unknown board)', async () => {
      await expect(
        service.run({
          boardType: 'esp32xx',
          currentVersion: '1.0.0',
          channel: ReleaseChannel.STABLE,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for invalid channel', async () => {
      await expect(
        service.run({
          boardType: BoardType.ESP32_C3,
          currentVersion: '1.0.0',
          channel: 'NIGHTLY',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when boardType is missing', async () => {
      await expect(
        service.run({
          boardType: '',
          currentVersion: '1.0.0',
          channel: ReleaseChannel.STABLE,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when currentVersion is not valid semver', async () => {
      await expect(
        service.run({
          boardType: BoardType.ESP32_C3,
          currentVersion: 'not-a-version',
          channel: ReleaseChannel.STABLE,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when currentVersion is a plain word without dots', async () => {
      await expect(
        service.run({
          boardType: BoardType.ESP32_C3,
          currentVersion: 'latest',
          channel: ReleaseChannel.STABLE,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('semver ordering — picks highest version regardless of insertion order', () => {
    it('returns the highest semver release when older release was inserted last', async () => {
      // 1.1.0 inserted first, 1.0.1 inserted after — createdAt ordering would be wrong
      firmwareRepo.findLatestForBoard.mockResolvedValue([
        makeFirmwareRelease({
          version: '1.1.0',
          gcsPath: 'firmware/esp32c3/1.1.0.bin',
          createdAt: new Date('2024-01-10'),
        }),
        makeFirmwareRelease({
          version: '1.0.1',
          gcsPath: 'firmware/esp32c3/1.0.1.bin',
          createdAt: new Date('2024-01-15'),
        }),
      ]);

      const result = await service.run({
        ...validInput,
        currentVersion: '1.0.0',
      });

      expect(result.data).toMatchObject({ hasUpdate: true, version: '1.1.0' });
    });
  });
});
