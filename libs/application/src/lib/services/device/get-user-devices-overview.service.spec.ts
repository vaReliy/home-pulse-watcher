import type {
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
  UserDevice,
} from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import { ValidationError } from '@home-pulse-watcher/shared';
import { GetUserDevicesOverviewService } from './get-user-devices-overview.service.js';

describe('GetUserDevicesOverviewService', () => {
  const mockDevice1 = {
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'iv:authtag:ciphertext',
    label: 'Kitchen',
    lastStatus: 1,
    lastSeenAt: new Date(),
    statusChangedAt: null,
    firmwareVersion: '1.0.0',
    batteryVoltage: null,
    isOnline: () => true,
  } as Device;

  const mockDevice2 = {
    id: 'device-2',
    macAddress: '11:22:33:44:55:66',
    encryptedSecret: 'iv:authtag:ciphertext2',
    label: 'Garage',
    lastStatus: 0,
    lastSeenAt: new Date(),
    statusChangedAt: null,
    firmwareVersion: null,
    batteryVoltage: null,
    isOnline: () => false,
  } as Device;

  const mockUserDevice1 = {
    userId: 'user-1',
    deviceId: 'device-1',
    customName: 'My Kitchen Plug',
    role: DeviceRole.OWNER,
  } as UserDevice;

  const mockUserDevice2 = {
    userId: 'user-1',
    deviceId: 'device-2',
    customName: null,
    role: DeviceRole.VIEWER,
  } as UserDevice;

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

  it('should assemble overview preserving userDevice order with role and customName', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const deviceRepo = createMockDeviceRepository();
    userDeviceRepo.findByUserId.mockResolvedValue([
      mockUserDevice1,
      mockUserDevice2,
    ]);
    deviceRepo.findByIds.mockResolvedValue([mockDevice2, mockDevice1]); // out of order on purpose

    const service = new GetUserDevicesOverviewService(
      userDeviceRepo,
      deviceRepo,
    );
    const result = await service.run({ userId: 'user-1' }, {});

    expect(result.data.total).toBe(2);
    expect(result.data.devices).toEqual([
      {
        device: mockDevice1,
        customName: 'My Kitchen Plug',
        role: DeviceRole.OWNER,
      },
      { device: mockDevice2, customName: null, role: DeviceRole.VIEWER },
    ]);
  });

  it('should call findByUserId then findByIds exactly once each (2 queries total)', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const deviceRepo = createMockDeviceRepository();
    userDeviceRepo.findByUserId.mockResolvedValue([
      mockUserDevice1,
      mockUserDevice2,
    ]);
    deviceRepo.findByIds.mockResolvedValue([mockDevice1, mockDevice2]);

    const service = new GetUserDevicesOverviewService(
      userDeviceRepo,
      deviceRepo,
    );
    await service.run({ userId: 'user-1' }, {});

    expect(userDeviceRepo.findByUserId).toHaveBeenCalledTimes(1);
    expect(userDeviceRepo.findByUserId).toHaveBeenCalledWith('user-1');
    expect(deviceRepo.findByIds).toHaveBeenCalledTimes(1);
    expect(deviceRepo.findByIds).toHaveBeenCalledWith(['device-1', 'device-2']);
  });

  it('should drop userDevice entries with no matching device', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const deviceRepo = createMockDeviceRepository();
    userDeviceRepo.findByUserId.mockResolvedValue([
      mockUserDevice1,
      mockUserDevice2,
    ]);
    deviceRepo.findByIds.mockResolvedValue([mockDevice1]); // device-2 missing

    const service = new GetUserDevicesOverviewService(
      userDeviceRepo,
      deviceRepo,
    );
    const result = await service.run({ userId: 'user-1' }, {});

    expect(result.data.total).toBe(1);
    expect(result.data.devices).toEqual([
      {
        device: mockDevice1,
        customName: 'My Kitchen Plug',
        role: DeviceRole.OWNER,
      },
    ]);
  });

  it('should return empty result when user has no devices, without calling findByIds', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const deviceRepo = createMockDeviceRepository();
    userDeviceRepo.findByUserId.mockResolvedValue([]);
    deviceRepo.findByIds.mockResolvedValue([]);

    const service = new GetUserDevicesOverviewService(
      userDeviceRepo,
      deviceRepo,
    );
    const result = await service.run({ userId: 'user-1' }, {});

    expect(result.data).toEqual({ devices: [], total: 0 });
    expect(deviceRepo.findByIds).toHaveBeenCalledWith([]);
  });

  it('should throw ValidationError when userId is missing', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const deviceRepo = createMockDeviceRepository();
    const service = new GetUserDevicesOverviewService(
      userDeviceRepo,
      deviceRepo,
    );

    await expect(service.run({} as { userId: string }, {})).rejects.toThrow(
      ValidationError,
    );
  });
});
