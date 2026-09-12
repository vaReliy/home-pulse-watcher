import { PrismaUserDeviceRepository } from './user-device.repository.js';
import { UserDevice, DeviceRole } from '@home-pulse-watcher/core';

const mockPrismaClient = {
  userDevice: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

const baseRow = {
  userId: 'user-1',
  deviceId: 'device-1',
  customName: null,
  role: DeviceRole.VIEWER,
};

describe('PrismaUserDeviceRepository', () => {
  let repository: PrismaUserDeviceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PrismaUserDeviceRepository(mockPrismaClient as never);
  });

  describe('findByUserAndDevice', () => {
    it('should query by the composite userId_deviceId key', async () => {
      mockPrismaClient.userDevice.findUnique.mockResolvedValue(baseRow);

      const result = await repository.findByUserAndDevice('user-1', 'device-1');

      expect(result).toBeInstanceOf(UserDevice);
      expect(mockPrismaClient.userDevice.findUnique).toHaveBeenCalledWith({
        where: { userId_deviceId: { userId: 'user-1', deviceId: 'device-1' } },
      });
    });

    it('should return null when not found', async () => {
      mockPrismaClient.userDevice.findUnique.mockResolvedValue(null);

      const result = await repository.findByUserAndDevice('user-1', 'device-1');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return all links for a user', async () => {
      mockPrismaClient.userDevice.findMany.mockResolvedValue([baseRow]);

      const result = await repository.findByUserId('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(UserDevice);
      expect(mockPrismaClient.userDevice.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should return an empty array when the user has no links', async () => {
      mockPrismaClient.userDevice.findMany.mockResolvedValue([]);

      const result = await repository.findByUserId('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findByDeviceId', () => {
    it('should return all links for a device', async () => {
      mockPrismaClient.userDevice.findMany.mockResolvedValue([baseRow]);

      const result = await repository.findByDeviceId('device-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(UserDevice);
      expect(mockPrismaClient.userDevice.findMany).toHaveBeenCalledWith({
        where: { deviceId: 'device-1' },
      });
    });
  });

  describe('create', () => {
    it('should default customName to null and role to VIEWER when omitted', async () => {
      mockPrismaClient.userDevice.create.mockResolvedValue(baseRow);

      await repository.create({ userId: 'user-1', deviceId: 'device-1' });

      expect(mockPrismaClient.userDevice.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          deviceId: 'device-1',
          customName: null,
          role: 'VIEWER',
        },
      });
    });

    it('should use provided customName and role', async () => {
      mockPrismaClient.userDevice.create.mockResolvedValue({
        ...baseRow,
        customName: 'Kitchen',
        role: DeviceRole.OWNER,
      });

      await repository.create({
        userId: 'user-1',
        deviceId: 'device-1',
        customName: 'Kitchen',
        role: DeviceRole.OWNER,
      });

      expect(mockPrismaClient.userDevice.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          deviceId: 'device-1',
          customName: 'Kitchen',
          role: DeviceRole.OWNER,
        },
      });
    });
  });

  describe('update', () => {
    it('should build an empty data object when no fields are provided', async () => {
      mockPrismaClient.userDevice.update.mockResolvedValue(baseRow);

      await repository.update('user-1', 'device-1', {});

      expect(mockPrismaClient.userDevice.update).toHaveBeenCalledWith({
        where: {
          userId_deviceId: { userId: 'user-1', deviceId: 'device-1' },
        },
        data: {},
      });
    });

    it('should include only customName when only customName is provided', async () => {
      mockPrismaClient.userDevice.update.mockResolvedValue({
        ...baseRow,
        customName: 'Garage',
      });

      await repository.update('user-1', 'device-1', {
        customName: 'Garage',
      });

      expect(mockPrismaClient.userDevice.update).toHaveBeenCalledWith({
        where: {
          userId_deviceId: { userId: 'user-1', deviceId: 'device-1' },
        },
        data: { customName: 'Garage' },
      });
    });

    it('should include only role when only role is provided', async () => {
      mockPrismaClient.userDevice.update.mockResolvedValue({
        ...baseRow,
        role: DeviceRole.EDITOR,
      });

      await repository.update('user-1', 'device-1', {
        role: DeviceRole.EDITOR,
      });

      expect(mockPrismaClient.userDevice.update).toHaveBeenCalledWith({
        where: {
          userId_deviceId: { userId: 'user-1', deviceId: 'device-1' },
        },
        data: { role: DeviceRole.EDITOR },
      });
    });

    it('should include an explicit null customName (clearing it) since it is not undefined', async () => {
      mockPrismaClient.userDevice.update.mockResolvedValue({
        ...baseRow,
        customName: null,
      });

      await repository.update('user-1', 'device-1', { customName: null });

      expect(mockPrismaClient.userDevice.update).toHaveBeenCalledWith({
        where: {
          userId_deviceId: { userId: 'user-1', deviceId: 'device-1' },
        },
        data: { customName: null },
      });
    });

    it('should include both fields when both are provided', async () => {
      mockPrismaClient.userDevice.update.mockResolvedValue({
        ...baseRow,
        customName: 'Garage',
        role: DeviceRole.OWNER,
      });

      await repository.update('user-1', 'device-1', {
        customName: 'Garage',
        role: DeviceRole.OWNER,
      });

      expect(mockPrismaClient.userDevice.update).toHaveBeenCalledWith({
        where: {
          userId_deviceId: { userId: 'user-1', deviceId: 'device-1' },
        },
        data: { customName: 'Garage', role: DeviceRole.OWNER },
      });
    });
  });

  describe('delete', () => {
    it('should delete by composite key', async () => {
      mockPrismaClient.userDevice.delete.mockResolvedValue(baseRow);

      await repository.delete('user-1', 'device-1');

      expect(mockPrismaClient.userDevice.delete).toHaveBeenCalledWith({
        where: {
          userId_deviceId: { userId: 'user-1', deviceId: 'device-1' },
        },
      });
    });
  });

  describe('exists', () => {
    it('should return true when count is greater than 0', async () => {
      mockPrismaClient.userDevice.count.mockResolvedValue(1);

      const result = await repository.exists('user-1', 'device-1');

      expect(result).toBe(true);
      expect(mockPrismaClient.userDevice.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', deviceId: 'device-1' },
      });
    });

    it('should return false when count is 0', async () => {
      mockPrismaClient.userDevice.count.mockResolvedValue(0);

      const result = await repository.exists('user-1', 'device-1');

      expect(result).toBe(false);
    });
  });

  describe('countByDeviceId', () => {
    it('should return the count for a device', async () => {
      mockPrismaClient.userDevice.count.mockResolvedValue(4);

      const result = await repository.countByDeviceId('device-1');

      expect(result).toBe(4);
      expect(mockPrismaClient.userDevice.count).toHaveBeenCalledWith({
        where: { deviceId: 'device-1' },
      });
    });

    it('should return 0 when device has no linked users', async () => {
      mockPrismaClient.userDevice.count.mockResolvedValue(0);

      const result = await repository.countByDeviceId('device-1');

      expect(result).toBe(0);
    });
  });
});
