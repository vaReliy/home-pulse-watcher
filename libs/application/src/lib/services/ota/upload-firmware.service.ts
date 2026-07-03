import { createHash } from 'node:crypto';
import type {
  BoardType,
  FirmwareRelease,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
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
  DomainError,
  DomainErrorCode,
  ValidationError,
  type ServiceResponse,
} from '@home-pulse-watcher/shared';

/** Firmware binary filenames must be a plain basename ending in `.bin` — blocks path traversal. */
const SAFE_BASENAME = /^[A-Za-z0-9._-]+\.bin$/;

export interface UploadFirmwareInput {
  fileBuffer: Buffer;
  fileName: string;
  version: string;
  board: string;
  channel: string;
  critical?: boolean;
}

export interface UploadFirmwareOutput {
  release: FirmwareRelease;
}

/**
 * Uploads a firmware binary to GCS and registers it as a FirmwareRelease.
 *
 * Deliberately not a `BaseService` subclass: `BaseService`'s LIVR validation
 * strips any object key absent from its rules schema, which would silently
 * drop `fileBuffer` (a `Buffer`, not LIVR-representable) from the validated
 * params. Validation runs here on the string subset only, then the result is
 * merged back with the untouched `fileBuffer`/`fileName`/`critical` fields.
 *
 * Shared by the `firmware:upload` CLI command and, in a later unit, an admin
 * HTTP upload route — both supply the binary as an in-memory buffer.
 */
export class UploadFirmwareService {
  constructor(
    private readonly storage: IFirmwareStorageService,
    private readonly firmwareRepo: IFirmwareReleaseRepository,
  ) {}

  async run(
    input: UploadFirmwareInput,
  ): Promise<ServiceResponse<UploadFirmwareOutput>> {
    const validated = this.validate(input);
    const release = await this.execute(validated);
    return { data: { release } };
  }

  private validate(input: UploadFirmwareInput): UploadFirmwareInput {
    const validator = createValidator<
      Pick<UploadFirmwareInput, 'version' | 'board' | 'channel'>
    >({
      version: ['required', 'string', { max_length: 20 }, 'semverVersion'],
      board: ['required', { one_of: Object.values(BoardTypeConst) }],
      channel: ['required', { one_of: Object.values(ReleaseChannelConst) }],
    });

    const result = validator.validate({
      version: input.version,
      board: input.board,
      channel: input.channel,
    });

    if (!result) {
      const errors = validator.getErrors() as Record<string, string>;
      throw new ValidationError(errors);
    }

    return { ...input, ...result };
  }

  private async execute(input: UploadFirmwareInput): Promise<FirmwareRelease> {
    if (!SAFE_BASENAME.test(input.fileName)) {
      throw new DomainError(
        DomainErrorCode.INVALID_FIRMWARE_FILENAME,
        `Unsafe firmware filename: ${input.fileName}`,
      );
    }

    const checksum = createHash('sha256')
      .update(input.fileBuffer)
      .digest('hex');
    const gcsPath = `firmware/${input.board}/${input.version}/${input.fileName}`;

    try {
      await this.storage.uploadBuffer(
        gcsPath,
        input.fileBuffer,
        'application/octet-stream',
      );
    } catch (uploadErr) {
      if (this.extractGcsCode(uploadErr) === 412) {
        throw new DomainError(
          DomainErrorCode.FIRMWARE_RELEASE_ALREADY_EXISTS,
          `Release already uploaded — v=${input.version} board=${input.board}. ` +
            `GCS object exists at: ${gcsPath}. ` +
            `Use a different version tag or delete the object manually.`,
        );
      }
      throw uploadErr;
    }

    let release = await this.createReleaseOrCleanup(input, checksum, gcsPath);

    if (input.critical) {
      release = await this.firmwareRepo.markCritical(release.id);
    }

    return release;
  }

  private async createReleaseOrCleanup(
    input: UploadFirmwareInput,
    checksum: string,
    gcsPath: string,
  ): Promise<FirmwareRelease> {
    try {
      return await this.firmwareRepo.create({
        version: input.version,
        boardType: input.board as BoardType,
        channel: input.channel as ReleaseChannel,
        checksum,
        gcsPath,
      });
    } catch (dbErr) {
      await this.tryDeleteGcsObject(gcsPath);

      if (
        dbErr instanceof DatabaseError &&
        dbErr.code === DatabaseErrorCode.UNIQUE_CONSTRAINT
      ) {
        throw new DomainError(
          DomainErrorCode.FIRMWARE_RELEASE_ALREADY_EXISTS,
          `Release already exists in DB — v=${input.version} board=${input.board}. ` +
            `GCS object cleaned up.`,
        );
      }
      throw dbErr;
    }
  }

  private async tryDeleteGcsObject(gcsPath: string): Promise<void> {
    try {
      await this.storage.deleteObject(gcsPath);
    } catch {
      // Best-effort cleanup — a leaked GCS object is a lesser issue than
      // masking the original DB failure by throwing the cleanup error instead.
    }
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
}
