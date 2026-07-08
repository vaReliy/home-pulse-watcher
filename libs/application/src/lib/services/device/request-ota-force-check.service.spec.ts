import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import { NotFoundError, ValidationError } from '@home-pulse-watcher/shared';
import { RequestOtaForceCheckService } from './request-ota-force-check.service.js';

describe('RequestOtaForceCheckService', () => {
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
    findByIds: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
    consumeOtaForceCheckRequest: jest.fn(),
    requestOtaForceCheck: jest.fn(),
  });

  describe('by id', () => {
    it('should set the flag for the device found by id', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findById.mockResolvedValue(mockDevice);

      const service = new RequestOtaForceCheckService(mockRepo);
      const result = await service.run({ id: 'device-123' }, {});

      expect(mockRepo.findById).toHaveBeenCalledWith('device-123');
      expect(mockRepo.requestOtaForceCheck).toHaveBeenCalledWith('device-123');
      expect(result.data.device).toEqual(mockDevice);
    });
  });

  describe('by macAddress', () => {
    it('should normalize MAC to uppercase and set the flag', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findByMacAddress.mockResolvedValue(mockDevice);

      const service = new RequestOtaForceCheckService(mockRepo);
      await service.run({ macAddress: 'aa:bb:cc:dd:ee:ff' }, {});

      expect(mockRepo.findByMacAddress).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
      );
      expect(mockRepo.requestOtaForceCheck).toHaveBeenCalledWith(mockDevice.id);
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither id nor macAddress provided', async () => {
      const mockRepo = createMockRepository();
      const service = new RequestOtaForceCheckService(mockRepo);

      await expect(service.run({}, {})).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when device does not exist', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findById.mockResolvedValue(null);

      const service = new RequestOtaForceCheckService(mockRepo);

      await expect(service.run({ id: 'missing-device' }, {})).rejects.toThrow(
        NotFoundError,
      );
      expect(mockRepo.requestOtaForceCheck).not.toHaveBeenCalled();
    });
  });
});
