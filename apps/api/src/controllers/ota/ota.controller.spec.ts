import { CheckOtaUpdateService } from '@home-pulse-watcher/application';
import type {
  Device,
  IDeviceRepository,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
} from '@home-pulse-watcher/core';
import { ReleaseChannel } from '@home-pulse-watcher/core';
import {
  encryptDeviceSecret,
  livrValidatorFactory,
} from '@home-pulse-watcher/shared';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { AllExceptionsFilter } from '../../filters/all-exceptions.filter.js';
import { ServiceExceptionFilter } from '../../filters/service-exception.filter.js';
import { HmacAuthGuard } from '../../guards/hmac-auth.guard.js';
import { REPOSITORY_TOKENS } from '../../modules/repositories/repository.tokens.js';
import { SERVICE_TOKENS } from '../../modules/services/service.tokens.js';
import { STORAGE_TOKENS } from '../../modules/storage/storage.tokens.js';
import { OtaController } from './ota.controller.js';

/** Test HMAC secrets (64-char hex = 32 bytes) */
const TEST_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEVICE_SECRET =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const DEVICE_MAC = 'AA:BB:CC:DD:EE:FF';
const DEVICE_ID = 'test-device-id';

const mockDevice: Device = {
  id: DEVICE_ID,
  macAddress: DEVICE_MAC,
  encryptedSecret: encryptDeviceSecret(DEVICE_SECRET, TEST_ENCRYPTION_KEY),
  label: 'Test Device',
  lastStatus: null,
  lastSeenAt: null,
  releaseChannel: ReleaseChannel.STABLE,
  isOnline: () => false,
} as Device;

/**
 * Generates a valid HMAC signature for the OTA check route.
 * Canonical format: MAC:TIMESTAMP:boardType:currentVersion:channel
 */
