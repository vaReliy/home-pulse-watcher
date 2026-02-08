import type {
  IUserRepository,
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
  User,
} from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { UnlinkDeviceFromUserService } from './unlink-device-from-user.service.js';

describe('UnlinkDeviceFromUserService', () => {
  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(123456789),
    username: 'testuser',
    createdAt: new Date('2024-01-01'),
  } as User;

  const mockDevice: Device = {
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'iv:authtag:ciphertext',
    label: 'Test Device',
    lastStatus: null,
    lastSeenAt: null,
    isOnline: () => false,
  } as Device;

  const createMockUserRepository = (): jest.Mocked<IUserRepository> => ({
    findById: jest.fn(),
    findByTelegramId: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByTelegramId: jest.fn(),
  });

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

  const createMockUserDeviceRepository =
    (): jest.Mocked<IUserDeviceRepository> => ({
      findByUserAndDevice: jest.fn(),
      findByUserId: jest.fn(),
      findByDeviceId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      countByDeviceId: jest.fn(),
    });

  const createService = () => {
    const userRepo = createMockUserRepository();
    const deviceRepo = createMockDeviceRepository();
    const userDeviceRepo = createMockUserDeviceRepository();
    const service = new UnlinkDeviceFromUserService(
      userRepo,
      deviceRepo,
      userDeviceRepo,
    );
    return { service, userRepo, deviceRepo, userDeviceRepo };
  };

  describe('successful unlinking', () => {
    it('should unlink device from user by telegramId and mac', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.data.device).toEqual(mockDevice);
      expect(userDeviceRepo.delete).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('should unlink device from user by userId and deviceId', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findById.mockResolvedValue(mockUser);
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

      const result = await service.run({
        userId: 'user-1',
        deviceId: 'device-1',
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.data.device).toEqual(mockDevice);
      expect(userDeviceRepo.delete).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('should normalize MAC address to uppercase', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

      await service.run({
        telegramId: '123456789',
        mac: 'aa:bb:cc:dd:ee:ff',
      });

      expect(deviceRepo.findByMacAddress).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
      );
    });

    it('should check exists before deleting link', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
      });

      expect(userDeviceRepo.exists).toHaveBeenCalledWith('user-1', 'device-1');
      expect(userDeviceRepo.delete).toHaveBeenCalledWith('user-1', 'device-1');
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither telegramId nor userId provided', async () => {
      const { service } = createService();

      await expect(service.run({ mac: 'AA:BB:CC:DD:EE:FF' })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError when neither mac nor deviceId provided', async () => {
      const { service, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);

      await expect(service.run({ telegramId: '123456789' })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw NotFoundError when user not found by telegramId', async () => {
      const { service, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '999999999',
          mac: 'AA:BB:CC:DD:EE:FF',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when user not found by userId', async () => {
      const { service, userRepo } = createService();
      userRepo.findById.mockResolvedValue(null);

      await expect(
        service.run({
          userId: 'nonexistent-user',
          mac: 'AA:BB:CC:DD:EE:FF',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when device not found by mac', async () => {
      const { service, userRepo, deviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'FF:FF:FF:FF:FF:FF',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when device not found by deviceId', async () => {
      const { service, userRepo, deviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findById.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '123456789',
          deviceId: 'nonexistent-device',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw DomainError when device is not linked to user', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
        }),
      ).rejects.toThrow(DomainError);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
        }),
      ).rejects.toMatchObject({
        code: DomainErrorCode.DEVICE_NOT_LINKED,
      });
    });

    it('should not call delete when link does not exist', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
        }),
      ).rejects.toThrow();

      expect(userDeviceRepo.delete).not.toHaveBeenCalled();
    });
  });
});
