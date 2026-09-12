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
    // Default: first link (no existing memberships on the device).
    userDeviceRepo.findByDeviceId.mockResolvedValue([]);
    const service = new LinkDeviceToUserService(
      userRepo,
      deviceRepo,
      userDeviceRepo,
    );
    return { service, userRepo, deviceRepo, userDeviceRepo };
  };

  describe('successful linking (first link)', () => {
    it('should link device to user by telegramId and mac', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { system: true },
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
        caller: { system: true },
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.data.device).toEqual(mockDevice);
    });

    it('should default to VIEWER role when not specified, with no caller check made (first link)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { system: true },
      });

      expect(userDeviceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: DeviceRole.VIEWER }),
      );
      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
    });

    it('should default to VIEWER on first link for a non-system caller when role is omitted', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { id: 'caller-1' },
      });

      expect(userDeviceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: DeviceRole.VIEWER }),
      );
      expect(result.data.userDevice.role).toBe(DeviceRole.VIEWER);
      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
    });

    it.each([DeviceRole.OWNER, DeviceRole.EDITOR])(
      'should silently downgrade an explicit %s role to VIEWER on first link for a non-system caller (role param is ignored entirely, not just defaulted, since the caller-role check is skipped on this path)',
      async (requestedRole) => {
        const { service, userRepo, deviceRepo, userDeviceRepo } =
          createService();
        userRepo.findByTelegramId.mockResolvedValue(mockUser);
        deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
        userDeviceRepo.exists.mockResolvedValue(false);
        userDeviceRepo.create.mockResolvedValue(mockUserDevice);

        const result = await service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          role: requestedRole,
          caller: { id: 'caller-1' },
        });

        expect(userDeviceRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ role: DeviceRole.VIEWER }),
        );
        expect(result.data.userDevice.role).toBe(DeviceRole.VIEWER);
        expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      },
    );

    it.each([DeviceRole.OWNER, DeviceRole.EDITOR])(
      'should honor an explicit %s role on first link when caller is { system: true } (trusted CLI bootstrap, not downgraded)',
      async (requestedRole) => {
        const { service, userRepo, deviceRepo, userDeviceRepo } =
          createService();
        userRepo.findByTelegramId.mockResolvedValue(mockUser);
        deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
        userDeviceRepo.exists.mockResolvedValue(false);
        userDeviceRepo.create.mockResolvedValue({
          ...mockUserDevice,
          role: requestedRole,
        } as UserDevice);

        const result = await service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          role: requestedRole,
          caller: { system: true },
        });

        expect(userDeviceRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ role: requestedRole }),
        );
        expect(result.data.userDevice.role).toBe(requestedRole);
        expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      },
    );

    it('should normalize MAC address to uppercase', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      await service.run({
        telegramId: '123456789',
        mac: 'aa:bb:cc:dd:ee:ff',
        caller: { system: true },
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
        caller: { system: true },
      });

      expect(userDeviceRepo.exists).toHaveBeenCalledWith('user-1', 'device-1');
      expect(userDeviceRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        deviceId: 'device-1',
        role: DeviceRole.VIEWER,
      });
    });

    it('should query findByDeviceId with the resolved device id (not the mac/deviceId input)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { system: true },
      });

      expect(userDeviceRepo.findByDeviceId).toHaveBeenCalledWith('device-1');
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither telegramId nor userId provided', async () => {
      const { service } = createService();

      await expect(
        service.run({ mac: 'AA:BB:CC:DD:EE:FF', caller: { system: true } }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when neither mac nor deviceId provided', async () => {
      const { service, userRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);

      await expect(
        service.run({ telegramId: '123456789', caller: { system: true } }),
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

    it('should throw DomainError when device already linked to user', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(true);

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
        code: DomainErrorCode.DEVICE_ALREADY_LINKED,
      });
    });

    it('should throw the enumeration-resistant NotFoundError (not DEVICE_ALREADY_LINKED) when both the already-linked check and the caller lack sufficient role are true, proving the role-escalation check now runs before the already-linked check (ordering regression guard)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      // Would trigger DEVICE_ALREADY_LINKED if the exists() check were ever reached.
      userDeviceRepo.exists.mockResolvedValue(true);
      // Non-first-link setup that triggers the role check first.
      userDeviceRepo.findByDeviceId.mockResolvedValue([
        new UserDevice({
          userId: 'existing-owner',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      ]);
      // Caller has zero memberships on this device -> enumeration-resistant NotFoundError.
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(userDeviceRepo.findByDeviceId).toHaveBeenCalledWith('device-1');
      expect(userDeviceRepo.findByUserAndDevice).toHaveBeenCalledWith(
        'caller-1',
        'device-1',
      );
      expect(userDeviceRepo.exists).not.toHaveBeenCalled();
      expect(userDeviceRepo.create).not.toHaveBeenCalled();
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
          caller: { system: true },
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('role enforcement (non-first link)', () => {
    const otherMembership = new UserDevice({
      userId: 'existing-owner',
      deviceId: 'device-1',
      customName: null,
      role: DeviceRole.OWNER,
    });

    it('should throw the same NotFoundError shape as a nonexistent device when caller has zero memberships (enumeration resistance)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      let nonFirstLinkError: unknown;
      try {
        await service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        });
      } catch (error) {
        nonFirstLinkError = error;
      }

      const {
        service: serviceB,
        userRepo: userRepoB,
        deviceRepo: deviceRepoB,
      } = createService();
      userRepoB.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepoB.findByMacAddress.mockResolvedValue(null);
      let nonexistentDeviceError: unknown;
      try {
        await serviceB.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { system: true },
        });
      } catch (error) {
        nonexistentDeviceError = error;
      }

      expect(nonFirstLinkError).toBeInstanceOf(NotFoundError);
      expect(nonexistentDeviceError).toBeInstanceOf(NotFoundError);
      expect((nonFirstLinkError as NotFoundError).message).toBe(
        (nonexistentDeviceError as NotFoundError).message,
      );
      expect(userDeviceRepo.create).not.toHaveBeenCalled();
    });

    it.each([DeviceRole.EDITOR, DeviceRole.OWNER])(
      'should throw FORBIDDEN_ROLE when caller has insufficient role (VIEWER) attempting to link a new user at %s',
      async (requestedRole) => {
        const { service, userRepo, deviceRepo, userDeviceRepo } =
          createService();
        userRepo.findByTelegramId.mockResolvedValue(mockUser);
        deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
        userDeviceRepo.exists.mockResolvedValue(false);
        userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
        userDeviceRepo.findByUserAndDevice.mockResolvedValue(
          new UserDevice({
            userId: 'caller-1',
            deviceId: 'device-1',
            customName: null,
            role: DeviceRole.VIEWER,
          }),
        );

        await expect(
          service.run({
            telegramId: '123456789',
            mac: 'AA:BB:CC:DD:EE:FF',
            role: requestedRole,
            caller: { id: 'caller-1' },
          }),
        ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
        expect(userDeviceRepo.create).not.toHaveBeenCalled();
      },
    );

    it('should throw FORBIDDEN_ROLE when caller has VIEWER attempting to link a new user ALSO at VIEWER (stricter-than-task-wording rule: any non-first link requires OWNER, regardless of requested role)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.VIEWER,
        }),
      );

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          role: 'VIEWER',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(userDeviceRepo.create).not.toHaveBeenCalled();
    });

    it.each([DeviceRole.OWNER, DeviceRole.EDITOR, DeviceRole.VIEWER])(
      'should succeed granting %s when caller has OWNER on a non-first link',
      async (grantedRole) => {
        const { service, userRepo, deviceRepo, userDeviceRepo } =
          createService();
        userRepo.findByTelegramId.mockResolvedValue(mockUser);
        deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
        userDeviceRepo.exists.mockResolvedValue(false);
        userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
        userDeviceRepo.findByUserAndDevice.mockResolvedValue(
          new UserDevice({
            userId: 'caller-1',
            deviceId: 'device-1',
            customName: null,
            role: DeviceRole.OWNER,
          }),
        );
        userDeviceRepo.create.mockResolvedValue({
          ...mockUserDevice,
          role: grantedRole,
        } as UserDevice);

        const result = await service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          role: grantedRole,
          caller: { id: 'caller-1' },
        });

        expect(result.data.userDevice.role).toBe(grantedRole);
        expect(userDeviceRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ role: grantedRole }),
        );
      },
    );

    it('should still throw DEVICE_ALREADY_LINKED after the role check passes (OWNER caller, target already linked on a non-first link)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      );
      userDeviceRepo.exists.mockResolvedValue(true);

      await expect(
        service.run({
          telegramId: '123456789',
          mac: 'AA:BB:CC:DD:EE:FF',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toMatchObject({ code: DomainErrorCode.DEVICE_ALREADY_LINKED });
      expect(userDeviceRepo.findByUserAndDevice).toHaveBeenCalledWith(
        'caller-1',
        'device-1',
      );
      expect(userDeviceRepo.exists).toHaveBeenCalledWith('user-1', 'device-1');
      expect(userDeviceRepo.create).not.toHaveBeenCalled();
    });

    it('should default to VIEWER when role param is omitted on a non-first link, while still enforcing the OWNER caller check', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      );
      userDeviceRepo.create.mockResolvedValue(mockUserDevice);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        caller: { id: 'caller-1' },
      });

      expect(userDeviceRepo.findByUserAndDevice).toHaveBeenCalledWith(
        'caller-1',
        'device-1',
      );
      expect(userDeviceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: DeviceRole.VIEWER }),
      );
      expect(result.data.userDevice.role).toBe(DeviceRole.VIEWER);
    });

    it('should bypass the caller check entirely when caller is { system: true } (CLI bypass)', async () => {
      const { service, userRepo, deviceRepo, userDeviceRepo } = createService();
      userRepo.findByTelegramId.mockResolvedValue(mockUser);
      deviceRepo.findByMacAddress.mockResolvedValue(mockDevice);
      userDeviceRepo.exists.mockResolvedValue(false);
      userDeviceRepo.findByDeviceId.mockResolvedValue([otherMembership]);
      userDeviceRepo.create.mockResolvedValue({
        ...mockUserDevice,
        role: DeviceRole.OWNER,
      } as UserDevice);

      const result = await service.run({
        telegramId: '123456789',
        mac: 'AA:BB:CC:DD:EE:FF',
        role: 'OWNER',
        caller: { system: true },
      });

      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      expect(result.data.userDevice.role).toBe(DeviceRole.OWNER);
    });
  });
});