function generateOtaSignature(
  mac: string,
  timestamp: string,
  boardType: string,
  currentVersion: string,
  channel: string,
  secret: string,
): string {
  const payload = `${mac}:${timestamp}:${boardType}:${currentVersion}:${channel}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function currentTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Sends an HTTP POST request to the test server.
 */
function post(
  server: http.Server,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
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
    req.write(payload);
    req.end();
  });
}

describe('OtaController (integration)', () => {
  let app: INestApplication;
  let httpServer: http.Server;
  let mockFirmwareRepo: jest.Mocked<IFirmwareReleaseRepository>;
  let mockStorageService: jest.Mocked<IFirmwareStorageService>;
  let mockDeviceRepository: jest.Mocked<IDeviceRepository>;

  beforeAll(() => {
    livrValidatorFactory.initialize();
    process.env['DEVICE_SECRET_ENCRYPTION_KEY'] = TEST_ENCRYPTION_KEY;
  });

  afterAll(() => {
    delete process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
  });

  beforeEach(async () => {
    mockFirmwareRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByVersionAndBoard: jest.fn(),
      findLatestForBoard: jest.fn().mockResolvedValue([]),
      findAll: jest.fn(),
      markCritical: jest.fn(),
    };

    mockStorageService = {
      uploadBuffer: jest.fn(),
      getSignedUrl: jest.fn(),
      deleteObject: jest.fn(),
    };

    mockDeviceRepository = {
      findById: jest.fn().mockResolvedValue(mockDevice),
      findByMacAddress: jest.fn().mockResolvedValue(mockDevice),
      findByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      existsByMacAddress: jest.fn(),
      consumeOtaForceCheckRequest: jest.fn(),
      requestOtaForceCheck: jest.fn(),
    };

    const checkOtaUpdateService = new CheckOtaUpdateService(
      mockDeviceRepository,
      mockFirmwareRepo,
      mockStorageService,
      TEST_ENCRYPTION_KEY,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [OtaController],
      providers: [
        {
          provide: SERVICE_TOKENS.CHECK_OTA_UPDATE,
          useValue: checkOtaUpdateService,
        },
        {
          provide: REPOSITORY_TOKENS.DEVICE,
          useValue: mockDeviceRepository,
        },
        {
          provide: STORAGE_TOKENS.FIRMWARE_STORAGE,
          useValue: mockStorageService,
        },
        Reflector,
        HmacAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(
      new AllExceptionsFilter(),
      new ServiceExceptionFilter(),
    );
    await app.listen(0); // OS assigns a random free port
    httpServer = app.getHttpServer() as http.Server;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /ota/check — HMAC canonical field guard', () => {
    it('returns 401 when channel is absent — canonical builder throws', async () => {
      const timestamp = currentTimestamp();
      // board and version present but channel omitted — canonical builder throws
      const body = { boardType: 'esp32c3', currentVersion: '1.0.0' };

      // Signature built with "undefined" in place of channel (to bypass HMAC check
      // and verify the canonical builder error is the response cause)
      const bodyPart = `esp32c3:1.0.0:undefined`;
      const mac = DEVICE_MAC;
      const payload = `${mac}:${timestamp}:${bodyPart}`;
      const signature = crypto
        .createHmac('sha256', DEVICE_SECRET)
        .update(payload)
        .digest('hex');

      const response = await post(httpServer, '/ota/check', body, {
        'X-Device-Mac': mac,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      });

      // Guard catches canonical builder throw → treats as invalid signature → 401
      expect(response.status).toBe(401);
    });
  });

  describe('POST /ota/check — input validation', () => {
    it('returns 400 when boardType is invalid (not in enum)', async () => {
      const timestamp = currentTimestamp();
      const body = {
        boardType: 'esp32xx',
        currentVersion: '1.0.0',
        channel: 'STABLE',
      };

      const response = await post(httpServer, '/ota/check', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateOtaSignature(
          DEVICE_MAC,
          timestamp,
          body.boardType,
          body.currentVersion,
          body.channel,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('POST /ota/check — HMAC authentication', () => {
    it('returns 401 when HMAC signature headers are missing', async () => {
      const response = await post(httpServer, '/ota/check', {
        boardType: 'esp32c3',
        currentVersion: '1.0.0',
        channel: 'STABLE',
      });

      expect(response.status).toBe(401);
    });

    it('returns 401 when HMAC signature is invalid', async () => {
      const timestamp = currentTimestamp();

      const response = await post(
        httpServer,
        '/ota/check',
        { boardType: 'esp32c3', currentVersion: '1.0.0', channel: 'STABLE' },
        {
          'X-Device-Mac': DEVICE_MAC,
          'X-Timestamp': timestamp,
          'X-Signature': 'a'.repeat(64),
        },
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /ota/check — successful responses', () => {
    it('returns 200 with hasUpdate: false when no release exists', async () => {
      const timestamp = currentTimestamp();
      const body = {
        boardType: 'esp32c3',
        currentVersion: '1.0.0',
        channel: 'STABLE',
      };

      mockFirmwareRepo.findLatestForBoard.mockResolvedValue([]);

      const response = await post(httpServer, '/ota/check', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateOtaSignature(
          DEVICE_MAC,
          timestamp,
          body.boardType,
          body.currentVersion,
          body.channel,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ hasUpdate: false });
    });

    it('returns 200 with full update payload when a newer release exists', async () => {
      const timestamp = currentTimestamp();
      const body = {
        boardType: 'esp32c3',
        currentVersion: '1.0.0',
        channel: 'STABLE',
      };

      const fixtureUrl =
        'https://storage.googleapis.com/firmware.bin?token=fixture';

      mockFirmwareRepo.findLatestForBoard.mockResolvedValue([
        {
          id: 'release-1',
          version: '2.0.0',
          boardType: 'esp32c3' as import('@home-pulse-watcher/core').BoardType,
          channel:
            'STABLE' as import('@home-pulse-watcher/core').ReleaseChannel,
          checksum: 'sha256checksum',
          gcsPath: 'firmware/esp32c3/2.0.0.bin',
          isCritical: false,
          createdAt: new Date('2024-01-15'),
        },
      ]);
      mockStorageService.getSignedUrl.mockResolvedValue(fixtureUrl);

      const response = await post(httpServer, '/ota/check', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateOtaSignature(
          DEVICE_MAC,
          timestamp,
          body.boardType,
          body.currentVersion,
          body.channel,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        hasUpdate: true,
        version: '2.0.0',
        checksum: 'sha256checksum',
        isCritical: false,
      });
      expect(typeof (response.body['sig'] as string)).toBe('string');
      expect(typeof (response.body['ts'] as number)).toBe('number');
      expect(typeof (response.body['expiresAt'] as string)).toBe('string');
    });
  });
});
