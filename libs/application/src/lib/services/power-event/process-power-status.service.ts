import type {
  IDeviceRepository,
  IPowerEventRepository,
  Device,
  PowerEvent,
} from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import {
  NotFoundError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';
import {
  PowerStatusChangedEvent,
  POWER_STATUS_CHANGED_EVENT,
} from '../../events/power-status-changed.event.js';
import {
  BatteryLowEvent,
  BATTERY_LOW_EVENT,
  BATTERY_LOW_THRESHOLD_MV,
} from '../../events/battery-low.event.js';

/** Minimum seconds between status-change notifications for the same device. */
const MIN_DEBOUNCE_SECONDS = 5;

export interface ProcessPowerStatusInput {
  status: number;
  voltage: number | null;
  firmwareVersion: string | null;
  batteryVoltage: number | null;
}

export interface ProcessPowerStatusOutput {
  event: PowerEvent;
  device: Device;
  isStatusChange: boolean;
  previousStatus: PowerStatus | null;
  debounced: boolean;
}

/**
 * Interface for event emitter to decouple from specific implementation.
 */
export interface IEventEmitter {
  emit(event: string, payload: unknown): boolean | Promise<boolean[]>;
}

/**
 * Processes power status updates from ESP32 devices.
 *
 * Responsibilities:
 * 1. Create PowerEvent records (with optional voltage)
 * 2. Calculate duration since last event
 * 3. Update device's lastStatus and lastSeenAt
 * 4. Server-side debounce: suppress notifications within MIN_DEBOUNCE_SECONDS
 * 5. Emit domain event for notification system
 */
export class ProcessPowerStatusService extends BaseService<
  ProcessPowerStatusInput,
  ProcessPowerStatusOutput
> {
  constructor(
    private readonly deviceRepository: IDeviceRepository,
    private readonly powerEventRepository: IPowerEventRepository,
    private readonly eventEmitter?: IEventEmitter,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      status: ['required', 'powerStatus'],
      voltage: ['integer', { minNumber: 0 }, { maxNumber: 4095 }],
      firmwareVersion: [{ maxLength: 20 }],
      batteryVoltage: ['integer', { minNumber: 0 }, { maxNumber: 5000 }],
    };
  }

  protected async execute(
    params: ProcessPowerStatusInput,
    context: ServiceContext,
  ): Promise<ProcessPowerStatusOutput> {
    const { deviceId } = context;

    if (!deviceId) {
      throw new Error('deviceId not provided in service context');
    }

    // 1. Fetch device (should exist since guard verified it)
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      throw new NotFoundError('Device', deviceId);
    }

    const newStatus = params.status as PowerStatus;
    const previousStatus = device.lastStatus;
    const isStatusChange = previousStatus !== newStatus;
    const timestamp = new Date();

    // 2. Calculate duration and update previous event if exists
    let previousDurationSeconds: number | null = null;
    let lastEvent: PowerEvent | null = null;
    if (previousStatus !== null) {
      lastEvent =
        await this.powerEventRepository.findLatestByDeviceId(deviceId);
      if (lastEvent) {
        // Duration in seconds (how long the previous state lasted)
        previousDurationSeconds = Math.floor(
          (timestamp.getTime() - lastEvent.timestamp.getTime()) / 1000,
        );
        await this.powerEventRepository.update(lastEvent.id, {
          duration: previousDurationSeconds,
        });
      }
    }

    // Notification duration: use statusChangedAt (start of current status) for accuracy.
    // During an outage, heartbeats update lastEvent but not statusChangedAt, so this
    // correctly reflects the full outage duration rather than time since last heartbeat.
    let notificationDurationSeconds: number | null = null;
    if (isStatusChange && device.statusChangedAt) {
      notificationDurationSeconds = Math.floor(
        (timestamp.getTime() - device.statusChangedAt.getTime()) / 1000,
      );
    } else if (isStatusChange && previousDurationSeconds !== null) {
      notificationDurationSeconds = previousDurationSeconds; // fallback
    }

    // 3. Create new power event (always recorded, even if debounced)
    const event = await this.powerEventRepository.create({
      deviceId,
      status: newStatus,
      timestamp,
      duration: null, // Duration will be set by the NEXT event
      voltage: params.voltage,
      batteryVoltage: params.batteryVoltage,
    });

    // 4. Update device status (and firmware version / battery voltage if reported)
    const updatedDevice = await this.deviceRepository.updateStatus(deviceId, {
      lastStatus: newStatus,
      lastSeenAt: timestamp,
      ...(isStatusChange && { statusChangedAt: timestamp }),
      firmwareVersion: params.firmwareVersion ?? undefined,
      batteryVoltage: params.batteryVoltage,
    });

    // 5. Server-side debounce: suppress notification if status changed too quickly
    let debounced = false;
    if (isStatusChange && lastEvent) {
      const secondsSinceLastEvent = Math.floor(
        (timestamp.getTime() - lastEvent.timestamp.getTime()) / 1000,
      );
      if (secondsSinceLastEvent < MIN_DEBOUNCE_SECONDS) {
        debounced = true;
      }
    }

    // 6. Emit domain event for notification system
    // Awaited so notification completes before HTTP response (prevents Cloud Run CPU throttling race)
    if (this.eventEmitter && isStatusChange && !debounced) {
      await this.eventEmitter.emit(
        POWER_STATUS_CHANGED_EVENT,
        new PowerStatusChangedEvent({
          deviceId,
          deviceLabel: device.label,
          previousStatus,
          newStatus,
          timestamp,
          eventId: event.id,
          durationSeconds: notificationDurationSeconds,
          voltage: params.voltage,
          batteryVoltage: params.batteryVoltage,
        }),
      );
    }

    // 7. Emit battery low SOS event if battery voltage is below threshold
    if (
      this.eventEmitter &&
      params.batteryVoltage !== null &&
      params.batteryVoltage > 0 &&
      params.batteryVoltage < BATTERY_LOW_THRESHOLD_MV
    ) {
      await this.eventEmitter.emit(
        BATTERY_LOW_EVENT,
        new BatteryLowEvent({
          deviceId,
          deviceLabel: device.label,
          batteryVoltage: params.batteryVoltage,
          timestamp,
        }),
      );
    }

    return {
      event,
      device: updatedDevice,
      isStatusChange,
      previousStatus,
      debounced,
    };
  }
}
