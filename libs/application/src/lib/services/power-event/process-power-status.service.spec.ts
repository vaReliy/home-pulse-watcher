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
import {
  BATTERY_LOW_EVENT,
  BATTERY_LOW_THRESHOLD_MV,
} from '../../events/battery-low.event.js';

describe('ProcessPowerStatusService', () => {
  const createMockDevice = (
    overrides: Partial<Omit<Device, 'isOnline' | 'hasUps'>> = {},
  ): Device =>
    ({
      id: 'device-123',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'iv:authtag:ciphertext',
      label: 'Kitchen',
      lastStatus: null,
      lastSeenAt: null,
      statusChangedAt: null,
      firmwareVersion: null,
      batteryVoltage: null,
      ...overrides,
      isOnline: () => false,
      get hasUps() {
        return this.batteryVoltage !== null;
      },
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
      voltage: null,
      batteryVoltage: null,
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
    it('should create power event record with voltage', async () => {
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
        { status: PowerStatus.ON, voltage: 3500, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-123',
          status: PowerStatus.ON,
          duration: null,
          voltage: 3500,
        }),
      );
      expect(result.data.event).toEqual(mockPowerEvent);
    });

    it('should create power event with null voltage when not provided', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          voltage: null,
        }),
      );
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
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

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
        await service.run(
          { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        );

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
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      // Should NOT try to update a previous event
      expect(eventRepo.update).not.toHaveBeenCalled();
      expect(result.data.isStatusChange).toBe(true); // null -> ON is a change
      expect(result.data.previousStatus).toBeNull();
      expect(result.data.debounced).toBe(false);
    });

    it('should return isStatusChange=true when status changes', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const previousEvent = createMockPowerEvent({
        timestamp: new Date('2026-02-04T09:00:00Z'),
      });

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
      const result = await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(result.data.isStatusChange).toBe(true);
      expect(result.data.previousStatus).toBe(PowerStatus.OFF);
    });

    it('should pass firmwareVersion to updateStatus when provided', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({
          lastStatus: PowerStatus.ON,
          firmwareVersion: '3.1.0',
        }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: '3.1.0', batteryVoltage: null },
        validContext,
      );

      expect(deviceRepo.updateStatus).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({
          firmwareVersion: '3.1.0',
        }),
      );
    });

    it('should pass statusChangedAt when status changes', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const previousEvent = createMockPowerEvent({
        timestamp: new Date('2026-02-04T09:00:00Z'),
      });

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
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      const updateCall = deviceRepo.updateStatus.mock.calls[0][1];
      expect(updateCall.statusChangedAt).toBeInstanceOf(Date);
    });

    it('should NOT pass statusChangedAt on heartbeat (same status)', async () => {
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
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      const updateCall = deviceRepo.updateStatus.mock.calls[0][1];
      expect(updateCall.statusChangedAt).toBeUndefined();
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
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(result.data.isStatusChange).toBe(false);
      expect(result.data.previousStatus).toBe(PowerStatus.ON);
      expect(result.data.debounced).toBe(false);
    });
  });

  describe('event emission', () => {
    it('should emit PowerStatusChangedEvent on status change', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      const previousEvent = createMockPowerEvent({
        timestamp: new Date('2026-02-04T09:00:00Z'),
      });

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(previousEvent);
      eventRepo.update.mockResolvedValue(previousEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(
        deviceRepo,
        eventRepo,
        emitter,
      );
      await service.run(
        { status: PowerStatus.ON, voltage: 3200, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(emitter.emit).toHaveBeenCalledWith(
        POWER_STATUS_CHANGED_EVENT,
        expect.objectContaining({
          deviceId: 'device-123',
          deviceLabel: 'Kitchen',
          previousStatus: PowerStatus.OFF,
          newStatus: PowerStatus.ON,
          voltage: 3200,
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
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('should work without event emitter (optional)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const previousEvent = createMockPowerEvent({
        timestamp: new Date('2026-02-04T09:00:00Z'),
      });

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(previousEvent);
      eventRepo.update.mockResolvedValue(previousEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      // No event emitter passed
      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      const result = await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      // Should complete without errors
      expect(result.data.isStatusChange).toBe(true);
    });
  });

  describe('server-side debounce', () => {
    it('should debounce when status changes within 5s of last event', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      const now = new Date('2026-02-04T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      try {
        // Last event was 3 seconds ago
        const recentEvent = createMockPowerEvent({
          id: 'recent-event',
          status: PowerStatus.OFF,
          timestamp: new Date('2026-02-04T09:59:57Z'), // 3s ago
        });

        deviceRepo.findById.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.OFF }),
        );
        deviceRepo.updateStatus.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.ON }),
        );
        eventRepo.findLatestByDeviceId.mockResolvedValue(recentEvent);
        eventRepo.update.mockResolvedValue(recentEvent);
        eventRepo.create.mockResolvedValue(mockPowerEvent);

        const service = new ProcessPowerStatusService(
          deviceRepo,
          eventRepo,
          emitter,
        );
        const result = await service.run(
          { status: PowerStatus.ON, voltage: 3000, firmwareVersion: null, batteryVoltage: null },
          validContext,
        );

        // Event should still be created (for diagnostics)
        expect(eventRepo.create).toHaveBeenCalled();
        // Device should still be updated
        expect(deviceRepo.updateStatus).toHaveBeenCalled();
        // But notification should NOT be emitted
        expect(emitter.emit).not.toHaveBeenCalled();
        // Result should indicate debounce
        expect(result.data.debounced).toBe(true);
        expect(result.data.isStatusChange).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should NOT debounce when status changes after 5s', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      const now = new Date('2026-02-04T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      try {
        // Last event was 10 seconds ago
        const oldEvent = createMockPowerEvent({
          id: 'old-event',
          status: PowerStatus.OFF,
          timestamp: new Date('2026-02-04T09:59:50Z'), // 10s ago
        });

        deviceRepo.findById.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.OFF }),
        );
        deviceRepo.updateStatus.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.ON }),
        );
        eventRepo.findLatestByDeviceId.mockResolvedValue(oldEvent);
        eventRepo.update.mockResolvedValue(oldEvent);
        eventRepo.create.mockResolvedValue(mockPowerEvent);

        const service = new ProcessPowerStatusService(
          deviceRepo,
          eventRepo,
          emitter,
        );
        const result = await service.run(
          { status: PowerStatus.ON, voltage: 3500, firmwareVersion: null, batteryVoltage: null },
          validContext,
        );

        // Notification should be emitted
        expect(emitter.emit).toHaveBeenCalledWith(
          POWER_STATUS_CHANGED_EVENT,
          expect.objectContaining({
            deviceId: 'device-123',
            newStatus: PowerStatus.ON,
            voltage: 3500,
          }),
        );
        expect(result.data.debounced).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should NOT debounce first status change (no previous event)', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: null }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(
        deviceRepo,
        eventRepo,
        emitter,
      );
      const result = await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(emitter.emit).toHaveBeenCalled();
      expect(result.data.debounced).toBe(false);
    });

    it('should debounce at exactly 4s but not at 5s', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      const now = new Date('2026-02-04T10:00:05Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      try {
        // Last event exactly 4 seconds ago — should debounce
        const event4sAgo = createMockPowerEvent({
          id: 'event-4s',
          status: PowerStatus.OFF,
          timestamp: new Date('2026-02-04T10:00:01Z'),
        });

        deviceRepo.findById.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.OFF }),
        );
        deviceRepo.updateStatus.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.ON }),
        );
        eventRepo.findLatestByDeviceId.mockResolvedValue(event4sAgo);
        eventRepo.update.mockResolvedValue(event4sAgo);
        eventRepo.create.mockResolvedValue(mockPowerEvent);

        const service = new ProcessPowerStatusService(
          deviceRepo,
          eventRepo,
          emitter,
        );
        const result = await service.run(
          { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        );

        expect(result.data.debounced).toBe(true);
        expect(emitter.emit).not.toHaveBeenCalled();

        // Now test exactly 5s — should NOT debounce
        emitter.emit.mockClear();
        const event5sAgo = createMockPowerEvent({
          id: 'event-5s',
          status: PowerStatus.OFF,
          timestamp: new Date('2026-02-04T10:00:00Z'),
        });

        deviceRepo.findById.mockResolvedValue(
          createMockDevice({ lastStatus: PowerStatus.OFF }),
        );
        eventRepo.findLatestByDeviceId.mockResolvedValue(event5sAgo);
        eventRepo.update.mockResolvedValue(event5sAgo);

        const result2 = await service.run(
          { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        );

        expect(result2.data.debounced).toBe(false);
        expect(emitter.emit).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('error handling', () => {
    it('should throw Error if deviceId missing from context', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(
        service.run(
          { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
          {},
        ),
      ).rejects.toThrow('deviceId not provided in service context');
    });

    it('should throw NotFoundError if device not found', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(null);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(
        service.run(
          { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        ),
      ).rejects.toThrow(NotFoundError);

      await expect(
        service.run(
          { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        ),
      ).rejects.toMatchObject({
        resourceType: 'Device',
        identifier: 'device-123',
      });
    });
  });

  describe('battery voltage handling', () => {
    it('should pass batteryVoltage to powerEventRepository.create', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: 3850 },
        validContext,
      );

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ batteryVoltage: 3850 }),
      );
    });

    it('should pass batteryVoltage to deviceRepository.updateStatus', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: 3850 },
        validContext,
      );

      expect(deviceRepo.updateStatus).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({ batteryVoltage: 3850 }),
      );
    });

    it('should pass batteryVoltage to PowerStatusChangedEvent', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      const previousEvent = createMockPowerEvent({
        timestamp: new Date('2026-02-04T09:00:00Z'),
      });

      deviceRepo.findById.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.OFF }),
      );
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(previousEvent);
      eventRepo.update.mockResolvedValue(previousEvent);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo, emitter);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: 3850 },
        validContext,
      );

      expect(emitter.emit).toHaveBeenCalledWith(
        POWER_STATUS_CHANGED_EVENT,
        expect.objectContaining({ batteryVoltage: 3850 }),
      );
    });

    it('should emit BatteryLowEvent when batteryVoltage is below threshold', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo, emitter);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: BATTERY_LOW_THRESHOLD_MV - 1 },
        validContext,
      );

      expect(emitter.emit).toHaveBeenCalledWith(
        BATTERY_LOW_EVENT,
        expect.objectContaining({
          deviceId: 'device-123',
          batteryVoltage: BATTERY_LOW_THRESHOLD_MV - 1,
        }),
      );
    });

    it('should NOT emit BatteryLowEvent when batteryVoltage is at or above threshold', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo, emitter);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: BATTERY_LOW_THRESHOLD_MV },
        validContext,
      );

      expect(emitter.emit).not.toHaveBeenCalledWith(
        BATTERY_LOW_EVENT,
        expect.anything(),
      );
    });

    it('should NOT emit BatteryLowEvent when batteryVoltage is null', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();
      const emitter = createMockEventEmitter();

      deviceRepo.findById.mockResolvedValue(createMockDevice());
      deviceRepo.updateStatus.mockResolvedValue(
        createMockDevice({ lastStatus: PowerStatus.ON }),
      );
      eventRepo.findLatestByDeviceId.mockResolvedValue(null);
      eventRepo.create.mockResolvedValue(mockPowerEvent);

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo, emitter);
      await service.run(
        { status: PowerStatus.ON, voltage: null, firmwareVersion: null, batteryVoltage: null },
        validContext,
      );

      expect(emitter.emit).not.toHaveBeenCalledWith(
        BATTERY_LOW_EVENT,
        expect.anything(),
      );
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing status', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(
        service.run(
          {} as {
            status: number;
            voltage: number | null;
            firmwareVersion: string | null;
            batteryVoltage: number | null;
          },
          validContext,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid status value', async () => {
      const deviceRepo = createMockDeviceRepository();
      const eventRepo = createMockPowerEventRepository();

      const service = new ProcessPowerStatusService(deviceRepo, eventRepo);

      await expect(
        service.run(
          { status: 2, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        ),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.run(
          { status: -1, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        ),
      ).rejects.toThrow(ValidationError);
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
        service.run(
          { status: 0, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        ),
      ).resolves.toBeDefined();

      // Status 1 (ON)
      await expect(
        service.run(
          { status: 1, voltage: null, firmwareVersion: null, batteryVoltage: null },
          validContext,
        ),
      ).resolves.toBeDefined();
    });
  });
});
