import { NotFoundError } from '@home-pulse-watcher/shared';
import { GcsService } from './gcs.service.js';
import { withGcsError } from './gcs-error.wrapper.js';

/** Signed URL validity window in milliseconds (15 minutes) — mirrors the constant in gcs.service.ts. */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

function makeLogger() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function makeFileMock() {
  return {
    save: jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<
      () => Promise<void>
    >,
    getSignedUrl: jest
      .fn()
      .mockResolvedValue([
        'https://signed.url/firmware.bin',
      ]) as jest.MockedFunction<() => Promise<[string]>>,
  };
}

function makeBucketMock(fileMock: ReturnType<typeof makeFileMock>) {
  return {
    file: jest.fn().mockReturnValue(fileMock),
  };
}

describe('GcsService', () => {
  let logger: ReturnType<typeof makeLogger>;
  let fileMock: ReturnType<typeof makeFileMock>;
  let bucketMock: ReturnType<typeof makeBucketMock>;
  let service: GcsService;

  beforeEach(() => {
    jest.useFakeTimers();
    logger = makeLogger();
    fileMock = makeFileMock();
    bucketMock = makeBucketMock(fileMock);
    service = new GcsService({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bucket: bucketMock as any,
      logger,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('uploadBuffer', () => {
    it('calls file.save with correct options', async () => {
      const buffer = Buffer.from('firmware-binary');
      const contentType = 'application/octet-stream';

      await service.uploadBuffer('firmware/v1.0.0/fw.bin', buffer, contentType);

      expect(bucketMock.file).toHaveBeenCalledWith('firmware/v1.0.0/fw.bin');
      expect(fileMock.save).toHaveBeenCalledWith(buffer, {
        contentType,
        resumable: false,
        validation: 'crc32c',
        ifGenerationMatch: 0,
      });
    });

    it('logs info on successful upload', async () => {
      const buffer = Buffer.from('data');
      await service.uploadBuffer(
        'path/fw.bin',
        buffer,
        'application/octet-stream',
      );

      expect(logger.log).toHaveBeenCalledWith(
        'GCS upload complete',
        expect.objectContaining({
          path: 'path/fw.bin',
          size: buffer.length,
          contentType: 'application/octet-stream',
        }),
      );
    });

    it('logs error and re-throws on failure', async () => {
      const gcsError = Object.assign(new Error('GCS write failed'), {
        code: 500,
      });
      fileMock.save.mockRejectedValueOnce(gcsError);

      await expect(
        service.uploadBuffer(
          'path/fw.bin',
          Buffer.from('x'),
          'application/octet-stream',
        ),
      ).rejects.toThrow('GCS operation failed');

      expect(logger.error).toHaveBeenCalled();
    });

    it('translates a 404 SDK error into NotFoundError', async () => {
      const gcsError = Object.assign(new Error('Not Found'), { code: 404 });
      fileMock.save.mockRejectedValueOnce(gcsError);

      await expect(
        service.uploadBuffer(
          'missing/path',
          Buffer.from('x'),
          'application/octet-stream',
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getSignedUrl', () => {
    it('calls file.getSignedUrl with v4, read action, and correct expiry', async () => {
      const now = 1_700_000_000_000;
      jest.setSystemTime(now);

      await service.getSignedUrl('firmware/v1.0.0/fw.bin');

      expect(bucketMock.file).toHaveBeenCalledWith('firmware/v1.0.0/fw.bin');
      expect(fileMock.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: now + SIGNED_URL_TTL_MS,
      });
    });

    it('returns the URL string from the SDK response tuple', async () => {
      const expectedUrl = 'https://signed.url/firmware.bin';
      fileMock.getSignedUrl.mockResolvedValueOnce([expectedUrl]);

      const result = await service.getSignedUrl('firmware/v1.0.0/fw.bin');

      expect(result).toBe(expectedUrl);
    });

    it('logs error and re-throws on failure', async () => {
      const gcsError = Object.assign(new Error('GCS read failed'), {
        code: 500,
      });
      fileMock.getSignedUrl.mockRejectedValueOnce(gcsError);

      await expect(
        service.getSignedUrl('firmware/v1.0.0/fw.bin'),
      ).rejects.toThrow('GCS operation failed');

      expect(logger.error).toHaveBeenCalled();
    });

    it('translates a 404 SDK error into NotFoundError', async () => {
      const gcsError = Object.assign(new Error('Not Found'), { code: 404 });
      fileMock.getSignedUrl.mockRejectedValueOnce(gcsError);

      await expect(service.getSignedUrl('missing/path')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});

describe('withGcsError', () => {
  const logger = makeLogger();

  it('passes through successful results', async () => {
    const result = await withGcsError(
      'test-op',
      () => Promise.resolve('ok'),
      logger,
    );
    expect(result).toBe('ok');
  });

  it('translates a { code: 404 } SDK error into NotFoundError', async () => {
    const gcsError = Object.assign(new Error('Not Found'), { code: 404 });

    await expect(
      withGcsError('fetch-op', () => Promise.reject(gcsError), logger),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('translates a { code: 403 } SDK error into a permission error', async () => {
    const gcsError = Object.assign(new Error('Forbidden'), { code: 403 });

    await expect(
      withGcsError('fetch-op', () => Promise.reject(gcsError), logger),
    ).rejects.toMatchObject({ code: 'STORAGE_PERMISSION_DENIED' });
  });

  it('wraps unrecognised GCS errors with { cause }', async () => {
    const gcsError = Object.assign(new Error('Internal'), { code: 500 });

    let thrown: unknown;
    try {
      await withGcsError('op', () => Promise.reject(gcsError), logger);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error & { cause?: unknown }).cause).toBe(gcsError);
  });

  it('logs error metadata before re-throwing', async () => {
    const errorLogger = makeLogger();
    const gcsError = Object.assign(new Error('Oops'), { code: 503 });

    await withGcsError(
      'log-op',
      () => Promise.reject(gcsError),
      errorLogger,
    ).catch(() => undefined);

    expect(errorLogger.error).toHaveBeenCalled();
  });
});
