import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  IFirmwareStorageService,
  IFirmwareReleaseRepository,
  FirmwareRelease,
} from '@home-pulse-watcher/core';
import {
  livrValidatorFactory,
  DatabaseError,
  DatabaseErrorCode,
} from '@home-pulse-watcher/shared';
import { UploadFirmwareCommand } from './upload-firmware.command.js';

jest.mock('node:fs');
jest.mock('node:path', () => ({
  ...jest.requireActual('node:path'),
  join: jest.fn((...parts: string[]) =>
    jest.requireActual<typeof path>('node:path').join(...parts),
  ),
}));

const mockFs = jest.mocked(fs);

const FIXTURE_BUFFER = Buffer.from('fake-firmware-binary');
const FIXTURE_SHA256 =
  'eee3bb7c59e0fd24e21fd3a7e0e60edd42f8ff3b3aeac45c41bae6ec0c7bf059';

const FIXTURE_RELEASE: FirmwareRelease = {
  id: 'release-uuid',
  version: '0.2.0',
  boardType: 'esp32c3',
  channel: 'ALPHA',
  checksum: FIXTURE_SHA256,
  gcsPath: 'firmware/esp32c3/ALPHA/0.2.0/esp32c3-v0.2.0.bin',
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
    markCritical: jest
      .fn()
      .mockResolvedValue({ ...FIXTURE_RELEASE, isCritical: true }),
  };
}

function makeCommand(
  storage: IFirmwareStorageService,
  repo: IFirmwareReleaseRepository,
): UploadFirmwareCommand {
  // NestJS @Inject decorators are metadata only — direct construction works in unit tests.
  return new UploadFirmwareCommand(storage, repo);
}

function defaultOptions(
  overrides: Partial<{
    file: string;
    version: string;
    board: string;
    channel: string;
    critical: boolean;
  }> = {},
) {
  return {
    file: 'esp32c3-v0.2.0.bin',
    version: '0.2.0',
    board: 'esp32c3',
    channel: 'ALPHA',
    ...overrides,
  };
}

describe('UploadFirmwareCommand', () => {
  let storage: jest.Mocked<IFirmwareStorageService>;
  let repo: jest.Mocked<IFirmwareReleaseRepository>;
  let command: UploadFirmwareCommand;
  let exitSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeAll(() => {
    livrValidatorFactory.initialize();
  });

  beforeEach(() => {
    storage = makeMockStorage();
    repo = makeMockRepo();
    command = makeCommand(storage, repo);

    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    // Default: file exists, readFileSync returns fixture buffer
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(FIXTURE_BUFFER);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('success path', () => {
    it('uploads file, creates DB record, and prints summary', async () => {
      await command.run([], defaultOptions());

      expect(storage.uploadBuffer).toHaveBeenCalledWith(
        'firmware/esp32c3/ALPHA/0.2.0/esp32c3-v0.2.0.bin',
        FIXTURE_BUFFER,
        'application/octet-stream',
      );
      expect(repo.create).toHaveBeenCalledWith({
        version: '0.2.0',
        boardType: 'esp32c3',
        channel: 'ALPHA',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        gcsPath: 'firmware/esp32c3/ALPHA/0.2.0/esp32c3-v0.2.0.bin',
      });
      // Signed URL is no longer printed to stdout (H1 security fix) — devices fetch it via OTA check endpoint.
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firmware Release Created'),
      );
    });

    it('marks release as critical when --critical flag is set', async () => {
      await command.run([], defaultOptions({ critical: true }));

      expect(repo.markCritical).toHaveBeenCalledWith(FIXTURE_RELEASE.id);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('resolves bare filename against ./tmp/firmware/ default dir', async () => {
      await command.run([], defaultOptions({ file: 'esp32c3-v0.2.0.bin' }));

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('tmp/firmware/esp32c3-v0.2.0.bin'),
      );
    });

    it('uses absolute path as-is when file contains a slash', async () => {
      await command.run(
        [],
        defaultOptions({ file: '/custom/path/esp32c3-v0.2.0.bin' }),
      );

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        '/custom/path/esp32c3-v0.2.0.bin',
      );
    });
  });

  describe('file not found', () => {
    it('exits with code 1 when file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await command.run([], defaultOptions());

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });
  });

  describe('validation errors', () => {
    it('exits with code 1 when version is not semver', async () => {
      await command.run([], defaultOptions({ version: 'not-semver' }));

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });

    it('exits with code 1 when board is not in enum', async () => {
      await command.run([], defaultOptions({ board: 'esp32xx' }));

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });

    it('exits with code 1 when channel is invalid', async () => {
      await command.run([], defaultOptions({ channel: 'NIGHTLY' }));

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });
  });

  describe('GCS conflict (412 — already uploaded)', () => {
    it('exits with code 1 and does NOT create a DB record', async () => {
      const gcsConflictErr = new Error('GCS operation failed', {
        cause: { code: 412, message: 'Precondition Failed' },
      });
      storage.uploadBuffer.mockRejectedValue(gcsConflictErr);

      await command.run([], defaultOptions());

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('DB failure after successful GCS upload', () => {
    it('triggers GCS cleanup and exits 1 on unique-constraint violation', async () => {
      repo.create.mockRejectedValue(
        new DatabaseError(
          DatabaseErrorCode.UNIQUE_CONSTRAINT,
          'FirmwareRelease already exists',
        ),
      );

      await command.run([], defaultOptions());

      expect(storage.deleteObject).toHaveBeenCalledWith(
        'firmware/esp32c3/ALPHA/0.2.0/esp32c3-v0.2.0.bin',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('triggers GCS cleanup and re-throws on generic DB error', async () => {
      repo.create.mockRejectedValue(new Error('DB connection lost'));

      await command.run([], defaultOptions());

      expect(storage.deleteObject).toHaveBeenCalledWith(
        'firmware/esp32c3/ALPHA/0.2.0/esp32c3-v0.2.0.bin',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('still exits 1 when GCS cleanup also fails', async () => {
      repo.create.mockRejectedValue(new Error('DB connection lost'));
      storage.deleteObject.mockRejectedValue(new Error('GCS delete failed'));

      await command.run([], defaultOptions());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
