import type {
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
} from '@home-pulse-watcher/core';
import { DeviceRole, UserDevice } from '@home-pulse-watcher/core';
import {
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { RotateDeviceSecretService } from './rotate-device-secret.service.js';

describe('RotateDeviceSecretService', () => {
  const mockDevice: Device = {
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'iv:authtag:ciphertext',
    label: 'Test Device',
    lastStatus: null,
    lastSeenAt: null,
    isOnline: () => false,
  } as Device;

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
    const deviceRepo = createMockDeviceRepository();
    const userDeviceRepo = createMockUserDeviceRepository();
    const service = new RotateDeviceSecretService(deviceRepo, userDeviceRepo);
    return { service, deviceRepo, userDeviceRepo };
  };

  const context = { config: { deviceSecretEncryptionKey: '0'.repeat(64) } };

  describe('successful rotation', () => {
    it('should rotate the secret for the device found by id', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      deviceRepo.update.mockResolvedValue(mockDevice);

      const result = await service.run(
        { id: 'device-1', caller: { system: true } },
        context,
      );

      expect(deviceRepo.update).toHaveBeenCalled();
      expect(result.data.secret).toHaveLength(64);
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither id nor macAddress provided', async () => {
      const { service } = createService();

      await expect(
        service.run({ caller: { system: true } }, context),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when device does not exist', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(null);

      await expect(
        service.run({ id: 'missing', caller: { system: true } }, context),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('role enforcement', () => {
    it('should allow the caller when role is OWNER', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      deviceRepo.update.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      );

      await service.run(
        { id: 'device-1', caller: { id: 'caller-1' } },
        context,
      );

      expect(deviceRepo.update).toHaveBeenCalled();
    });

    it('should deny the caller when role is EDITOR (below OWNER)', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.EDITOR,
        }),
      );

      await expect(
        service.run({ id: 'device-1', caller: { id: 'caller-1' } }, context),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(deviceRepo.update).not.toHaveBeenCalled();
    });

    it('should skip the role check when caller is { system: true } (CLI bypass)', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      deviceRepo.update.mockResolvedValue(mockDevice);

      await service.run({ id: 'device-1', caller: { system: true } }, context);

      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      expect(deviceRepo.update).toHaveBeenCalled();
    });

    it('should deny the caller with NotFoundError (not FORBIDDEN_ROLE) when no membership exists', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      await expect(
        service.run({ id: 'device-1', caller: { id: 'caller-1' } }, context),
      ).rejects.toThrow(NotFoundError);
      expect(deviceRepo.update).not.toHaveBeenCalled();
    });

    it('should produce the same NotFoundError for a real device with zero membership as for a nonexistent device (enumeration resistance)', async () => {
      const { service: serviceA, deviceRepo: deviceRepoA } = createService();
      deviceRepoA.findById.mockResolvedValue(null);
      let nonexistentError: unknown;
      try {
        await serviceA.run(
          { id: 'device-1', caller: { system: true } },
          context,
        );
      } catch (error) {
        nonexistentError = error;
      }

      const {
        service: serviceB,
        deviceRepo: deviceRepoB,
        userDeviceRepo,
      } = createService();
      deviceRepoB.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);
      let noMembershipError: unknown;
      try {
        await serviceB.run(
          { id: 'device-1', caller: { id: 'caller-1' } },
          context,
        );
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
