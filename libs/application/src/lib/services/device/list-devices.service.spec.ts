import type {
  IDeviceRepository,
  IUserRepository,
  Device,
  User,
} from '@home-pulse-watcher/core';
import { NotFoundError, ValidationError } from '@home-pulse-watcher/shared';
import { ListDevicesService } from './list-devices.service.js';

describe('ListDevicesService', () => {
  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt('123456789'),
    username: 'testuser',
    createdAt: new Date('2026-01-01'),
  } as User;

  const mockDevices: Device[] = [
    {
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: 'Living Room',
      lastStatus: 1,
      lastSeenAt: new Date(),
      isOnline: () => true,
    } as Device,
    {
      id: 'device-2',
      macAddress: '11:22:33:44:55:66',
      encryptedSecret: 'iv:authtag:ciphertext2',
      label: null,
      lastStatus: null,
      lastSeenAt: null,
      isOnline: () => false,
    } as Device,
  ];

  const createMockDeviceRepository = (): jest.Mocked<IDeviceRepository> => ({
    findById: jest.fn(),
    findByMacAddress: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
  });

  const createMockUserRepository = (): jest.Mocked<IUserRepository> => ({
    findById: jest.fn(),
    findByTelegramId: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByTelegramId: jest.fn(),
  });

  const createService = () => {
    const deviceRepo = createMockDeviceRepository();
    const userRepo = createMockUserRepository();
    const service = new ListDevicesService(deviceRepo, userRepo);
    return { service, deviceRepo, userRepo };
  };

  describe('listing by userId', () => {
    it('should return devices for given userId', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findByUserId.mockResolvedValue(mockDevices);

      const result = await service.run({ userId: 'user-1' });

      expect(result.data.devices).toEqual(mockDevices);
      expect(result.data.total).toBe(2);
      expect(deviceRepo.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should return empty list when user has no devices', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findByUserId.mockResolvedValue([]);

      const result = await service.run({ userId: 'user-1' });

      expect(result.data.devices).toEqual([]);
      expect(result.data.total).toBe(0);
    });
  });

  describe('listing by telegramId', () => {
    it('should resolve telegramId to userId and return devices', async () => {
      const { service, deviceRepo, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByUserId.mockResolvedValue(mockDevices);

      const result = await service.run({ telegramId: '123456789' });

      expect(result.data.devices).toEqual(mockDevices);
      expect(result.data.total).toBe(2);
      expect(userRepo.findByTelegramId).toHaveBeenCalledWith(
        BigInt('123456789'),
      );
      expect(deviceRepo.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should throw NotFoundError when telegramId user not found', async () => {
      const { service, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(null);

      await expect(
        service.run({ telegramId: '999999999' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('validation', () => {
    it('should throw ValidationError when neither userId nor telegramId provided', async () => {
      const { service } = createService();

      await expect(service.run({})).rejects.toThrow(ValidationError);
    });
  });
});
