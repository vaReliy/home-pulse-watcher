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

export interface ProcessPowerStatusInput {
  status: number;
}

export interface ProcessPowerStatusOutput {
  event: PowerEvent;
  device: Device;
  isStatusChange: boolean;
  previousStatus: PowerStatus | null;
}

/**
 * Interface for event emitter to decouple from specific implementation.
 */
export interface IEventEmitter {
  emit(event: string, payload: unknown): boolean;
}

/**
 * Processes power status updates from ESP32 devices.
 *
 * Responsibilities:
 * 1. Create PowerEvent records
 * 2. Calculate duration since last event
 * 3. Update device's lastStatus and lastSeenAt
 * 4. Emit domain event for notification system
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
    if (previousStatus !== null) {
      const lastEvent =
        await this.powerEventRepository.findLatestByDeviceId(deviceId);
      if (lastEvent) {
        // Duration in seconds (how long the previous state lasted)
        const duration = Math.floor(
          (timestamp.getTime() - lastEvent.timestamp.getTime()) / 1000,
        );
        await this.powerEventRepository.update(lastEvent.id, { duration });
      }
    }

    // 3. Create new power event
    const event = await this.powerEventRepository.create({
      deviceId,
      status: newStatus,
      timestamp,
      duration: null, // Duration will be set by the NEXT event
    });

    // 4. Update device status
    const updatedDevice = await this.deviceRepository.updateStatus(deviceId, {
      lastStatus: newStatus,
      lastSeenAt: timestamp,
    });

    // 5. Emit domain event for notification system (Phase 4)
    if (this.eventEmitter && isStatusChange) {
      this.eventEmitter.emit(
        POWER_STATUS_CHANGED_EVENT,
        new PowerStatusChangedEvent({
          deviceId,
          deviceLabel: device.label,
          previousStatus,
          newStatus,
          timestamp,
          eventId: event.id,
        }),
      );
    }

    return {
      event,
      device: updatedDevice,
      isStatusChange,
      previousStatus,
    };
  }
}
