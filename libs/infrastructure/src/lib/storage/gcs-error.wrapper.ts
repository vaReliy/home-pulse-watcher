import { BaseError, NotFoundError } from '@home-pulse-watcher/shared';

/** Structural logger type compatible with NestJS LoggerService and nestjs-pino. */
interface Logger {
  log(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

/** Shape of an error thrown by @google-cloud/storage SDK. */
interface GcsError {
  code?: number | string;
  message?: string;
}

/** POSIX/Node.js network error codes that indicate GCS is unreachable. */
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ENETUNREACH',
]);

/**
 * Thrown when GCS cannot be reached due to a network or availability issue.
 * Maps to HTTP 503 Service Unavailable via ServiceExceptionFilter.
 */
export class StorageUnavailableError extends BaseError {
  readonly code = 'STORAGE_UNAVAILABLE';
  readonly httpStatus = 503;

  constructor(operation: string, cause?: unknown) {
    super(`GCS storage unreachable during "${operation}"`);
    // Set standard Node 18+ error cause for error chain introspection.
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function isGcsError(err: unknown): err is GcsError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as Record<string, unknown>)['code'];
  return typeof code === 'string' && NETWORK_ERROR_CODES.has(code);
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
    // Network errors: GCS unreachable — typed as StorageUnavailableError (→ HTTP 503).
    if (isNetworkError(err)) {
      const code = (err as Record<string, unknown>)['code'];
      logger.error('GCS unreachable — network error', { operation, code });
      throw new StorageUnavailableError(operation, err);
    }

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
