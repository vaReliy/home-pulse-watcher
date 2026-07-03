import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'node:http';
import type {
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
} from '@home-pulse-watcher/core';
import {
  BoardType,
  ReleaseChannel,
  FirmwareRelease,
} from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  ValidationError,
  livrValidatorFactory,
} from '@home-pulse-watcher/shared';
import {
  UploadFirmwareService,
  ListFirmwareReleasesService,
} from '@home-pulse-watcher/application';
import { AllExceptionsFilter } from '../../filters/all-exceptions.filter.js';
import { ServiceExceptionFilter } from '../../filters/service-exception.filter.js';
import { SERVICE_TOKENS } from '../../modules/services/service.tokens.js';
import { AdminFirmwareController } from './admin-firmware.controller.js';

const ADMIN_TOKEN = 'test-admin-token';

const mockRelease = new FirmwareRelease({
  id: 'release-1',
  version: '1.2.3',
  boardType: BoardType.ESP32_C3,
  channel: ReleaseChannel.STABLE,
  checksum: 'sha256checksum',
  gcsPath: 'firmware/esp32c3/1.2.3/fw.bin',
  isCritical: false,
  createdAt: new Date('2024-01-15'),
});

interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
}

function get(
  server: http.Server,
  path: string,
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;

    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(data) as Record<string, unknown>,
            });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: {} });
          }
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

/** Builds a minimal multipart/form-data body for the firmware upload route. */
function buildMultipartUpload(fields: {
  version: string;
  board: string;
  channel: string;
  critical?: string;
  fileName?: string;
  fileContent?: Buffer;
  omitFile?: boolean;
}): { body: Buffer; contentType: string } {
  const boundary = '----HomePulseTestBoundary';
  const parts: Buffer[] = [];

  const addField = (name: string, value: string): void => {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  };

  addField('version', fields.version);
  addField('board', fields.board);
  addField('channel', fields.channel);
  if (fields.critical !== undefined) {
    addField('critical', fields.critical);
  }

  if (!fields.omitFile) {
    const fileName = fields.fileName ?? 'firmware.bin';
    const fileContent = fields.fileContent ?? Buffer.from('binary-data');
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      fileContent,
      Buffer.from('\r\n'),
    );
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function postMultipart(
  server: http.Server,
  path: string,
  multipart: { body: Buffer; contentType: string },
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': multipart.contentType,
          'Content-Length': multipart.body.length,
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(data) as Record<string, unknown>,
            });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: {} });
          }
        });
      },
    );

    req.on('error', reject);
    req.write(multipart.body);
    req.end();
  });
}

