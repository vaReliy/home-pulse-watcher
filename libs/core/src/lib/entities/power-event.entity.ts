import { PowerStatus } from '../types/power-status.enum.js';

/**
 * PowerEvent domain entity.
 * Represents a power status change event from a device.
 */
export class PowerEvent {
  readonly id: string;
  readonly deviceId: string;
  readonly status: PowerStatus;
  readonly timestamp: Date;
  readonly duration: number | null;
  readonly voltage: number | null;
  /** Battery voltage in millivolts at time of event. Present only for UPS Edition devices. */
  readonly batteryVoltage: number | null;

  constructor(props: {
    id: string;
    deviceId: string;
    status: PowerStatus;
    timestamp: Date;
    duration: number | null;
    voltage: number | null;
    batteryVoltage: number | null;
  }) {
    this.id = props.id;
    this.deviceId = props.deviceId;
    this.status = props.status;
    this.timestamp = props.timestamp;
    this.duration = props.duration;
    this.voltage = props.voltage;
    this.batteryVoltage = props.batteryVoltage;
  }

  /**
   * Returns human-readable duration string.
   * @returns Formatted duration like "2h 30m 15s" or null if duration is not set
   */
  formatDuration(): string | null {
    if (this.duration === null) return null;

    const hours = Math.floor(this.duration / 3600);
    const minutes = Math.floor((this.duration % 3600) / 60);
    const seconds = this.duration % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }
}
