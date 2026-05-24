import type {
  Device,
  FirmwareRelease,
  IDeviceRepository,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
} from '@home-pulse-watcher/core';
import {
  BoardType,
  PowerStatus,
  ReleaseChannel,
} from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  ValidationError,
  encryptDeviceSecret,
} from '@home-pulse-watcher/shared';
import * as crypto from 'node:crypto';
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

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);
const TEST_DEVICE_SECRET = 'b'.repeat(64);
const TEST_ENCRYPTED_SECRET = encryptDeviceSecret(
  TEST_DEVICE_SECRET,
  TEST_ENCRYPTION_KEY,
);

const makeDevice = (overrides: Partial<Device> = {}): Device =>
  ({
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: TEST_ENCRYPTED_SECRET,
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
    service = new CheckOtaUpdateService(
      deviceRepo,
      firmwareRepo,
      storage,
      TEST_ENCRYPTION_KEY,
    );
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

      expect(result.data).toMatchObject({
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
      service = new CheckOtaUpdateService(
        deviceRepo,
        firmwareRepo,
        storage,
        TEST_ENCRYPTION_KEY,
      );

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
      service = new CheckOtaUpdateService(
        deviceRepo,
        firmwareRepo,
        storage,
        TEST_ENCRYPTION_KEY,
      );

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

  describe('invalid releaseChannel in DB', () => {
    it('throws DomainError with INVALID_DEVICE_STATE when device has unrecognised releaseChannel', async () => {
      deviceRepo = createMockDeviceRepo(
        makeDevice({ releaseChannel: 'INVALID' as ReleaseChannel }),
      );
      service = new CheckOtaUpdateService(
        deviceRepo,
        firmwareRepo,
        storage,
        TEST_ENCRYPTION_KEY,
      );

      await expect(service.run(validInput, context)).rejects.toThrow(
        DomainError,
      );
      await expect(service.run(validInput, context)).rejects.toMatchObject({
        code: DomainErrorCode.INVALID_DEVICE_STATE,
      });
    });
  });

  describe('response signing', () => {
    const signedRelease = makeFirmwareRelease({
      version: '2.0.0',
      checksum: 'sha256checksum',
      gcsPath: 'firmware/esp32c3/2.0.0/esp32c3-v2.0.0.bin',
      isCritical: false,
    });

    it('includes non-empty sig in hasUpdate: true response', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([signedRelease]);
      storage.getSignedUrl.mockResolvedValue(
        'https://cdn.example.com/firmware.bin',
      );

      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      expect(result.data).toMatchObject({ hasUpdate: true });
      if (result.data.hasUpdate) {
        expect(typeof result.data.sig).toBe('string');
        expect(result.data.sig.length).toBe(64);
        expect(typeof result.data.ts).toBe('number');
        expect(result.data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('different url produces different sig', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([signedRelease]);

      storage.getSignedUrl.mockResolvedValueOnce(
        'https://cdn.example.com/firmware-a.bin',
      );
      const resultA = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      storage.getSignedUrl.mockResolvedValueOnce(
        'https://cdn.example.com/firmware-b.bin',
      );
      const resultB = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      expect(resultA.data.hasUpdate).toBe(true);
      expect(resultB.data.hasUpdate).toBe(true);
      if (resultA.data.hasUpdate && resultB.data.hasUpdate) {
        expect(resultA.data.sig).not.toBe(resultB.data.sig);
      }
    });

    it('sig matches manually computed HMAC over canonical string', async () => {
      const url = 'https://cdn.example.com/firmware.bin';
      firmwareRepo.findLatestForBoard.mockResolvedValue([signedRelease]);
      storage.getSignedUrl.mockResolvedValue(url);

      const before = Math.floor(Date.now() / 1000);
      const result = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );
      const after = Math.floor(Date.now() / 1000);

      expect(result.data.hasUpdate).toBe(true);
      if (!result.data.hasUpdate) return;

      const { sig, ts, expiresAt } = result.data;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);

      const canonical = `2.0.0|${url}|sha256checksum|false|${expiresAt}|${ts}`;
      const expected = crypto
        .createHmac('sha256', TEST_DEVICE_SECRET)
        .update(canonical)
        .digest('hex');

      expect(sig).toBe(expected);
    });

    it('does not include sig in hasUpdate: false response', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const result = await service.run(validInput, context);

      expect(result.data).toEqual({ hasUpdate: false });
      expect(result.data).not.toHaveProperty('sig');
    });

    it('does not include ts in hasUpdate: false response', async () => {
      firmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const result = await service.run(validInput, context);

      expect(result.data).not.toHaveProperty('ts');
    });

    it('tampered checksum produces different sig', async () => {
      const url = 'https://cdn.example.com/firmware.bin';
      storage.getSignedUrl.mockResolvedValue(url);

      const releaseA = makeFirmwareRelease({
        version: '2.0.0',
        checksum: 'checksum-original',
        gcsPath: 'firmware/esp32c3/2.0.0/esp32c3-v2.0.0.bin',
      });
      const releaseB = makeFirmwareRelease({
        version: '2.0.0',
        checksum: 'checksum-tampered',
        gcsPath: 'firmware/esp32c3/2.0.0/esp32c3-v2.0.0.bin',
      });

      firmwareRepo.findLatestForBoard.mockResolvedValueOnce([releaseA]);
      const resultA = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      firmwareRepo.findLatestForBoard.mockResolvedValueOnce([releaseB]);
      const resultB = await service.run(
        { ...validInput, currentVersion: '1.0.0' },
        context,
      );

      expect(resultA.data.hasUpdate).toBe(true);
      expect(resultB.data.hasUpdate).toBe(true);
      if (resultA.data.hasUpdate && resultB.data.hasUpdate) {
        expect(resultA.data.sig).not.toBe(resultB.data.sig);
      }
    });

    it('wrong encryption key causes service to throw (decryption auth tag fails)', async () => {
      const url = 'https://cdn.example.com/firmware.bin';
      storage.getSignedUrl.mockResolvedValue(url);
      firmwareRepo.findLatestForBoard.mockResolvedValue([signedRelease]);

      const wrongKeyService = new CheckOtaUpdateService(
        deviceRepo,
        firmwareRepo,
        storage,
        'f'.repeat(64),
      );

      await expect(
        wrongKeyService.run(
          { ...validInput, currentVersion: '1.0.0' },
          context,
        ),
      ).rejects.toThrow();
    });
  });

  describe('board mismatch guard', () => {
    it('throws DomainError when gcsPath board prefix does not match requesting boardType', async () => {
      // Release is stored under esp32c6/ but device requests as esp32c3
      const mismatchedRelease = makeFirmwareRelease({
        version: '2.0.0',
        boardType: BoardType.ESP32_C3,
        gcsPath: 'firmware/esp32c6/2.0.0/esp32c6-v2.0.0.bin',
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
        gcsPath: 'firmware/esp32c3/2.0.0/esp32c3-v2.0.0.bin',
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
