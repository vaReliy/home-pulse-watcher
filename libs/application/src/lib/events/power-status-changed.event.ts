import { PowerStatus } from '@home-pulse-watcher/core';

/**
 * Domain event emitted when a device's power status changes.
 * Used for decoupled notification handling in Phase 4.
 */
export class PowerStatusChangedEvent {
  readonly deviceId: string;
  readonly deviceLabel: string | null;
  readonly previousStatus: PowerStatus | null;
  readonly newStatus: PowerStatus;
  readonly timestamp: Date;
  readonly eventId: string;
  readonly durationSeconds: number | null;
  readonly voltage: number | null;
  /** Battery voltage in millivolts at time of event. Present only for UPS Edition devices. */
  readonly batteryVoltage: number | null;

  constructor(props: {
    deviceId: string;
    deviceLabel: string | null;
    previousStatus: PowerStatus | null;
    newStatus: PowerStatus;
    timestamp: Date;
    eventId: string;
    durationSeconds: number | null;
    voltage: number | null;
    batteryVoltage: number | null;
  }) {
    this.deviceId = props.deviceId;
    this.deviceLabel = props.deviceLabel;
    this.previousStatus = props.previousStatus;
    this.newStatus = props.newStatus;
    this.timestamp = props.timestamp;
    this.eventId = props.eventId;
    this.durationSeconds = props.durationSeconds;
    this.voltage = props.voltage;
    this.batteryVoltage = props.batteryVoltage;
  }

  /**
   * Returns true if power was restored (OFF -> ON).
   */
  get isPowerRestored(): boolean {
    return (
      this.previousStatus === PowerStatus.OFF &&
      this.newStatus === PowerStatus.ON
    );
  }

  /**
   * Returns true if power was lost (ON -> OFF).
   */
  get isPowerLost(): boolean {
    return (
      this.previousStatus === PowerStatus.ON &&
      this.newStatus === PowerStatus.OFF
    );
  }
}

/**
 * Event name constant for event emitter registration.
 */
export const POWER_STATUS_CHANGED_EVENT = 'power.status.changed';
