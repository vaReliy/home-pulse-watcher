import type {
  IUserRepository,
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
  User,
  UserDevice,
} from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { LinkDeviceToUserService } from './link-device-to-user.service.js';

describe('LinkDeviceToUserService', () => {
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
    firmwareVersion: null,
    isOnline: () => false,
  } as Device;

  const mockUserDevice: UserDevice = {
    userId: 'user-1',
    deviceId: 'device-1',
    customName: null,
    role: DeviceRole.VIEWER,
  } as UserDevice;

  const createMockUserRepository = (): jest.Mocked<IUserRepository> => ({
    findById: jest.fn(),
    findByTelegramId: jest.fn(),
    findByIds: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByTelegramId: jest.fn(),
  });

  const createMockDeviceRepository = (): jest.Mocked<IDeviceRepository> => ({
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
    const service = new LinkDeviceToUserService(
      userRepo,
      deviceRepo,
      userDeviceRepo,
    );
    return { service, userRepo, deviceRepo, userDeviceRepo };
  };

  describe('successful linking', () => {
    it('should link device to user by telegramId and mac', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.data.device).toEqual(mockDevice);
      expect(result.data.userDevice).toEqual(mockUserDevice);
    });

    it('should link device to user by userId and deviceId', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findById.mockResolvedValue(mockUser);
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      const result = await service.run({
        userId: 'user-1',
        deviceId: 'device-1',
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.data.device).toEqual(mockDevice);
    });

    it('should default to VIEWER role when not specified', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
      });

      expect(userDeviceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: DeviceRole.VIEWER }),
      );
    });

    it('should pass explicit OWNER role to repository', async () => {
      const ownerUserDevice = { ...mockUserDevice, role: DeviceRole.OWNER };
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(ownerUserDevice as UserDevice);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        role: 'OWNER',
      });

      expect(userDeviceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: DeviceRole.OWNER }),
      );
      expect(result.data.userDevice.role).toBe(DeviceRole.OWNER);
    });

    it('should normalize MAC address to uppercase', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      await service.run({
        telegramId: '123456789',
        mac: 'aa:bb:cc:dd:ee:ff',
      });

      expect(deviceRepo.findByMacAddress).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
      );
    });

    it('should check exists before creating link', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
      });

      expect(userDeviceRepo.exists).toHaveBeenCalledWith('user-1', 'device-1');
      expect(userDeviceRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        deviceId: 'device-1',
        role: DeviceRole.VIEWER,
      });
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

    it('should throw DomainError when device already linked to user', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

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
        code: DomainErrorCode.DEVICE_ALREADY_LINKED,
      });
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for invalid role', async () => {
      const { service } = createService();

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          role: 'INVALID',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
