import * as crypto from 'node:crypto';
import { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  AuthenticationError,
  AuthenticationErrorCode,
  encryptDeviceSecret,
} from '@home-pulse-watcher/shared';
import { HmacAuthGuard } from './hmac-auth.guard';

describe('HmacAuthGuard', () => {
  // Test encryption key (32 bytes = 64 hex chars)
  const testEncryptionKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // Test device secret (32 bytes = 64 hex chars)
  const deviceSecret =
    'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  const mockDevice: Device = {
    id: 'device-123',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: encryptDeviceSecret(deviceSecret, testEncryptionKey),
    label: 'Kitchen',
    lastStatus: null,
    lastSeenAt: null,
    isOnline: () => false,
  } as Device;

  const createMockRepository = (): jest.Mocked<IDeviceRepository> => ({
    findById: jest.fn(),
    findByMacAddress: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
  });

  const createMockRequest = (
    overrides: Partial<{
      headers: Record<string, string | undefined>;
      body: { status?: number };
    }> = {},
  ): Request => {
    const headers = overrides.headers ?? {};
    return {
      headers,
      body: overrides.body ?? {},
    } as unknown as Request;
  };

  const createMockContext = (request: Request): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  const generateValidSignature = (
    mac: string,
    timestamp: string,
    status: number | string,
    secret: string,
  ): string => {
    const payload = `${mac}:${timestamp}:${status}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  };

  beforeEach(() => {
    // Set encryption key environment variable
    process.env['DEVICE_SECRET_ENCRYPTION_KEY'] = testEncryptionKey;
  });

  afterEach(() => {
    delete process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
  });

  describe('missing credentials', () => {
    it('should throw MISSING_CREDENTIALS if X-Device-Mac header missing', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      const request = createMockRequest({
        headers: {
          'x-timestamp': '1700000000',
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toThrow(
        AuthenticationError,
      );
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.MISSING_CREDENTIALS,
      });
    });

    it('should throw MISSING_CREDENTIALS if X-Timestamp header missing', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.MISSING_CREDENTIALS,
      });
    });

    it('should throw MISSING_CREDENTIALS if X-Signature header missing', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': '1700000000',
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.MISSING_CREDENTIALS,
      });
    });

    it('should throw MISSING_CREDENTIALS if all headers missing', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      const request = createMockRequest({ headers: {} });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.MISSING_CREDENTIALS,
      });
    });
  });

  describe('timestamp validation', () => {
    it('should throw EXPIRED_TIMESTAMP if timestamp is too old (>5 min)', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      // Timestamp from 10 minutes ago
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': String(oldTimestamp),
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.EXPIRED_TIMESTAMP,
      });
    });

    it('should throw EXPIRED_TIMESTAMP if timestamp is in future (>5 min)', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      // Timestamp 10 minutes in the future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': String(futureTimestamp),
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.EXPIRED_TIMESTAMP,
      });
    });

    it('should throw INVALID_CREDENTIALS if timestamp is not a number', async () => {
      const repo = createMockRepository();
      const guard = new HmacAuthGuard(repo);

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': 'not-a-number',
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.INVALID_CREDENTIALS,
      });
    });

    it('should accept timestamp within 5 minute tolerance', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000) - 100); // 100 seconds ago (within tolerance)
      const signature = generateValidSignature(
        'AA:BB:CC:DD:EE:FF',
        timestamp,
        1,
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('device lookup', () => {
    it('should throw DEVICE_NOT_FOUND if device does not exist', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(null);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.DEVICE_NOT_FOUND,
      });
    });

    it('should normalize MAC address to uppercase for lookup', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(null);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'aa:bb:cc:dd:ee:ff', // lowercase
          'x-timestamp': timestamp,
          'x-signature': 'a'.repeat(64),
        },
      });
      const context = createMockContext(request);

      try {
        await guard.canActivate(context);
      } catch {
        // Expected to fail, but we want to check the repository call
      }

      expect(repo.findByMacAddress).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
    });
  });

  describe('signature verification', () => {
    it('should throw INVALID_SIGNATURE if signature is wrong', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': 'b'.repeat(64), // wrong signature
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.INVALID_SIGNATURE,
      });
    });

    it('should throw INVALID_SIGNATURE for different status value', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      // Sign with status=1 but send status=0
      const signature = generateValidSignature(
        'AA:BB:CC:DD:EE:FF',
        timestamp,
        1,
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: { status: 0 }, // different status
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.INVALID_SIGNATURE,
      });
    });

    it('should throw INVALID_SIGNATURE for different MAC in payload', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      // Sign with different MAC
      const signature = generateValidSignature(
        '11:22:33:44:55:66',
        timestamp,
        1,
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.INVALID_SIGNATURE,
      });
    });
  });

  describe('successful authentication', () => {
    it('should return true on valid authentication', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = generateValidSignature(
        'AA:BB:CC:DD:EE:FF',
        timestamp,
        1,
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should attach deviceId to request on success', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = generateValidSignature(
        'AA:BB:CC:DD:EE:FF',
        timestamp,
        1,
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      await guard.canActivate(context);

      expect((request as Request & { deviceId: string }).deviceId).toBe(
        'device-123',
      );
    });

    it('should handle lowercase MAC in header (normalize to uppercase)', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      // Signature is computed with uppercase MAC (normalized)
      const signature = generateValidSignature(
        'AA:BB:CC:DD:EE:FF',
        timestamp,
        0,
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'aa:bb:cc:dd:ee:ff', // lowercase
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: { status: 0 },
      });
      const context = createMockContext(request);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle missing body status (empty string in payload)', async () => {
      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      // Signature with empty status
      const signature = generateValidSignature(
        'AA:BB:CC:DD:EE:FF',
        timestamp,
        '',
        deviceSecret,
      );

      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: {}, // no status
      });
      const context = createMockContext(request);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('encryption key issues', () => {
    it('should throw Error if DEVICE_SECRET_ENCRYPTION_KEY not configured', async () => {
      delete process.env['DEVICE_SECRET_ENCRYPTION_KEY'];

      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': 'a'.repeat(64),
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'DEVICE_SECRET_ENCRYPTION_KEY not configured',
      );
    });

    it('should throw INVALID_CREDENTIALS if device secret decryption fails', async () => {
      // Use wrong encryption key
      process.env['DEVICE_SECRET_ENCRYPTION_KEY'] =
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      const repo = createMockRepository();
      repo.findByMacAddress.mockResolvedValue(mockDevice);
      const guard = new HmacAuthGuard(repo);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const request = createMockRequest({
        headers: {
          'x-device-mac': 'AA:BB:CC:DD:EE:FF',
          'x-timestamp': timestamp,
          'x-signature': 'a'.repeat(64),
        },
        body: { status: 1 },
      });
      const context = createMockContext(request);

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: AuthenticationErrorCode.INVALID_CREDENTIALS,
      });
    });
  });
});
