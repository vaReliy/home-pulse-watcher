import { NotFoundError } from '@home-pulse-watcher/shared';

/** Structural logger type compatible with NestJS LoggerService and nestjs-pino. */
interface Logger {
  log(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

/** Shape of an error thrown by @google-cloud/storage SDK. */
interface GcsError {
  code?: number;
  message?: string;
}

function isGcsError(err: unknown): err is GcsError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * Wraps a GCS operation and translates GCS-specific errors into domain errors.
 * Mirrors the shape of `withPrismaError` to keep error-handling patterns consistent.
 *
 * @param operation - Human-readable name of the GCS operation (used in log messages).
 * @param fn - Async factory that performs the GCS call.
 * @param logger - Structural logger for recording error metadata.
 */
export async function withGcsError<T>(
  operation: string,
  fn: () => Promise<T>,
  logger: Logger,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isGcsError(err)) {
      logger.error('GCS operation failed', {
        operation,
        code: err.code,
        message: err.message,
      });

      if (err.code === 404) {
        throw new NotFoundError('Firmware object', operation);
      }

      if (err.code === 403) {
        const permissionError = new Error('GCS permission denied') as Error & {
          code: string;
        };
        permissionError.code = 'STORAGE_PERMISSION_DENIED';
        throw permissionError;
      }
    } else {
      logger.error('GCS operation failed with unexpected error', {
        operation,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    throw new Error('GCS operation failed', { cause: err });
  }
}
