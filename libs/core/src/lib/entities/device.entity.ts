import { PowerStatus } from '../types/power-status.enum.js';

/**
 * Device domain entity.
 * Represents an ESP32-C3 power monitoring device.
 * Pure domain object with no external dependencies.
 */
export class Device {
  readonly id: string;
  readonly macAddress: string;
  readonly secretHash: string;
  readonly label: string | null;
  readonly lastStatus: PowerStatus | null;
  readonly lastSeenAt: Date | null;

  constructor(props: {
    id: string;
    macAddress: string;
    secretHash: string;
    label: string | null;
    lastStatus: PowerStatus | null;
    lastSeenAt: Date | null;
  }) {
    this.id = props.id;
    this.macAddress = props.macAddress;
    this.secretHash = props.secretHash;
    this.label = props.label;
    this.lastStatus = props.lastStatus;
    this.lastSeenAt = props.lastSeenAt;
  }

  /**
   * Returns true if device has reported status within the threshold.
   * @param thresholdMs - Maximum time since last seen in milliseconds (default: 5 minutes)
   */
  isOnline(thresholdMs = 300_000): boolean {
    if (!this.lastSeenAt) return false;
    return Date.now() - this.lastSeenAt.getTime() < thresholdMs;
  }
}
