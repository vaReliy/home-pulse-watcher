import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UploadFirmwareService } from '@home-pulse-watcher/application';
import type { FirmwareRelease } from '@home-pulse-watcher/core';
import { DomainError, DomainErrorCode } from '@home-pulse-watcher/shared';
import type { InquirerService } from 'nest-commander';
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

const FIXTURE_RELEASE: FirmwareRelease = {
  id: 'release-uuid',
  version: '0.2.0',
  boardType: 'esp32c3',
  channel: 'ALPHA',
  checksum: 'eee3bb7c59e0fd24e21fd3a7e0e60edd42f8ff3b3aeac45c41bae6ec0c7bf059',
  gcsPath: 'firmware/esp32c3/0.2.0/esp32c3-v0.2.0.bin',
  isCritical: false,
  createdAt: new Date('2026-04-29T00:00:00Z'),
} as FirmwareRelease;

function makeMockService(): jest.Mocked<UploadFirmwareService> {
  return {
    run: jest.fn().mockResolvedValue({ data: { release: FIXTURE_RELEASE } }),
  } as unknown as jest.Mocked<UploadFirmwareService>;
}

function makeMockInquirer(
  answers: Record<string, unknown> = {},
): jest.Mocked<InquirerService> {
  return {
    ask: jest.fn().mockImplementation((_name, options) => ({
      version: '0.2.0',
      board: 'esp32c3',
      channel: 'ALPHA',
      ...options,
      ...answers,
    })),
  } as unknown as jest.Mocked<InquirerService>;
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
  let uploadFirmwareService: jest.Mocked<UploadFirmwareService>;
  let inquirer: jest.Mocked<InquirerService>;
  let command: UploadFirmwareCommand;
  let exitSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    uploadFirmwareService = makeMockService();
    inquirer = makeMockInquirer();
    command = new UploadFirmwareCommand(uploadFirmwareService, inquirer);

    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(FIXTURE_BUFFER);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('success path', () => {
    it('reads the file and delegates to UploadFirmwareService', async () => {
      await command.run([], defaultOptions());

      expect(uploadFirmwareService.run).toHaveBeenCalledWith({
        fileBuffer: FIXTURE_BUFFER,
        fileName: 'esp32c3-v0.2.0.bin',
        version: '0.2.0',
        board: 'esp32c3',
        channel: 'ALPHA',
        critical: undefined,
      });
      expect(exitSpy).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firmware Release Created'),
      );
    });

    it('passes critical=true through when --critical flag is set', async () => {
      await command.run([], defaultOptions({ critical: true }));

      expect(uploadFirmwareService.run).toHaveBeenCalledWith(
        expect.objectContaining({ critical: true }),
      );
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

    it('prompts via InquirerService for missing version/board/channel', async () => {
      await command.run([], { file: 'esp32c3-v0.2.0.bin' });

      expect(inquirer.ask).toHaveBeenCalledWith('upload-firmware-questions', {
        file: 'esp32c3-v0.2.0.bin',
      });
      expect(uploadFirmwareService.run).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '0.2.0',
          board: 'esp32c3',
          channel: 'ALPHA',
        }),
      );
    });
  });

  describe('file not found', () => {
    it('exits with code 1 when file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await command.run([], defaultOptions());

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(uploadFirmwareService.run).not.toHaveBeenCalled();
    });
  });

  describe('service errors', () => {
    it('exits with code 1 when the service throws a domain error', async () => {
      uploadFirmwareService.run.mockRejectedValue(
        new DomainError(
          DomainErrorCode.FIRMWARE_RELEASE_ALREADY_EXISTS,
          'Release already uploaded',
        ),
      );

      await command.run([], defaultOptions());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
