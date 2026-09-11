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

  describe('by id', () => {
    it('should set the flag for the device found by id', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findById.mockResolvedValue(mockDevice);

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );
      const result = await service.run(
        { id: 'device-123', caller: { system: true } },
        {},
      );

      expect(mockRepo.findById).toHaveBeenCalledWith('device-123');
      expect(mockRepo.requestOtaForceCheck).toHaveBeenCalledWith('device-123');
      expect(result.data.device).toEqual(mockDevice);
    });
  });

  describe('by macAddress', () => {
    it('should normalize MAC to uppercase and set the flag', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findByMacAddress.mockResolvedValue(mockDevice);

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );
      await service.run(
        { macAddress: 'aa:bb:cc:dd:ee:ff', caller: { system: true } },
        {},
      );

      expect(mockRepo.findByMacAddress).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
      );
      expect(mockRepo.requestOtaForceCheck).toHaveBeenCalledWith(mockDevice.id);
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when neither id nor macAddress provided', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );

      await expect(
        service.run({ caller: { system: true } }, {}),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when device does not exist', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findById.mockResolvedValue(null);

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );

      await expect(
        service.run({ id: 'missing-device', caller: { system: true } }, {}),
      ).rejects.toThrow(NotFoundError);
      expect(mockRepo.requestOtaForceCheck).not.toHaveBeenCalled();
    });
  });

  describe('role enforcement', () => {
    it('should allow the caller when role is OWNER', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findById.mockResolvedValue(mockDevice);
      mockUserDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'user-1',
          deviceId: 'device-123',
          customName: null,
          role: DeviceRole.OWNER,
        }),
      );

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );

      await service.run({ id: 'device-123', caller: { id: 'user-1' } }, {});

      expect(mockRepo.requestOtaForceCheck).toHaveBeenCalledWith('device-123');
    });

    it('should deny the caller when role is EDITOR (below OWNER)', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findById.mockResolvedValue(mockDevice);
      mockUserDeviceRepo.findByUserAndDevice.mockResolvedValue(
        new UserDevice({
          userId: 'user-1',
          deviceId: 'device-123',
          customName: null,
          role: DeviceRole.EDITOR,
        }),
      );

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );

      await expect(
        service.run({ id: 'device-123', caller: { id: 'user-1' } }, {}),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(mockRepo.requestOtaForceCheck).not.toHaveBeenCalled();
    });

    it('should skip the role check when caller is { system: true } (CLI bypass)', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findById.mockResolvedValue(mockDevice);

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );

      await service.run({ id: 'device-123', caller: { system: true } }, {});

      expect(mockUserDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
      expect(mockRepo.requestOtaForceCheck).toHaveBeenCalledWith('device-123');
    });

    it('should deny the caller when no membership exists', async () => {
      const mockRepo = createMockRepository();
      const mockUserDeviceRepo = createMockUserDeviceRepository();
      mockRepo.findById.mockResolvedValue(mockDevice);
      mockUserDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

      const service = new RequestOtaForceCheckService(
        mockRepo,
        mockUserDeviceRepo,
      );

      await expect(
        service.run({ id: 'device-123', caller: { id: 'user-1' } }, {}),
      ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
      expect(mockRepo.requestOtaForceCheck).not.toHaveBeenCalled();
    });
  });
});
