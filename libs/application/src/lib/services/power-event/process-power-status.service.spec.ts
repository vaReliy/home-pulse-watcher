import type {
  IDeviceRepository,
  IPowerEventRepository,
  Device,
  PowerEvent,
} from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import { NotFoundError, ValidationError } from '@home-pulse-watcher/shared';
import {
  ProcessPowerStatusService,
  type IEventEmitter,
} from './process-power-status.service.js';
import { POWER_STATUS_CHANGED_EVENT } from '../../events/power-status-changed.event.js';

describe('ProcessPowerStatusService', () => {
  const createMockDevice = (
    overrides: Partial<Omit<Device, 'isOnline'>> = {},
  ): Device =>
    ({
      id: 'device-123',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: 'Kitchen',
      lastStatus: null,
      lastSeenAt: null,
      ...overrides,
      isOnline: () => false,
    }) as Device;

  const createMockPowerEvent = (
    overrides: Partial<Omit<PowerEvent, 'formatDuration'>> = {},
  ): PowerEvent =>
    ({
      id: 'event-123',
      deviceId: 'device-123',
      status: PowerStatus.ON,
      timestamp: new Date('2026-02-04T10:00:00Z'),
      duration: null,
      ...overrides,
      formatDuration: () => null,
    }) as PowerEvent;

  const mockPowerEvent = createMockPowerEvent();

  const createMockDeviceRepository = (): jest.Mocked<IDeviceRepository> => ({
    findById: jest.fn(),
    findByMacAddress: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
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

  const createMockEventEmitter = (): jest.Mocked<IEventEmitter> => ({
    emit: jest.fn().mockResolvedValue([true]),
  });

  const validContext = { deviceId: 'device-123' };

  describe('successful status processing', () => {
    it('should create power event record', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      const result = await service.run(
        { status: PowerStatus.ON },
        validContext,
      );

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-123',
          status: PowerStatus.ON,
          duration: null,
        }),
      );
      expect(result.data.event).toEqual(mockPowerEvent);
    });

    it('should update device lastStatus and lastSeenAt', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const beforeTime = Date.now();
      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      await service.run({ status: PowerStatus.ON }, validContext);

      const afterTime = Date.now();

      expect(deviceRepo.updateStatus).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({
          lastStatus: PowerStatus.ON,
        }),
      );

      // Verify timestamp is reasonable
      const updateCall = deviceRepo.updateStatus.mock.calls[0][1];
      const timestamp = updateCall.lastSeenAt.getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should calculate duration and update previous event', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const previousEvent = createMockPowerEvent({
        id: 'prev-event-123',
        timestamp: new Date('2026-02-04T09:00:00Z'), // 1 hour ago
      });

      // Device already has a previous status
      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(previousEvent);
      eventRepo.update.mockResolvedValue(previousEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      // Mock Date.now to control the current time
      const now = new Date('2026-02-04T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      try {
        await service.run({ status: PowerStatus.ON }, validContext);

        // Duration should be 3600 seconds (1 hour)
        expect(eventRepo.update).toHaveBeenCalledWith('prev-event-123', {
          duration: 3600,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('should handle first event (no previous status)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: null }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      const result = await service.run(
        { status: PowerStatus.ON },
        validContext,
      );

      // Should NOT try to update a previous event
      expect(eventRepo.update).not.toHaveBeenCalled();
      expect(result.data.isStatusChange).toBe(true); // null -> ON is a change
      expect(result.data.previousStatus).toBeNull();
    });

    it('should return isStatusChange=true when status changes', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(mockPowerEvent);
      eventRepo.update.mockResolvedValue(mockPowerEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      const result = await service.run(
        { status: PowerStatus.ON },
        validContext,
      );

      expect(result.data.isStatusChange).toBe(true);
      expect(result.data.previousStatus).toBe(PowerStatus.OFF);
    });

    it('should return isStatusChange=false for heartbeat (same status)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(mockPowerEvent);
      eventRepo.update.mockResolvedValue(mockPowerEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      const result = await service.run(
        { status: PowerStatus.ON },
        validContext,
      );

      expect(result.data.isStatusChange).toBe(false);
      expect(result.data.previousStatus).toBe(PowerStatus.ON);
    });
  });

  describe('event emission', () => {
    it('should emit PowerStatusChangedEvent on status change', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(mockPowerEvent);
      eventRepo.update.mockResolvedValue(mockPowerEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(
        deviceRepo,
        eventRepo,
        emitter,
      );
      await service.run({ status: PowerStatus.ON }, validContext);

      expect(emitter.emit).toHaveBeenCalledWith(
        POWER_STATUS_CHANGED_EVENT,
        expect.objectContaining({
          deviceId: 'device-123',
          deviceLabel: 'Kitchen',
          previousStatus: PowerStatus.OFF,
          newStatus: PowerStatus.ON,
        }),
      );
    });

    it('should NOT emit event on heartbeat (same status)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(mockPowerEvent);
      eventRepo.update.mockResolvedValue(mockPowerEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(
        deviceRepo,
        eventRepo,
        emitter,
      );
      await service.run({ status: PowerStatus.ON }, validContext);

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('should work without event emitter (optional)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(mockPowerEvent);
      eventRepo.update.mockResolvedValue(mockPowerEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      // No event emitter passed
      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      const result = await service.run(
        { status: PowerStatus.ON },
        validContext,
      );

      // Should complete without errors
      expect(result.data.isStatusChange).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw Error if deviceId missing from context', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(service.run({ status: PowerStatus.ON }, {})).rejects.toThrow(
        'deviceId not provided in service context',
      );
    });

    it('should throw NotFoundError if device not found', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(null);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(
        service.run({ status: PowerStatus.ON }, validContext),
      ).rejects.toThrow(NotFoundError);

      await expect(
        service.run({ status: PowerStatus.ON }, validContext),
      ).rejects.toMatchObject({
        resourceType: 'Device',
        identifier: 'device-123',
      });
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing status', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(
        service.run({} as { status: number }, validContext),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid status value', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(service.run({ status: 2 }, validContext)).rejects.toThrow(
        ValidationError,
      );

      await expect(service.run({ status: -1 }, validContext)).rejects.toThrow(
        ValidationError,
      );
    });

    it('should accept valid status values (0 and 1)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(createMockDevice());
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      // Status 0 (OFF)
      await expect(
        service.run({ status: 0 }, validContext),
      ).resolves.toBeDefined();

      // Status 1 (ON)
      await expect(
        service.run({ status: 1 }, validContext),
      ).resolves.toBeDefined();
    });
  });
});
