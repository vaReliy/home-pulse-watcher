import { ProcessPowerStatusService } from '@home-pulse-watcher/application';
import type {
  Device,
  IDeviceRepository,
  IPowerEventRepository,
  PowerEvent,
} from '@home-pulse-watcher/core';
import {
  PowerStatus,
  ReleaseChannel,
  DeviceType,
} from '@home-pulse-watcher/core';
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
import { DeviceStatusController } from './device-status.controller.js';

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
  label: 'Kitchen',
  lastStatus: null,
  lastSeenAt: null,
  statusChangedAt: null,
  firmwareVersion: null,
  batteryVoltage: null,
  releaseChannel: ReleaseChannel.STABLE,
  deviceType: DeviceType.MAINS,
  isOnline: () => false,
} as Device;

/**
 * Generates a valid HMAC signature for the device-status route.
 * Canonical format: MAC:TIMESTAMP:status
 */
function generateStatusSignature(
  mac: string,
  timestamp: string,
  status: number | string,
  secret: string,
): string {
  const payload = `${mac}:${timestamp}:${status}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function currentTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
}

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

describe('DeviceStatusController (integration)', () => {
  let app: INestApplication;
  let httpServer: http.Server;
  let mockDeviceRepository: jest.Mocked<IDeviceRepository>;
  let mockPowerEventRepository: jest.Mocked<IPowerEventRepository>;

  const createdEvent: PowerEvent = {
    id: 'event-1',
    deviceId: DEVICE_ID,
    status: PowerStatus.ON,
    timestamp: new Date('2026-09-11T00:00:00.000Z'),
    duration: null,
    voltage: null,
    batteryVoltage: null,
  } as PowerEvent;

  beforeAll(() => {
    livrValidatorFactory.initialize();
    process.env['DEVICE_SECRET_ENCRYPTION_KEY'] = TEST_ENCRYPTION_KEY;
  });

  afterAll(() => {
    delete process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
  });

  beforeEach(async () => {
    mockDeviceRepository = {
      findById: jest.fn().mockResolvedValue(mockDevice),
      findByMacAddress: jest.fn().mockResolvedValue(mockDevice),
      findByIds: jest.fn(),
      findByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(mockDevice),
      delete: jest.fn(),
      existsByMacAddress: jest.fn(),
      consumeOtaForceCheckRequest: jest.fn().mockResolvedValue(false),
      requestOtaForceCheck: jest.fn(),
    };

    mockPowerEventRepository = {
      findById: jest.fn(),
      findMany: jest.fn(),
      findLatestByDeviceId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdEvent),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByDeviceId: jest.fn(),
      count: jest.fn(),
    };

    const processPowerStatusService = new ProcessPowerStatusService(
      mockDeviceRepository,
      mockPowerEventRepository,
      undefined,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [DeviceStatusController],
      providers: [
        {
          provide: SERVICE_TOKENS.PROCESS_POWER_STATUS,
          useValue: processPowerStatusService,
        },
        {
          provide: REPOSITORY_TOKENS.DEVICE,
          useValue: mockDeviceRepository,
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
    await app.listen(0);
    httpServer = app.getHttpServer() as http.Server;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /device/status — guard integration', () => {
    it('returns 401 when HMAC headers are missing', async () => {
      const response = await post(httpServer, '/device/status', {
        status: 1,
      });

      expect(response.status).toBe(401);
      expect(mockPowerEventRepository.create).not.toHaveBeenCalled();
    });

    it('returns 401 when HMAC signature is invalid', async () => {
      const timestamp = currentTimestamp();

      const response = await post(
        httpServer,
        '/device/status',
        { status: 1 },
        {
          'X-Device-Mac': DEVICE_MAC,
          'X-Timestamp': timestamp,
          'X-Signature': 'a'.repeat(64),
        },
      );

      expect(response.status).toBe(401);
      expect(mockPowerEventRepository.create).not.toHaveBeenCalled();
    });

    it('returns 200 and reaches the service when HMAC signature is valid', async () => {
      const timestamp = currentTimestamp();
      const body = { status: 1 };

      const response = await post(httpServer, '/device/status', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateStatusSignature(
          DEVICE_MAC,
          timestamp,
          body.status,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(mockPowerEventRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /device/status — DTO defaulting', () => {
    it('defaults voltage/firmwareVersion/batteryVoltage to null when omitted', async () => {
      const timestamp = currentTimestamp();
      const body = { status: 1 };

      const response = await post(httpServer, '/device/status', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateStatusSignature(
          DEVICE_MAC,
          timestamp,
          body.status,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(mockPowerEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          voltage: null,
          batteryVoltage: null,
        }),
      );
      // firmwareVersion is not part of PowerEvent.create — it flows into
      // Device.updateStatus instead. Confirm it is sanitized to undefined
      // (dropped) rather than the literal `null` the DTO produced, since
      // ProcessPowerStatusService only writes firmwareVersion when it is
      // a valid semver string.
      expect(mockDeviceRepository.updateStatus).toHaveBeenCalledWith(
        DEVICE_ID,
        expect.objectContaining({ firmwareVersion: undefined }),
      );
    });

    it('forwards explicit voltage/batteryVoltage values without defaulting', async () => {
      const timestamp = currentTimestamp();
      const body = { status: 1, voltage: 2048, batteryVoltage: 4200 };

      const response = await post(httpServer, '/device/status', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateStatusSignature(
          DEVICE_MAC,
          timestamp,
          body.status,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(mockPowerEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          voltage: 2048,
          batteryVoltage: 4200,
        }),
      );
    });
  });

  describe('POST /device/status — response shape', () => {
    it('returns success/eventId/timestamp/isStatusChange/debounced without forceOtaCheck when flag is false', async () => {
      const timestamp = currentTimestamp();
      const body = { status: 1 };
      mockDeviceRepository.consumeOtaForceCheckRequest.mockResolvedValue(false);

      const response = await post(httpServer, '/device/status', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateStatusSignature(
          DEVICE_MAC,
          timestamp,
          body.status,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        eventId: 'event-1',
        timestamp: '2026-09-11T00:00:00.000Z',
        isStatusChange: true,
        debounced: false,
      });
      expect(response.body).not.toHaveProperty('forceOtaCheck');
    });

    it('includes forceOtaCheck: true when the sticky flag is set', async () => {
      const timestamp = currentTimestamp();
      const body = { status: 1 };
      mockDeviceRepository.consumeOtaForceCheckRequest.mockResolvedValue(true);

      const response = await post(httpServer, '/device/status', body, {
        'X-Device-Mac': DEVICE_MAC,
        'X-Timestamp': timestamp,
        'X-Signature': generateStatusSignature(
          DEVICE_MAC,
          timestamp,
          body.status,
          DEVICE_SECRET,
        ),
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ forceOtaCheck: true });
    });
  });

  describe('POST /device/status — validation', () => {
    it('returns 400 when status is missing', async () => {
      const timestamp = currentTimestamp();
      // Sign with empty string, matching the guard's `body['status'] ?? ''` default
      const signature = generateStatusSignature(
        DEVICE_MAC,
        timestamp,
        '',
        DEVICE_SECRET,
      );

      const response = await post(
        httpServer,
        '/device/status',
        {},
        {
          'X-Device-Mac': DEVICE_MAC,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});
