import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { RegisterDeviceService } from './register-device.service.js';

describe('RegisterDeviceService', () => {
  const mockDevice: Device = {
    id: 'device-123',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'iv:authtag:ciphertext',
    label: 'Test Device',
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

  // 32 bytes = 64 hex characters
  const testEncryptionKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const validContext = {
    config: {
      deviceSecretEncryptionKey: testEncryptionKey,
    },
  };

  describe('successful registration', () => {
    it('should register a new device with valid MAC', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockDevice);

      const service = new RegisterDeviceService(mockRepo);
      const result = await service.run(
        { macAddress: 'aa:bb:cc:dd:ee:ff' },
        validContext,
      );

      expect(result.data.device).toEqual(mockDevice);
      expect(result.data.secret).toBeDefined();
      expect(result.data.secret).toHaveLength(64); // 32 bytes hex = 64 chars
    });

    it('should normalize MAC address to uppercase', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockDevice);

      const service = new RegisterDeviceService(mockRepo);
      await service.run({ macAddress: 'aa:bb:cc:dd:ee:ff' }, validContext);

      expect(mockRepo.existsByMacAddress).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ macAddress: 'AA:BB:CC:DD:EE:FF' }),
      );
    });

    it('should include label when provided', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockDevice);

      const service = new RegisterDeviceService(mockRepo);
      await service.run(
        { macAddress: 'AA:BB:CC:DD:EE:FF', label: 'Kitchen' },
        validContext,
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Kitchen' }),
      );
    });

    it('should set label to null when not provided', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockDevice);

      const service = new RegisterDeviceService(mockRepo);
      await service.run({ macAddress: 'AA:BB:CC:DD:EE:FF' }, validContext);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ label: null }),
      );
    });

    it('should store encrypted secret, not plain secret', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockDevice);

      const service = new RegisterDeviceService(mockRepo);
      const result = await service.run(
        { macAddress: 'AA:BB:CC:DD:EE:FF' },
        validContext,
      );

      // The create call should have encryptedSecret (iv:authtag:ciphertext format)
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptedSecret: expect.stringContaining(':'),
        }),
      );

      // The returned secret should not match the stored encrypted secret
      const createCall = mockRepo.create.mock.calls[0][0];
      expect(result.data.secret).not.toBe(createCall.encryptedSecret);
    });
  });

  describe('error handling', () => {
    it('should throw DomainError for duplicate MAC', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(true);

      const service = new RegisterDeviceService(mockRepo);

      await expect(
        service.run({ macAddress: 'AA:BB:CC:DD:EE:FF' }, validContext),
      ).rejects.toThrow(DomainError);

      await expect(
        service.run({ macAddress: 'AA:BB:CC:DD:EE:FF' }, validContext),
      ).rejects.toMatchObject({
        code: DomainErrorCode.DEVICE_ALREADY_REGISTERED,
      });
    });

    it('should throw Error when deviceSecretEncryptionKey missing', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);

      const service = new RegisterDeviceService(mockRepo);

      await expect(
        service.run({ macAddress: 'AA:BB:CC:DD:EE:FF' }, {}),
      ).rejects.toThrow(
        'deviceSecretEncryptionKey not provided in service context',
      );
    });

    it('should throw Error when context has no config', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByMacAddress.mockResolvedValue(false);

      const service = new RegisterDeviceService(mockRepo);

      await expect(
        service.run({ macAddress: 'AA:BB:CC:DD:EE:FF' }, { config: undefined }),
      ).rejects.toThrow(
        'deviceSecretEncryptionKey not provided in service context',
      );
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing MAC', async () => {
      const mockRepo = createMockRepository();
      const service = new RegisterDeviceService(mockRepo);

      await expect(
        service.run({} as { macAddress: string }, validContext),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid MAC format', async () => {
      const mockRepo = createMockRepository();
      const service = new RegisterDeviceService(mockRepo);

      await expect(
        service.run({ macAddress: 'invalid-mac' }, validContext),
      ).rejects.toThrow(ValidationError);
    });
  });
});
