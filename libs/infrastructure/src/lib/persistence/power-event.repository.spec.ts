import { PrismaPowerEventRepository } from './power-event.repository.js';
import { PowerEvent, PowerStatus } from '@home-pulse-watcher/core';

const mockPrismaClient = {
  powerEvent: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};

const baseRow = {
  id: 'event-1',
  deviceId: 'device-1',
  status: PowerStatus.ON,
  timestamp: new Date('2024-01-01T00:00:00Z'),
  duration: null,
  voltage: null,
  batteryVoltage: null,
};

describe('PrismaPowerEventRepository', () => {
  let repository: PrismaPowerEventRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PrismaPowerEventRepository(mockPrismaClient as never);
  });

  describe('findById', () => {
    it('should return the event when found', async () => {
      mockPrismaClient.powerEvent.findUnique.mockResolvedValue(baseRow);

      const result = await repository.findById('event-1');

      expect(result).toBeInstanceOf(PowerEvent);
      expect(mockPrismaClient.powerEvent.findUnique).toHaveBeenCalledWith({
        where: { id: 'event-1' },
      });
    });

    it('should return null when not found', async () => {
      mockPrismaClient.powerEvent.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should build an empty where clause when no filters are given', async () => {
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([baseRow]);

      const result = await repository.findMany({});

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(PowerEvent);
      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith({
        where: {},
        take: undefined,
        skip: undefined,
        orderBy: { timestamp: 'desc' },
      });
    });

    it('should filter by deviceId and status when provided', async () => {
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([]);

      await repository.findMany({
        deviceId: 'device-1',
        status: PowerStatus.OFF,
      });

      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith({
        where: { deviceId: 'device-1', status: PowerStatus.OFF },
        take: undefined,
        skip: undefined,
        orderBy: { timestamp: 'desc' },
      });
    });

    it('should not filter by status when status is 0 (falsy but valid)', async () => {
      // Regression guard: status uses `!== undefined`, not truthiness, so
      // PowerStatus.OFF (0) must still be applied to the where clause.
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([]);

      await repository.findMany({ status: PowerStatus.OFF });

      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: PowerStatus.OFF } }),
      );
    });

    it('should build a timestamp range with only gte when only startDate is given', async () => {
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([]);
      const startDate = new Date('2024-01-01');

      await repository.findMany({ startDate });

      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: { gte: startDate } },
        }),
      );
    });

    it('should build a timestamp range with only lte when only endDate is given', async () => {
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([]);
      const endDate = new Date('2024-01-31');

      await repository.findMany({ endDate });

      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: { lte: endDate } },
        }),
      );
    });

    it('should build a timestamp range with both gte and lte when both dates are given', async () => {
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([]);
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await repository.findMany({ startDate, endDate });

      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: { gte: startDate, lte: endDate } },
        }),
      );
    });

    it('should pass through limit, offset, and explicit orderBy', async () => {
      mockPrismaClient.powerEvent.findMany.mockResolvedValue([]);

      await repository.findMany({ limit: 10, offset: 20, orderBy: 'asc' });

      expect(mockPrismaClient.powerEvent.findMany).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 20,
        orderBy: { timestamp: 'asc' },
      });
    });
  });

  describe('findLatestByDeviceId', () => {
    it('should query with deviceId filter and desc timestamp order', async () => {
      mockPrismaClient.powerEvent.findFirst.mockResolvedValue(baseRow);

      const result = await repository.findLatestByDeviceId('device-1');

      expect(result).toBeInstanceOf(PowerEvent);
      expect(mockPrismaClient.powerEvent.findFirst).toHaveBeenCalledWith({
        where: { deviceId: 'device-1' },
        orderBy: { timestamp: 'desc' },
      });
    });

    it('should return null when device has no events', async () => {
      mockPrismaClient.powerEvent.findFirst.mockResolvedValue(null);

      const result = await repository.findLatestByDeviceId('device-1');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should default timestamp, duration, voltage, and batteryVoltage when omitted', async () => {
      mockPrismaClient.powerEvent.create.mockResolvedValue(baseRow);

      await repository.create({
        deviceId: 'device-1',
        status: PowerStatus.ON,
      });

      expect(mockPrismaClient.powerEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviceId: 'device-1',
          status: PowerStatus.ON,
          duration: null,
          voltage: null,
          batteryVoltage: null,
          timestamp: expect.any(Date),
        }),
      });
    });

    it('should use provided timestamp, duration, voltage, and batteryVoltage', async () => {
      const timestamp = new Date('2024-02-02');
      mockPrismaClient.powerEvent.create.mockResolvedValue(baseRow);

      await repository.create({
        deviceId: 'device-1',
        status: PowerStatus.OFF,
        timestamp,
        duration: 120,
        voltage: 230,
        batteryVoltage: 3700,
      });

      expect(mockPrismaClient.powerEvent.create).toHaveBeenCalledWith({
        data: {
          deviceId: 'device-1',
          status: PowerStatus.OFF,
          timestamp,
          duration: 120,
          voltage: 230,
          batteryVoltage: 3700,
        },
      });
    });
  });

  describe('update', () => {
    it('should update duration', async () => {
      mockPrismaClient.powerEvent.update.mockResolvedValue({
        ...baseRow,
        duration: 60,
      });

      const result = await repository.update('event-1', { duration: 60 });

      expect(result).toBeInstanceOf(PowerEvent);
      expect(mockPrismaClient.powerEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { duration: 60 },
      });
    });
  });

  describe('delete', () => {
    it('should delete the event by id', async () => {
      mockPrismaClient.powerEvent.delete.mockResolvedValue(baseRow);

      await repository.delete('event-1');

      expect(mockPrismaClient.powerEvent.delete).toHaveBeenCalledWith({
        where: { id: 'event-1' },
      });
    });
  });

  describe('deleteByDeviceId', () => {
    it('should return the deleted count', async () => {
      mockPrismaClient.powerEvent.deleteMany.mockResolvedValue({ count: 5 });

      const result = await repository.deleteByDeviceId('device-1');

      expect(result).toBe(5);
      expect(mockPrismaClient.powerEvent.deleteMany).toHaveBeenCalledWith({
        where: { deviceId: 'device-1' },
      });
    });

    it('should return 0 when no events matched', async () => {
      mockPrismaClient.powerEvent.deleteMany.mockResolvedValue({ count: 0 });

      const result = await repository.deleteByDeviceId('device-1');

      expect(result).toBe(0);
    });
  });

  describe('count', () => {
    it('should build the same where-clause filters as findMany (excluding pagination/order)', async () => {
      mockPrismaClient.powerEvent.count.mockResolvedValue(3);
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await repository.count({
        deviceId: 'device-1',
        status: PowerStatus.ON,
        startDate,
        endDate,
      });

      expect(result).toBe(3);
      expect(mockPrismaClient.powerEvent.count).toHaveBeenCalledWith({
        where: {
          deviceId: 'device-1',
          status: PowerStatus.ON,
          timestamp: { gte: startDate, lte: endDate },
        },
      });
    });

    it('should build an empty where clause when no filters are given', async () => {
      mockPrismaClient.powerEvent.count.mockResolvedValue(0);

      const result = await repository.count({});

      expect(result).toBe(0);
      expect(mockPrismaClient.powerEvent.count).toHaveBeenCalledWith({
        where: {},
      });
    });
  });
});
