import { PrismaDeviceRepository } from './device.repository.js';
import { Device, PowerStatus } from '@home-pulse-watcher/core';

const mockPrismaClient = {
  device: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

describe('PrismaDeviceRepository', () => {
  let repository: PrismaDeviceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PrismaDeviceRepository(mockPrismaClient as never);
  });

  describe('findById', () => {
    it('should return device when found', async () => {
      const prismaDevice = {
        id: 'device-1',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        secretHash: 'hashed',
        label: 'Kitchen',
        lastStatus: 1,
        lastSeenAt: new Date(),
      };
      mockPrismaClient.device.findUnique.mockResolvedValue(prismaDevice);

      const result = await repository.findById('device-1');

      expect(result).toBeInstanceOf(Device);
      expect(result?.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should return null when not found', async () => {
      mockPrismaClient.device.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByMacAddress', () => {
    it('should find device by MAC address', async () => {
      const prismaDevice = {
        id: 'device-1',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        secretHash: 'hashed',
        label: null,
        lastStatus: null,
        lastSeenAt: null,
      };
      mockPrismaClient.device.findUnique.mockResolvedValue(prismaDevice);

      const result = await repository.findByMacAddress('AA:BB:CC:DD:EE:FF');

      expect(result).toBeInstanceOf(Device);
      expect(mockPrismaClient.device.findUnique).toHaveBeenCalledWith({
        where: { macAddress: 'AA:BB:CC:DD:EE:FF' },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update device status', async () => {
      const now = new Date();
      const prismaDevice = {
        id: 'device-1',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        secretHash: 'hashed',
        label: null,
        lastStatus: 1,
        lastSeenAt: now,
      };
      mockPrismaClient.device.update.mockResolvedValue(prismaDevice);

      const result = await repository.updateStatus('device-1', {
        lastStatus: PowerStatus.ON,
        lastSeenAt: now,
      });

      expect(result.lastStatus).toBe(PowerStatus.ON);
      expect(mockPrismaClient.device.update).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: { lastStatus: PowerStatus.ON, lastSeenAt: now },
      });
    });
  });

  describe('findByUserId', () => {
    it('should find all devices for a user', async () => {
      const devices = [
        {
          id: 'device-1',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          secretHash: 'hashed',
          label: 'Kitchen',
          lastStatus: 1,
          lastSeenAt: new Date(),
        },
        {
          id: 'device-2',
          macAddress: '11:22:33:44:55:66',
          secretHash: 'hashed2',
          label: 'Garage',
          lastStatus: 0,
          lastSeenAt: new Date(),
        },
      ];
      mockPrismaClient.device.findMany.mockResolvedValue(devices);

      const result = await repository.findByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Device);
      expect(mockPrismaClient.device.findMany).toHaveBeenCalledWith({
        where: { users: { some: { userId: 'user-1' } } },
      });
    });
  });
});
