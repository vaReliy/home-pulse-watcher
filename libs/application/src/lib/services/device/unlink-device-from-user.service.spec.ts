import type {
  IUserRepository,
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
  User,
} from '@home-pulse-watcher/core';
import { DeviceRole, UserDevice } from '@home-pulse-watcher/core';
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
    firmwareVersion: null,
    isOnline: () => false,
  } as Device;

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
        caller: { system: true },
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
        caller: { system: true },
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
        caller: { system: true },
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
        caller: { system: true },
      });

      expect(userDeviceRepo.exists).toHaveBeenCalledWith('user-1', 'device-1');
      expect(userDeviceRepo.delete).toHaveBeenCalledWith('user-1', 'device-1');
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither telegramId nor userId provided', async () => {
      const { service } = createService();

      await expect(
        service.run({
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { system: true },
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when neither mac nor deviceId provided', async () => {
      const { service, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);

      await expect(
        service.run({
          telegramId: '123456789',
          caller: { system: true },
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when user not found by telegramId', async () => {
      const { service, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '999999999',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { system: true },
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
          caller: { system: true },
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
          caller: { system: true },
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
          caller: { system: true },
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
          caller: { system: true },
        }),
      ).rejects.toThrow(DomainError);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { system: true },
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
          caller: { system: true },
        }),
      ).rejects.toThrow();

      expect(userDeviceRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('role enforcement', () => {
    it('should allow the caller when role is OWNER', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      );

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { id: 'caller-1' },
      });

      expect(userDeviceRepo.delete).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('should deny the caller when role is EDITOR (below OWNER)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.EDITOR,
        }),
      );

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(userDeviceRepo.delete).not.toHaveBeenCalled();
    });

    it('should skip the role check when caller is { system: true } (CLI bypass)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { system: true },
      });

      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      expect(userDeviceRepo.delete).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('should deny the caller with NotFoundError (not FORBIDDEN_ROLE) when no membership exists', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toThrow(NotFoundError);
      expect(userDeviceRepo.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError (not DomainError/DEVICE_NOT_LINKED) when caller has zero membership and target user is also not linked', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toThrow(NotFoundError);
      expect(userDeviceRepo.delete).not.toHaveBeenCalled();
    });

    it('should produce the same NotFoundError for a real device with zero caller membership as for a nonexistent device (enumeration resistance)', async () => {
      const {
        service: serviceA,
        userRepo: userRepoA,
        deviceRepo: deviceRepoA,
      } = createService();
      userRepoA.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepoA.findByMacAddress.mockResolvedValue(null);
      let nonexistentError: unknown;
      try {
        await serviceA.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { system: true },
        });
      } catch (error) {
        nonexistentError = error;
      }

      const {
        service: serviceB,
        userRepo: userRepoB,
        deviceRepo: deviceRepoB,
        userDeviceRepo: userDeviceRepoB,
      } = createService();
      userRepoB.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepoB.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepoB.exists.mockResolvedValue(true);
      userDeviceRepoB.findByUserAndDevice.mockResolvedValue(null);
      let noMembershipError: unknown;
      try {
        await serviceB.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        });
      } catch (error) {
        noMembershipError = error;
      }

      expect(noMembershipError).toBeInstanceOf(NotFoundError);
      expect(nonexistentError).toBeInstanceOf(NotFoundError);
      expect((noMembershipError as NotFoundError).message).toBe(
        (nonexistentError as NotFoundError).message,
      );
    });
  });
});
