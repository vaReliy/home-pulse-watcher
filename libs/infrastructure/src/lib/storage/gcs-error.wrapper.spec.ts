import { NotFoundError } from '@home-pulse-watcher/shared';
import {
  withGcsError,
  StorageUnavailableError,
  StoragePermissionError,
} from './gcs-error.wrapper.js';

function makeLogger() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function networkError(code: string): Error {
  return Object.assign(new Error(`network error: ${code}`), { code });
}

function gcsError(code: number, message = 'GCS error'): Error {
  return Object.assign(new Error(message), { code });
}

describe('withGcsError — network error classification (Bug #2)', () => {
  const logger = makeLogger();

  it.each([
    'ENOTFOUND',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'ENETUNREACH',
  ])('wraps %s error as StorageUnavailableError', async (code) => {
    await expect(
      withGcsError('upload', () => Promise.reject(networkError(code)), logger),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('sets the operation name on StorageUnavailableError', async () => {
    let thrown: unknown;
    try {
      await withGcsError(
        'my-operation',
        () => Promise.reject(networkError('ENOTFOUND')),
        logger,
      );
    } catch (e) {
      thrown = e;
    }
    expect((thrown as StorageUnavailableError).message).toContain(
      'my-operation',
    );
  });

  it('attaches the original error as .cause on StorageUnavailableError', async () => {
    const original = networkError('ETIMEDOUT');
    let thrown: unknown;
    try {
      await withGcsError('op', () => Promise.reject(original), logger);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as StorageUnavailableError).cause).toBe(original);
  });

  it('logs before throwing StorageUnavailableError', async () => {
    const errorLogger = makeLogger();
    await withGcsError(
      'op',
      () => Promise.reject(networkError('ECONNREFUSED')),
      errorLogger,
    ).catch(() => undefined);
    expect(errorLogger.error).toHaveBeenCalled();
  });

  it('never leaves an unhandled rejection for network errors', async () => {
    const results: Array<'resolved' | 'rejected'> = [];
    try {
      await withGcsError(
        'op',
        () => Promise.reject(networkError('ENOTFOUND')),
        logger,
      );
    } catch {
      results.push('rejected');
    }
    expect(results).toEqual(['rejected']);
  });
});

describe('withGcsError — GCS HTTP error classification', () => {
  const logger = makeLogger();

  it('translates 404 into NotFoundError (not StorageUnavailableError)', async () => {
    await expect(
      withGcsError('fetch', () => Promise.reject(gcsError(404)), logger),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('translates 403 into StoragePermissionError (httpStatus 403)', async () => {
    let thrown: unknown;
    try {
      await withGcsError('fetch', () => Promise.reject(gcsError(403)), logger);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(StoragePermissionError);
    expect((thrown as StoragePermissionError).httpStatus).toBe(403);
    expect((thrown as StoragePermissionError).code).toBe(
      'STORAGE_PERMISSION_DENIED',
    );
  });

  it('404 error is not classified as StorageUnavailableError', async () => {
    let thrown: unknown;
    try {
      await withGcsError('fetch', () => Promise.reject(gcsError(404)), logger);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).not.toBeInstanceOf(StorageUnavailableError);
  });

  it('403 error is not classified as StorageUnavailableError', async () => {
    let thrown: unknown;
    try {
      await withGcsError('fetch', () => Promise.reject(gcsError(403)), logger);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).not.toBeInstanceOf(StorageUnavailableError);
  });

  it('wraps unrecognised GCS errors (e.g. 500) with { cause }', async () => {
    const original = gcsError(500, 'Internal Server Error');
    let thrown: unknown;
    try {
      await withGcsError('op', () => Promise.reject(original), logger);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error & { cause?: unknown }).cause).toBe(original);
  });
});

describe('withGcsError — success path', () => {
  it('passes through the resolved value unchanged', async () => {
    const logger = makeLogger();
    const result = await withGcsError('op', () => Promise.resolve(42), logger);
    expect(result).toBe(42);
  });
});

describe('StoragePermissionError', () => {
  it('has code STORAGE_PERMISSION_DENIED', () => {
    expect(new StoragePermissionError('upload').code).toBe(
      'STORAGE_PERMISSION_DENIED',
    );
  });

  it('has httpStatus 403', () => {
    expect(new StoragePermissionError('upload').httpStatus).toBe(403);
  });

  it('is an instance of Error', () => {
    expect(new StoragePermissionError('upload')).toBeInstanceOf(Error);
  });
});

describe('StorageUnavailableError', () => {
  it('has code STORAGE_UNAVAILABLE', () => {
    const err = new StorageUnavailableError('upload');
    expect(err.code).toBe('STORAGE_UNAVAILABLE');
  });

  it('is an instance of Error', () => {
    expect(new StorageUnavailableError('upload')).toBeInstanceOf(Error);
  });

  it('sets name to StorageUnavailableError', () => {
    expect(new StorageUnavailableError('upload').name).toBe(
      'StorageUnavailableError',
    );
  });
});
