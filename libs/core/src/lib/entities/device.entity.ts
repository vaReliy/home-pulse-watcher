import { PowerStatus } from '../types/power-status.enum.js';
import { ReleaseChannel } from '../types/release-channel.enum.js';

/**
 * Device domain entity.
 * Represents an ESP32-C3/ESP32-C6 power monitoring device.
 * Pure domain object with no external dependencies.
 */
export class Device {
  readonly id: string;
  readonly macAddress: string;
  readonly encryptedSecret: string;
  readonly label: string | null;
  readonly lastStatus: PowerStatus | null;
  readonly lastSeenAt: Date | null;
  readonly statusChangedAt: Date | null;
  readonly firmwareVersion: string | null;
  /** Latest battery voltage in millivolts. Present only for UPS Edition devices. */
  readonly batteryVoltage: number | null;
  /** OTA release channel this device is enrolled in. Defaults to STABLE. */
  readonly releaseChannel: ReleaseChannel;

  constructor(props: {
    id: string;
    macAddress: string;
    encryptedSecret: string;
    label: string | null;
    lastStatus: PowerStatus | null;
    lastSeenAt: Date | null;
    statusChangedAt: Date | null;
    firmwareVersion: string | null;
    batteryVoltage: number | null;
    releaseChannel: ReleaseChannel;
  }) {
    this.id = props.id;
    this.macAddress = props.macAddress;
    this.encryptedSecret = props.encryptedSecret;
    this.label = props.label;
    this.lastStatus = props.lastStatus;
    this.lastSeenAt = props.lastSeenAt;
    this.statusChangedAt = props.statusChangedAt;
    this.firmwareVersion = props.firmwareVersion;
    this.batteryVoltage = props.batteryVoltage;
    this.releaseChannel = props.releaseChannel;
  }

  /** Returns true if this device has a UPS battery module (batteryVoltage is not null). */
  get hasUps(): boolean {
    return this.batteryVoltage !== null;
  }

  /**
   * Returns true if device has reported status within the threshold.
   * @param thresholdMs - Maximum time since last seen in milliseconds (default: 35 minutes = 30 min heartbeat + 5 min grace)
   */
  isOnline(thresholdMs = 2_100_000): boolean {
    if (!this.lastSeenAt) return false;
    return Date.now() - this.lastSeenAt.getTime() < thresholdMs;
  }
}
