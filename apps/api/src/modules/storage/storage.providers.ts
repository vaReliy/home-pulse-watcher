import type { Provider } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { Logger } from 'nestjs-pino';
import type { IFirmwareStorageService } from '@home-pulse-watcher/core';
import { GcsService } from '@home-pulse-watcher/infrastructure';
import { STORAGE_TOKENS } from './storage.tokens.js';
import { normalizePemKey } from './pem-key.util.js';

/** Structural type for the parsed GCP service account key JSON. */
interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(raw) as ServiceAccountKey;
  } catch {
    throw new Error(
      `GCP_SERVICE_ACCOUNT_KEY is set but contains invalid JSON. Provide a valid service account key JSON string.`,
    );
  }

  // Normalize private_key: JSON serialization or env var interpolation may produce
  // literal two-char sequences `\n` / `\r\n` instead of real newline characters.
  // OpenSSL 3 rejects PEM blocks with corrupted line breaks.
  if (!parsed.private_key) {
    throw new Error(
      'GCP_SERVICE_ACCOUNT_KEY: private_key does not look like a valid PEM block. ' +
        'Expected it to start with "-----BEGIN". Check that the key is not corrupted or truncated.',
    );
  }

  parsed.private_key = normalizePemKey(parsed.private_key);

  if (!parsed.private_key.startsWith('-----BEGIN')) {
    throw new Error(
      'GCP_SERVICE_ACCOUNT_KEY: private_key does not look like a valid PEM block. ' +
        'Expected it to start with "-----BEGIN". Check that the key is not corrupted or truncated.',
    );
  }

  return parsed;
}

/**
 * No-op storage implementation used when GCS_BUCKET_NAME is not configured.
 * All methods throw 503 so that OTA endpoints degrade gracefully instead of
 * crashing the server at bootstrap.
 */
class NullFirmwareStorageService implements IFirmwareStorageService {
  uploadBuffer(
    _path: string,
    _buffer: Buffer,
    _contentType: string,
  ): Promise<void> {
    throw new ServiceUnavailableException(
      'OTA storage is not configured (GCS_BUCKET_NAME missing)',
    );
  }

  getSignedUrl(_gcsPath: string): Promise<string> {
    throw new ServiceUnavailableException(
      'OTA storage is not configured (GCS_BUCKET_NAME missing)',
    );
  }

  deleteObject(_gcsPath: string): Promise<void> {
    throw new ServiceUnavailableException(
      'OTA storage is not configured (GCS_BUCKET_NAME missing)',
    );
  }
}

export const storageProvider: Provider = {
  provide: STORAGE_TOKENS.FIRMWARE_STORAGE,
  useFactory: (logger: Logger): IFirmwareStorageService => {
    const bucketName = process.env['GCS_BUCKET_NAME'];
    if (!bucketName) {
      return new NullFirmwareStorageService();
    }

    const rawKey = process.env['GCP_SERVICE_ACCOUNT_KEY'];
    let storage: Storage;

    /** Shared retry/timeout config — prevents long hangs and late socket errors when offline. */
    const retryOptions = {
      autoRetry: true,
      maxRetries: 2,
      retryDelayMultiplier: 2,
      maxRetryDelay: 5000,
    };

    if (rawKey) {
      const credentials = parseServiceAccountKey(rawKey);
      storage = new Storage({
        credentials,
        projectId: credentials.project_id,
        retryOptions,
        timeout: 10_000,
      });
    } else {
      // Use Application Default Credentials (ADC) when no explicit key is provided
      storage = new Storage({ retryOptions, timeout: 10_000 });
    }

    return new GcsService({ bucket: storage.bucket(bucketName), logger });
  },
  inject: [Logger], // LoggerModule is @Global() — no local import needed
};
