import type {
  FirmwareRelease,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
} from '@home-pulse-watcher/core';
import {
  DatabaseError,
  DatabaseErrorCode,
  DomainError,
  DomainErrorCode,
  livrValidatorFactory,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { UploadFirmwareService } from './upload-firmware.service.js';

const FIXTURE_BUFFER = Buffer.from('fake-firmware-binary');
const FIXTURE_SHA256 =
  'eee3bb7c59e0fd24e21fd3a7e0e60edd42f8ff3b3aeac45c41bae6ec0c7bf059';

const FIXTURE_RELEASE: FirmwareRelease = {
  id: 'release-uuid',
  version: '0.2.0',
  boardType: 'esp32c3',
  channel: 'ALPHA',
  checksum: FIXTURE_SHA256,
  gcsPath: 'firmware/esp32c3/0.2.0/esp32c3-v0.2.0.bin',
  isCritical: false,
  createdAt: new Date('2026-04-29T00:00:00Z'),
} as FirmwareRelease;

function makeMockStorage(): jest.Mocked<IFirmwareStorageService> {
  return {
    uploadBuffer: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest
      .fn()
      .mockResolvedValue('https://storage.googleapis.com/preview?token=x'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockRepo(): jest.Mocked<IFirmwareReleaseRepository> {
  return {
    create: jest.fn().mockResolvedValue(FIXTURE_RELEASE),
    findById: jest.fn(),
    findByVersionAndBoard: jest.fn(),
    findLatestForBoard: jest.fn(),
    findAll: jest.fn(),
    markCritical: jest
      .fn()
      .mockResolvedValue({ ...FIXTURE_RELEASE, isCritical: true }),
  };
}

function defaultInput(
  overrides: Partial<{
    fileBuffer: Buffer;
    fileName: string;
    version: string;
    board: string;
    channel: string;
    critical: boolean;
  }> = {},
) {
  return {
    fileBuffer: FIXTURE_BUFFER,
    fileName: 'esp32c3-v0.2.0.bin',
    version: '0.2.0',
    board: 'esp32c3',
    channel: 'ALPHA',
    ...overrides,
  };
}

describe('UploadFirmwareService', () => {
  let storage: jest.Mocked<IFirmwareStorageService>;
  let repo: jest.Mocked<IFirmwareReleaseRepository>;
  let service: UploadFirmwareService;

  beforeAll(() => {
    livrValidatorFactory.initialize();
  });

  beforeEach(() => {
    storage = makeMockStorage();
    repo = makeMockRepo();
    service = new UploadFirmwareService(storage, repo);
  });

  describe('success path', () => {
    it('uploads buffer, creates DB record, and returns the release', async () => {
      const { data } = await service.run(defaultInput());

      expect(storage.uploadBuffer).toHaveBeenCalledWith(
        'firmware/esp32c3/0.2.0/esp32c3-v0.2.0.bin',
        FIXTURE_BUFFER,
        'application/octet-stream',
      );
      expect(repo.create).toHaveBeenCalledWith({
        version: '0.2.0',
        boardType: 'esp32c3',
        channel: 'ALPHA',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        gcsPath: 'firmware/esp32c3/0.2.0/esp32c3-v0.2.0.bin',
      });
      expect(data.release).toEqual(FIXTURE_RELEASE);
    });

    it('marks release as critical when critical=true', async () => {
      const { data } = await service.run(defaultInput({ critical: true }));

      expect(repo.markCritical).toHaveBeenCalledWith(FIXTURE_RELEASE.id);
      expect(data.release.isCritical).toBe(true);
    });
  });

  describe('unsafe filename', () => {
    it('rejects filenames outside the safe basename pattern', async () => {
      await expect(
        service.run(defaultInput({ fileName: '../../etc/passwd.bin' })),
      ).rejects.toMatchObject({
        code: DomainErrorCode.INVALID_FIRMWARE_FILENAME,
      });
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });
  });

  describe('validation errors', () => {
    it('rejects non-semver version', async () => {
      await expect(
        service.run(defaultInput({ version: 'not-semver' })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });

    it('rejects board not in enum', async () => {
      await expect(
        service.run(defaultInput({ board: 'esp32xx' })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });

    it('rejects invalid channel', async () => {
      await expect(
        service.run(defaultInput({ channel: 'NIGHTLY' })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });
  });

  describe('GCS conflict (412 — already uploaded)', () => {
    it('throws a domain error and does NOT create a DB record', async () => {
      const gcsConflictErr = new Error('GCS operation failed', {
        cause: { code: 412, message: 'Precondition Failed' },
      });
      storage.uploadBuffer.mockRejectedValue(gcsConflictErr);

      await expect(service.run(defaultInput())).rejects.toBeInstanceOf(
        DomainError,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('DB failure after successful GCS upload', () => {
    it('triggers GCS cleanup and throws a domain error on unique-constraint violation', async () => {
      repo.create.mockRejectedValue(
        new DatabaseError(
          DatabaseErrorCode.UNIQUE_CONSTRAINT,
          'FirmwareRelease already exists',
        ),
      );

      await expect(service.run(defaultInput())).rejects.toBeInstanceOf(
        DomainError,
      );
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'firmware/esp32c3/0.2.0/esp32c3-v0.2.0.bin',
      );
    });

    it('triggers GCS cleanup and re-throws on generic DB error', async () => {
      const dbErr = new Error('DB connection lost');
      repo.create.mockRejectedValue(dbErr);

      await expect(service.run(defaultInput())).rejects.toBe(dbErr);
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'firmware/esp32c3/0.2.0/esp32c3-v0.2.0.bin',
      );
    });

    it('still re-throws original error when GCS cleanup also fails', async () => {
      const dbErr = new Error('DB connection lost');
      repo.create.mockRejectedValue(dbErr);
      storage.deleteObject.mockRejectedValue(new Error('GCS delete failed'));

      await expect(service.run(defaultInput())).rejects.toBe(dbErr);
    });
  });
});
