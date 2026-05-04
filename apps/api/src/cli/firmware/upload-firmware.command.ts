import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type {
  IFirmwareStorageService,
  IFirmwareReleaseRepository,
  BoardType,
  ReleaseChannel,
} from '@home-pulse-watcher/core';
import {
  BoardType as BoardTypeConst,
  ReleaseChannel as ReleaseChannelConst,
} from '@home-pulse-watcher/core';
import {
  createValidator,
  DatabaseError,
  DatabaseErrorCode,
} from '@home-pulse-watcher/shared';
import { STORAGE_TOKENS } from '../../modules/storage/storage.tokens.js';
import { REPOSITORY_TOKENS } from '../../modules/repositories/repository.tokens.js';

/** Default directory searched when --file is a bare filename without path separators. */
const DEFAULT_FIRMWARE_DIR = './tmp/firmware';

interface UploadFirmwareOptions {
  file: string;
  version: string;
  board: string;
  channel: string;
  critical?: boolean;
}

@Command({
  name: 'firmware:upload',
  description:
    'Upload a firmware binary to GCS and register it as a FirmwareRelease',
})
export class UploadFirmwareCommand extends CommandRunner {
  private readonly logger = new Logger(UploadFirmwareCommand.name);

  constructor(
    @Inject(STORAGE_TOKENS.FIRMWARE_STORAGE)
    private readonly storage: IFirmwareStorageService,
    @Inject(REPOSITORY_TOKENS.FIRMWARE_RELEASE)
    private readonly firmwareRepo: IFirmwareReleaseRepository,
  ) {
    super();
  }

  async run(_inputs: string[], options: UploadFirmwareOptions): Promise<void> {
    try {
      this.validateOptions(options);

      const filePath = this.resolveFilePath(options.file);
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileBasename = basename(filePath);
      const SAFE_BASENAME = /^[A-Za-z0-9._-]+\.bin$/;
      if (!SAFE_BASENAME.test(fileBasename)) {
        throw new Error(`Unsafe firmware filename: ${fileBasename}`);
      }

      const buffer = readFileSync(filePath);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const gcsPath = `firmware/${options.board}/${options.channel}/${options.version}/${fileBasename}`;

      console.log(
        `Uploading ${fileBasename} (${buffer.length} bytes) → ${gcsPath}`,
      );

      try {
        await this.storage.uploadBuffer(
          gcsPath,
          buffer,
          'application/octet-stream',
        );
      } catch (uploadErr) {
        if (this.extractGcsCode(uploadErr) === 412) {
          throw new Error(
            `Release already uploaded — v=${options.version} board=${options.board}. ` +
              `GCS object exists at: ${gcsPath}. ` +
              `Use a different version tag or delete the object manually.`,
          );
        }
        throw uploadErr;
      }

      let release = await this.createReleaseOrCleanup(
        options,
        checksum,
        gcsPath,
      );

      if (options.critical) {
        release = await this.firmwareRepo.markCritical(release.id);
      }

      console.log('\n=== Firmware Release Created ===');
      console.log(`ID:         ${release.id}`);
      console.log(`Version:    ${release.version}`);
      console.log(`Board:      ${release.boardType}`);
      console.log(`Channel:    ${release.channel}`);
      console.log(`Critical:   ${release.isCritical ? 'YES' : 'no'}`);
      console.log(`Checksum:   ${release.checksum}`);
      console.log(`GCS Path:   ${release.gcsPath}`);
      console.log(
        '\nDevices on this channel will discover this release on their next OTA check.\n',
      );
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private async createReleaseOrCleanup(
    options: UploadFirmwareOptions,
    checksum: string,
    gcsPath: string,
  ) {
    try {
      return await this.firmwareRepo.create({
        version: options.version,
        boardType: options.board as BoardType,
        channel: options.channel as ReleaseChannel,
        checksum,
        gcsPath,
      });
    } catch (dbErr) {
      this.logger.warn(
        'DB write failed after GCS upload — attempting GCS cleanup',
        { gcsPath },
      );
      await this.tryDeleteGcsObject(gcsPath);

      if (
        dbErr instanceof DatabaseError &&
        dbErr.code === DatabaseErrorCode.UNIQUE_CONSTRAINT
      ) {
        throw new Error(
          `Release already exists in DB — v=${options.version} board=${options.board}. ` +
            `GCS object cleaned up.`,
        );
      }
      throw dbErr;
    }
  }

  private async tryDeleteGcsObject(gcsPath: string): Promise<void> {
    try {
      await this.storage.deleteObject(gcsPath);
      this.logger.log('GCS cleanup successful', { gcsPath });
    } catch (cleanupErr) {
      this.logger.error(
        `GCS cleanup failed — manual deletion required at: ${gcsPath}`,
        { cleanupErr },
      );
    }
  }

  private validateOptions(options: UploadFirmwareOptions): void {
    const validator = createValidator({
      file: ['required', 'string'],
      version: ['required', 'string', { max_length: 20 }, 'semverVersion'],
      board: ['required', { one_of: Object.values(BoardTypeConst) }],
      channel: ['required', { one_of: Object.values(ReleaseChannelConst) }],
    });

    const result = validator.validate(options);
    if (!result) {
      const errors = validator.getErrors() as Record<string, string>;
      const messages = Object.entries(errors)
        .map(([field, code]) => `  ${field}: ${code}`)
        .join('\n');
      throw new Error(`Validation failed:\n${messages}`);
    }
  }

  private resolveFilePath(file: string): string {
    if (file.includes('/') || file.includes('\\')) {
      return file;
    }
    return join(DEFAULT_FIRMWARE_DIR, file);
  }

  private extractGcsCode(err: unknown): number | undefined {
    if (
      err instanceof Error &&
      err.cause !== null &&
      typeof err.cause === 'object'
    ) {
      const code = (err.cause as Record<string, unknown>)['code'];
      return typeof code === 'number' ? code : undefined;
    }
    return undefined;
  }

  @Option({
    flags: '-f, --file <file>',
    description:
      'Path to firmware binary, or bare filename (searched in ./tmp/firmware/)',
    required: true,
  })
  parseFile(val: string): string {
    return val;
  }

  @Option({
    flags: '-v, --version <version>',
    description: 'Semantic version (e.g. 0.2.0 or 0.2.0-beta.1)',
    required: true,
  })
  parseVersion(val: string): string {
    return val;
  }

  @Option({
    flags: '-b, --board <board>',
    description: 'Board type: esp32c3 or esp32c6',
    required: true,
  })
  parseBoard(val: string): string {
    return val;
  }

  @Option({
    flags: '-c, --channel <channel>',
    description: 'Release channel: ALPHA, BETA, or STABLE',
    required: true,
  })
  parseChannel(val: string): string {
    return val.toUpperCase();
  }

  @Option({
    flags: '--critical',
    description: 'Mark as critical — all devices on the channel must update',
  })
  parseCritical(_val: string): boolean {
    return true;
  }
}
