import type {
  IPowerEventRepository,
  PowerEvent,
} from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import { ValidationError } from '@home-pulse-watcher/shared';
import { GetPowerHistoryService } from './get-power-history.service.js';

describe('GetPowerHistoryService', () => {
  const mockEvents: PowerEvent[] = [
    {
      id: 'event-1',
      deviceId: 'device-123',
      status: PowerStatus.ON,
      timestamp: new Date('2026-02-04T10:00:00Z'),
      duration: 3600,
      formatDuration: () => '1h',
    } as PowerEvent,
    {
      id: 'event-2',
      deviceId: 'device-123',
      status: PowerStatus.OFF,
      timestamp: new Date('2026-02-04T09:00:00Z'),
      duration: 1800,
      formatDuration: () => '30m',
    } as PowerEvent,
  ];

  const createMockRepository = (): jest.Mocked<IPowerEventRepository> => ({
    findById: jest.fn(),
    findMany: jest.fn(),
    findLatestByDeviceId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByDeviceId: jest.fn(),
    count: jest.fn(),
  });

  describe('successful queries', () => {
    it('should return events with default pagination', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue(mockEvents);
      repo.count.mockResolvedValue(2);

      const service = new GetPowerHistoryService(repo);
      const result = await service.run({ deviceId: 'device-123' }, {});

      expect(result.data.events).toEqual(mockEvents);
      expect(result.data.total).toBe(2);
      expect(result.data.limit).toBe(20); // default
      expect(result.data.offset).toBe(0); // default
    });

    it('should pass deviceId to repository', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const service = new GetPowerHistoryService(repo);
      await service.run({ deviceId: 'device-123' }, {});

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-123',
        }),
      );
      expect(repo.count).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-123',
        }),
      );
    });

    it('should respect custom limit and offset', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([mockEvents[0]]);
      repo.count.mockResolvedValue(10);

      const service = new GetPowerHistoryService(repo);
      const result = await service.run(
        { deviceId: 'device-123', limit: 5, offset: 10 },
        {},
      );

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
          offset: 10,
        }),
      );
      expect(result.data.limit).toBe(5);
      expect(result.data.offset).toBe(10);
    });

    it('should filter by status', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([mockEvents[0]]);
      repo.count.mockResolvedValue(1);

      const service = new GetPowerHistoryService(repo);
      await service.run({ deviceId: 'device-123', status: PowerStatus.ON }, {});

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PowerStatus.ON,
        }),
      );
      expect(repo.count).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PowerStatus.ON,
        }),
      );
    });

    it('should filter by date range', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const service = new GetPowerHistoryService(repo);
      await service.run(
        {
          deviceId: 'device-123',
          startDate: '2026-02-01',
          endDate: '2026-02-04',
        },
        {},
      );

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-02-04'),
        }),
      );
    });

    it('should respect orderBy parameter', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const service = new GetPowerHistoryService(repo);
      await service.run({ deviceId: 'device-123', orderBy: 'asc' }, {});

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: 'asc',
        }),
      );
    });

    it('should default orderBy to desc', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const service = new GetPowerHistoryService(repo);
      await service.run({ deviceId: 'device-123' }, {});

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: 'desc',
        }),
      );
    });

    it('should run findMany and count in parallel', async () => {
      const repo = createMockRepository();

      // Track call order
      const callOrder: string[] = [];
      repo.findMany.mockImplementation(async () => {
        callOrder.push('findMany-start');
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('findMany-end');
        return mockEvents;
      });
      repo.count.mockImplementation(async () => {
        callOrder.push('count-start');
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('count-end');
        return 2;
      });

      const service = new GetPowerHistoryService(repo);
      await service.run({ deviceId: 'device-123' }, {});

      // Both should start before either ends (parallel execution)
      expect(callOrder.indexOf('findMany-start')).toBeLessThan(
        callOrder.indexOf('findMany-end'),
      );
      expect(callOrder.indexOf('count-start')).toBeLessThan(
        callOrder.indexOf('count-end'),
      );
      // Both should start before either ends
      const firstEndIndex = Math.min(
        callOrder.indexOf('findMany-end'),
        callOrder.indexOf('count-end'),
      );
      expect(callOrder.indexOf('findMany-start')).toBeLessThan(firstEndIndex);
      expect(callOrder.indexOf('count-start')).toBeLessThan(firstEndIndex);
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing deviceId', async () => {
      const repo = createMockRepository();
      const service = new GetPowerHistoryService(repo);

      await expect(service.run({} as { deviceId: string }, {})).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError for invalid status value', async () => {
      const repo = createMockRepository();
      const service = new GetPowerHistoryService(repo);

      await expect(
        service.run({ deviceId: 'device-123', status: 2 }, {}),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.run({ deviceId: 'device-123', status: -1 }, {}),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for limit exceeding 100', async () => {
      const repo = createMockRepository();
      const service = new GetPowerHistoryService(repo);

      await expect(
        service.run({ deviceId: 'device-123', limit: 101 }, {}),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative offset', async () => {
      const repo = createMockRepository();
      const service = new GetPowerHistoryService(repo);

      await expect(
        service.run({ deviceId: 'device-123', offset: -1 }, {}),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid orderBy', async () => {
      const repo = createMockRepository();
      const service = new GetPowerHistoryService(repo);

      await expect(
        service.run(
          { deviceId: 'device-123', orderBy: 'invalid' as 'asc' | 'desc' },
          {},
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should accept valid status values (0 and 1)', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const service = new GetPowerHistoryService(repo);

      await expect(
        service.run({ deviceId: 'device-123', status: 0 }, {}),
      ).resolves.toBeDefined();

      await expect(
        service.run({ deviceId: 'device-123', status: 1 }, {}),
      ).resolves.toBeDefined();
    });

    it('should accept valid limit up to 100', async () => {
      const repo = createMockRepository();
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const service = new GetPowerHistoryService(repo);

      await expect(
        service.run({ deviceId: 'device-123', limit: 100 }, {}),
      ).resolves.toBeDefined();

      await expect(
        service.run({ deviceId: 'device-123', limit: 1 }, {}),
      ).resolves.toBeDefined();
    });
  });
});
