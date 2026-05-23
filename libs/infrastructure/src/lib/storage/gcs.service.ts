import type { IFirmwareStorageService } from '@home-pulse-watcher/core';
import { SIGNED_URL_TTL_MS } from '@home-pulse-watcher/core';
import { withGcsError } from './gcs-error.wrapper.js';

/** Structural logger type compatible with NestJS LoggerService and nestjs-pino. */
interface Logger {
  log(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

/** Minimal structural interface for a GCS bucket — avoids CJS/ESM dual-build type conflicts. */
interface GcsBucket {
  file(path: string): {
    save(
      data: Buffer,
      options: {
        contentType: string;
        resumable: boolean;
        validation: string;
        ifGenerationMatch?: number;
      },
    ): Promise<void>;
    getSignedUrl(options: {
      version: 'v4';
      action: 'read' | 'write' | 'delete' | 'resumable';
      expires: number;
    }): Promise<[string]>;
    delete(): Promise<unknown>;
  };
}

interface GcsServiceDeps {
  bucket: GcsBucket;
  logger: Logger;
}

/** GCS-backed implementation of IFirmwareStorageService. */
export class GcsService implements IFirmwareStorageService {
  private readonly bucket: GcsBucket;
  private readonly logger: Logger;

  constructor({ bucket, logger }: GcsServiceDeps) {
    this.bucket = bucket;
    this.logger = logger;
  }

  /**
   * Uploads a binary buffer to the given GCS path.
   * Uses CRC32C validation to guard against data corruption in transit.
   */
  async uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await withGcsError(
      `uploadBuffer:${path}`,
      () =>
        this.bucket.file(path).save(buffer, {
          contentType,
          resumable: false,
          validation: 'crc32c',
          ifGenerationMatch: 0,
        }),
      this.logger,
    );
    this.logger.log('GCS upload complete', {
      path,
      size: buffer.length,
      contentType,
    });
  }

  /**
   * Generates a short-lived v4 signed URL for reading the given GCS object.
   * The URL is valid for {@link SIGNED_URL_TTL_MS} milliseconds from the time of generation.
   */
  async getSignedUrl(gcsPath: string): Promise<string> {
    const [url] = await withGcsError(
      `getSignedUrl:${gcsPath}`,
      () =>
        this.bucket.file(gcsPath).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + SIGNED_URL_TTL_MS,
        }),
      this.logger,
    );
    return url;
  }

  /**
   * Deletes a GCS object at the given path.
   * Used for best-effort cleanup after a failed DB write.
   */
  async deleteObject(gcsPath: string): Promise<void> {
    await withGcsError(
      `deleteObject:${gcsPath}`,
      () => this.bucket.file(gcsPath).delete(),
      this.logger,
    );
    this.logger.log('GCS object deleted', { path: gcsPath });
  }
}
