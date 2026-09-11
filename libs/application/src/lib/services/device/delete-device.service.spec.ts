import type {
  IDeviceRepository,
  IUserDeviceRepository,
  IPowerEventRepository,
  Device,
} from '@home-pulse-watcher/core';
import { DeviceRole, UserDevice } from '@home-pulse-watcher/core';
import {
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { DeleteDeviceService } from './delete-device.service.js';

describe('DeleteDeviceService', () => {
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

  const createMockPowerEventRepository =
    (): jest.Mocked<IPowerEventRepository> => ({
      findById: jest.fn(),
      findMany: jest.fn(),
      findLatestByDeviceId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByDeviceId: jest.fn(),
      count: jest.fn(),
    });

  const createService = () => {
    const deviceRepo = createMockDeviceRepository();
    const userDeviceRepo = createMockUserDeviceRepository();
    const powerEventRepo = createMockPowerEventRepository();
    const service = new DeleteDeviceService(
      deviceRepo,
      userDeviceRepo,
      powerEventRepo,
    );
    return { service, deviceRepo, userDeviceRepo, powerEventRepo };
  };

  describe('successful deletion', () => {
    it('should delete the device found by id and its associations', async () => {
      const { service, deviceRepo, userDeviceRepo, powerEventRepo } =
        createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByDeviceId.mockResolvedValue([]);
      powerEventRepo.deleteByDeviceId.mockResolvedValue(0);

      const result = await service.run({
        id: 'device-1',
        caller: { system: true },
      });

      expect(deviceRepo.delete).toHaveBeenCalledWith('device-1');
      expect(result.data.device).toEqual(mockDevice);
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither id nor macAddress provided', async () => {
      const { service } = createService();

      await expect(service.run({ caller: { system: true } })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw NotFoundError when device does not exist', async () => {
      const { service, deviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(null);

      await expect(
        service.run({ id: 'missing', caller: { system: true } }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('role enforcement', () => {
    it('should allow the caller when role is OWNER', async () => {
      const { service, deviceRepo, userDeviceRepo, powerEventRepo } =
        createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByDeviceId.mockResolvedValue([]);
      powerEventRepo.deleteByDeviceId.mockResolvedValue(0);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'caller-1',
          deviceId: 'device-1',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      );

      await service.run({ id: 'device-1', caller: { id: 'caller-1' } });

      expect(deviceRepo.delete).toHaveBeenCalledWith('device-1');
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
        service.run({ id: 'device-1', caller: { id: 'caller-1' } }),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(deviceRepo.delete).not.toHaveBeenCalled();
    });

    it('should skip the role check when caller is { system: true } (CLI bypass)', async () => {
      const { service, deviceRepo, userDeviceRepo, powerEventRepo } =
        createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByDeviceId.mockResolvedValue([]);
      powerEventRepo.deleteByDeviceId.mockResolvedValue(0);

      await service.run({ id: 'device-1', caller: { system: true } });

      expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      expect(deviceRepo.delete).toHaveBeenCalledWith('device-1');
    });

    it('should deny the caller when no membership exists', async () => {
      const { service, deviceRepo, userDeviceRepo } = createService();
      deviceRepo.findById.mockResolvedValue(mockDevice);
      userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      await expect(
        service.run({ id: 'device-1', caller: { id: 'caller-1' } }),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(deviceRepo.delete).not.toHaveBeenCalled();
    });
  });
});
