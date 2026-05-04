import type {
  IDeviceRepository,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
  FirmwareRelease,
  Device,
} from '@home-pulse-watcher/core';
import {
  BoardType,
  ReleaseChannel,
  PowerStatus,
} from '@home-pulse-watcher/core';
import { ValidationError, DomainError } from '@home-pulse-watcher/shared';
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

const makeDevice = (overrides: Partial<Device> = {}): Device =>
  ({
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'iv:tag:cipher',
    label: null,
    lastStatus: PowerStatus.ON,
    lastSeenAt: new Date(),
    statusChangedAt: null,
    firmwareVersion: null,
    batteryVoltage: null,
    releaseChannel: ReleaseChannel.STABLE,
    hasUps: false,
    isOnline: () => true,
    ...overrides,
  }) as unknown as Device;

const createMockDeviceRepo = (
  device: Device | null = makeDevice(),
): jest.Mocked<IDeviceRepository> =>
  ({
    findById: jest.fn().mockResolvedValue(device),
    findByMacAddress: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
    findByUserId: jest.fn(),
  }) as unknown as jest.Mocked<IDeviceRepository>;

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
  let deviceRepo: jest.Mocked<IDeviceRepository>;
  let firmwareRepo: jest.Mocked<IFirmwareReleaseRepository>;
  let storage: jest.Mocked<IFirmwareStorageService>;
  let service: CheckOtaUpdateService;

  beforeEach(() => {
    deviceRepo = createMockDeviceRepo();
    firmwareRepo = createMockFirmwareRepo();
    storage = createMockStorage();
    service = new CheckOtaUpdateService(deviceRepo, firmwareRepo, storage);
  });

  const validInput = {
    boardType: BoardType.ESP32_C3,
    currentVersion: '1.0.0',
  };

  const context = { deviceId: 'device-1' };

  describe('no release found', () => {
    it('returns hasUpdate: false when no release exists for the board', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const result = await service.run(validInput, context);

      expect(result.data).toEqual({ hasUpdate: false });
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('version comparison — no update needed', () => {
    it('returns hasUpdate: false when current version equals latest', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([
        makeFirmwareRelease({ version: '1.0.0' }),
      ]);

      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toEqual({ hasUpdate: false });
    });

    it('returns hasUpdate: false when current version is newer than latest', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([
        makeFirmwareRelease({ version: '0.9.5' }),
      ]);

      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

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

      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

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

      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toMatchObject({ hasUpdate: true, isCritical: true });
    });
  });

  describe('channel waterfall — driven by device DB record, not request body', () => {
    it('BETA device — only STABLE newer release exists — returns STABLE release', async () => {
      deviceRepo = createMockDeviceRepo(
        makeDevice({ releaseChannel: ReleaseChannel.BETA }),
      );
      service = new CheckOtaUpdateService(deviceRepo, firmwareRepo, storage);

      const stableRelease = makeFirmwareRelease({
        version: '2.0.0',
        channel: ReleaseChannel.STABLE,
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([stableRelease]);

      const result = await service.run(
        { boardType: BoardType.ESP32_C3, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toMatchObject({ hasUpdate: true, version: '2.0.0' });
      expect(firmwareRepo.findLatestForBoard).toHaveBeenCalledWith(
        BoardType.ESP32_C3,
        [ReleaseChannel.BETA, ReleaseChannel.STABLE],
      );
    });

    it('STABLE device — only BETA newer release exists — no update returned', async () => {
      // STABLE channel only sees STABLE; findLatestForBoard returns [] when no STABLE release exists
      firmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const result = await service.run(
        { boardType: BoardType.ESP32_C3, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toEqual({ hasUpdate: false });
      expect(firmwareRepo.findLatestForBoard).toHaveBeenCalledWith(
        BoardType.ESP32_C3,
        [ReleaseChannel.STABLE],
      );
    });

    it('ALPHA device — ALPHA newer release exists — returns ALPHA release', async () => {
      deviceRepo = createMockDeviceRepo(
        makeDevice({ releaseChannel: ReleaseChannel.ALPHA }),
      );
      service = new CheckOtaUpdateService(deviceRepo, firmwareRepo, storage);

      const alphaRelease = makeFirmwareRelease({
        version: '3.0.0-alpha.1',
        channel: ReleaseChannel.ALPHA,
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([alphaRelease]);

      const result = await service.run(
        { boardType: BoardType.ESP32_C3, currentVersion: '2.0.0' },
        context,
      );

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
        service.run({ boardType: 'esp32xx', currentVersion: '1.0.0' }, context),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when boardType is missing', async () => {
      await expect(
        service.run({ boardType: '', currentVersion: '1.0.0' }, context),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when currentVersion is not valid semver', async () => {
      await expect(
        service.run(
          { boardType: BoardType.ESP32_C3, currentVersion: 'not-a-version' },
          context,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when currentVersion is a plain word without dots', async () => {
      await expect(
        service.run(
          { boardType: BoardType.ESP32_C3, currentVersion: 'latest' },
          context,
        ),
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

      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toMatchObject({ hasUpdate: true, version: '1.1.0' });
    });
  });

  describe('board mismatch guard', () => {
    it('throws DomainError when gcsPath board prefix does not match requesting boardType', async () => {
      // Release is stored under esp32c6/ but device requests as esp32c3
      const mismatchedRelease = makeFirmwareRelease({
        version: '2.0.0',
        boardType: BoardType.ESP32_C3,
        gcsPath: 'firmware/esp32c6/STABLE/2.0.0/esp32c6-v2.0.0.bin',
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([mismatchedRelease]);

      await expect(
        service.run(
          { boardType: BoardType.ESP32_C3, currentVersion: '1.0.0' },
          context,
        ),
      ).rejects.toThrow(DomainError);
    });

    it('does not throw when gcsPath board prefix matches requesting boardType', async () => {
      const correctRelease = makeFirmwareRelease({
        version: '2.0.0',
        boardType: BoardType.ESP32_C3,
        gcsPath: 'firmware/esp32c3/STABLE/2.0.0/esp32c3-v2.0.0.bin',
      });
      firmwareRepo.findLatestForBoard.mockResolvedValue([correctRelease]);

      const result = await service.run(
        { boardType: BoardType.ESP32_C3, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toMatchObject({ hasUpdate: true, version: '2.0.0' });
    });
  });
});