describe('AdminFirmwareController (integration)', () => {
  let app: INestApplication;
  let httpServer: http.Server;
  let mockFirmwareRepo: jest.Mocked<IFirmwareReleaseRepository>;
  let mockStorageService: jest.Mocked<IFirmwareStorageService>;

  beforeAll(() => {
    livrValidatorFactory.initialize();
    process.env['ADMIN_UPLOAD_TOKEN'] = ADMIN_TOKEN;
  });

  afterAll(() => {
    delete process.env['ADMIN_UPLOAD_TOKEN'];
  });

  beforeEach(async () => {
    mockFirmwareRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByVersionAndBoard: jest.fn(),
      findLatestForBoard: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      markCritical: jest.fn(),
    };

    mockStorageService = {
      uploadBuffer: jest.fn(),
      getSignedUrl: jest.fn(),
      deleteObject: jest.fn(),
    };

    const uploadFirmwareService = new UploadFirmwareService(
      mockStorageService,
      mockFirmwareRepo,
    );
    const listFirmwareReleasesService = new ListFirmwareReleasesService(
      mockFirmwareRepo,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminFirmwareController],
      providers: [
        {
          provide: SERVICE_TOKENS.UPLOAD_FIRMWARE,
          useValue: uploadFirmwareService,
        },
        {
          provide: SERVICE_TOKENS.LIST_FIRMWARE_RELEASES,
          useValue: listFirmwareReleasesService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(
      new AllExceptionsFilter(),
      new ServiceExceptionFilter(),
    );
    await app.listen(0);
    httpServer = app.getHttpServer() as http.Server;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /admin/firmware', () => {
    it('returns the unauthenticated HTML upload page', async () => {
      const response = await new Promise<{
        status: number;
        contentType: string | undefined;
      }>((resolve, reject) => {
        const address = httpServer.address();
        const port = address && typeof address === 'object' ? address.port : 0;
        const req = http.request(
          { host: '127.0.0.1', port, path: '/admin/firmware', method: 'GET' },
          (res) => {
            res.on('data', () => undefined);
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                contentType: res.headers['content-type'],
              }),
            );
          },
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.status).toBe(200);
      expect(response.contentType).toContain('text/html');
    });
  });

  describe('GET /admin/firmware/releases', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const response = await get(httpServer, '/admin/firmware/releases');
      expect(response.status).toBe(401);
    });

    it('returns 401 when the bearer token is wrong', async () => {
      const response = await get(httpServer, '/admin/firmware/releases', {
        Authorization: 'Bearer wrong-token',
      });
      expect(response.status).toBe(401);
    });

    it('returns 200 with the findAll()-backed release list', async () => {
      mockFirmwareRepo.findAll.mockResolvedValue([mockRelease]);

      const response = await get(httpServer, '/admin/firmware/releases', {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      });

      expect(response.status).toBe(200);
      expect(mockFirmwareRepo.findAll).toHaveBeenCalledTimes(1);
      expect(response.body).toMatchObject({
        releases: [{ id: 'release-1', version: '1.2.3' }],
      });
    });
  });

  describe('POST /admin/firmware', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'esp32c3',
        channel: 'STABLE',
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
      );

      expect(response.status).toBe(401);
      expect(mockStorageService.uploadBuffer).not.toHaveBeenCalled();
    });

    it('returns 400 with a ValidationError when the file field is missing', async () => {
      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'esp32c3',
        channel: 'STABLE',
        omitFile: true,
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('returns 400 with a ValidationError when the board field is invalid', async () => {
      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'not-a-real-board',
        channel: 'STABLE',
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(mockStorageService.uploadBuffer).not.toHaveBeenCalled();
    });

    it('forwards the uploaded buffer to UploadFirmwareService and returns 201-equivalent payload on success', async () => {
      mockFirmwareRepo.create.mockResolvedValue(mockRelease);

      const fileContent = Buffer.from('firmware-bytes');
      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'esp32c3',
        channel: 'STABLE',
        fileName: 'fw.bin',
        fileContent,
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      );

      expect(response.status).toBe(201);
      expect(mockStorageService.uploadBuffer).toHaveBeenCalledWith(
        expect.stringContaining('firmware/esp32c3/1.2.3/fw.bin'),
        expect.any(Buffer),
        'application/octet-stream',
      );
      const forwardedBuffer = mockStorageService.uploadBuffer.mock
        .calls[0]?.[1] as Buffer;
      expect(forwardedBuffer.equals(fileContent)).toBe(true);
      expect(response.body).toMatchObject({
        release: { id: 'release-1', version: '1.2.3' },
      });
    });

    it('maps a DomainError (FIRMWARE_RELEASE_ALREADY_EXISTS) to HTTP 409', async () => {
      mockStorageService.uploadBuffer.mockRejectedValue(
        new DomainError(
          DomainErrorCode.FIRMWARE_RELEASE_ALREADY_EXISTS,
          'Release already uploaded',
        ),
      );

      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'esp32c3',
        channel: 'STABLE',
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: DomainErrorCode.FIRMWARE_RELEASE_ALREADY_EXISTS,
      });
    });

    it('maps a DomainError (INVALID_FIRMWARE_FILENAME) to HTTP 422', async () => {
      // Note: multer/busboy strips path segments from the multipart filename
      // header before it reaches the controller, so a `../` traversal payload
      // (e.g. "../evil.bin") never reaches SAFE_BASENAME as unsafe — it's
      // sanitized to "evil.bin" upstream. Use a space instead, which multer
      // does not strip but SAFE_BASENAME still rejects.
      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'esp32c3',
        channel: 'STABLE',
        fileName: 'evil upload.bin',
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: DomainErrorCode.INVALID_FIRMWARE_FILENAME,
      });
      expect(mockStorageService.uploadBuffer).not.toHaveBeenCalled();
    });

    it('propagates a ValidationError thrown deeper in the service as HTTP 400', async () => {
      mockFirmwareRepo.create.mockRejectedValue(
        new ValidationError({ version: 'INVALID' }),
      );

      const multipart = buildMultipartUpload({
        version: '1.2.3',
        board: 'esp32c3',
        channel: 'STABLE',
      });

      const response = await postMultipart(
        httpServer,
        '/admin/firmware',
        multipart,
        { Authorization: `Bearer ${ADMIN_TOKEN}` },
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});
