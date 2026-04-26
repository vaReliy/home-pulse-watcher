import type { Provider } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { Logger } from 'nestjs-pino';
import { GcsService } from '@home-pulse-watcher/infrastructure';
import { STORAGE_TOKENS } from './storage.tokens.js';

/** Structural type for the parsed GCP service account key JSON. */
interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function parseServiceAccountKey(raw: string): ServiceAccountKey {
  try {
    return JSON.parse(raw) as ServiceAccountKey;
  } catch {
    throw new Error(
      `GCP_SERVICE_ACCOUNT_KEY is set but contains invalid JSON. Provide a valid service account key JSON string.`,
    );
  }
}

export const storageProvider: Provider = {
  provide: STORAGE_TOKENS.FIRMWARE_STORAGE,
  useFactory: (logger: Logger): GcsService => {
    const bucketName = process.env['GCS_BUCKET_NAME'];
    if (!bucketName) {
      throw new Error(
        'GCS_BUCKET_NAME environment variable is required but not set.',
      );
    }

    const rawKey = process.env['GCP_SERVICE_ACCOUNT_KEY'];
    let storage: Storage;

    if (rawKey) {
      const credentials = parseServiceAccountKey(rawKey);
      storage = new Storage({
        credentials,
        projectId: credentials.project_id,
      });
    } else {
      // Use Application Default Credentials (ADC) when no explicit key is provided
      storage = new Storage();
    }

    return new GcsService({ bucket: storage.bucket(bucketName), logger });
  },
  inject: [Logger], // LoggerModule is @Global() — no local import needed
};
