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
import { UpdateDeviceService } from './update-device.service.js';

describe('UpdateDeviceService', () => {
  const mockDevice: Device = {
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'iv:authtag:ciphertext',
    label: 'Old Label',
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
    const service = new UpdateDeviceService(deviceRepo, userDeviceRepo);
    return { service, deviceRepo, userDeviceRepo };
  };

  describe('successful update', () => {
    it('should update the device label found by id', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      deviceRepo.update.mockResolvedValue({
        ...mockDevice,
        label: 'New Label',
      } as Device);

      const result = await service.run({
        id: 'device-1',
        label: 'New Label',
        caller: { system: true },
      });

      expect(deviceRepo.update).toHaveBeenCalledWith('device-1', {
        label: 'New Label',
      });
      expect(result.data.device.label).toBe('New Label');
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither id nor macAddress provided', async () => {
      const { service } = createService();

      await expect(
        service.run({ label: 'x', caller: { system: true } }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when device does not exist', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(null);

      await expect(
        service.run({
          id: 'missing',
          label: 'x',
          caller: { system: true },
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('role enforcement', () => {
    it('should allow the caller when role is EDITOR', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      deviceRepo.update.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.EDITOR,
        }),
      );

      await service.run({
        id: 'device-1',
        label: 'New Label',
        caller: { id: 'caller-1' },
      });

      expect(deviceRepo.update).toHaveBeenCalled();
    });

    it('should deny the caller when role is VIEWER (below EDITOR)', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
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
          id: 'device-1',
          label: 'New Label',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(deviceRepo.update).not.toHaveBeenCalled();
    });

    it('should skip the role check when caller is { system: true } (CLI bypass)', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      deviceRepo.update.mockResolvedValue(mockDevice);

      await service.run({
        id: 'device-1',
        label: 'New Label',
        caller: { system: true },
      });

      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      expect(deviceRepo.update).toHaveBeenCalled();
    });

    it('should deny the caller when no membership exists', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      await expect(
        service.run({
          id: 'device-1',
          label: 'New Label',
          caller: { id: 'caller-1' },
        }),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(deviceRepo.update).not.toHaveBeenCalled();
    });
  });
});
