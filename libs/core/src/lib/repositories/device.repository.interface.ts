import type { Device } from '../entities/device.entity.js';
import type { PowerStatus } from '../types/power-status.enum.js';
import type { DeviceType } from '../types/device-type.enum.js';

/**
 * Repository interface for Device entity operations.
 */
export interface IDeviceRepository {
  /**
   * Find device by internal ID.
   */
  findById(id: string): Promise<Device | null>;

  /**
   * Find device by MAC address.
   */
  findByMacAddress(macAddress: string): Promise<Device | null>;

  /**
   * Find multiple devices by internal ID in a single query.
   * Returns only found rows — order is NOT guaranteed to match `ids`.
   * Callers must build an id→entity Map, never zip by index.
   * Empty `ids` short-circuits to `[]` without querying.
   */
  findByIds(ids: string[]): Promise<Device[]>;

  /**
   * Create a new device.
   */
  create(data: {
    macAddress: string;
    encryptedSecret: string;
    label?: string | null;
    /** Hardware category, write-once at provisioning. Defaults to MAINS. */
    deviceType?: DeviceType;
  }): Promise<Device>;

  /**
   * Update device information.
   */
  update(
    id: string,
    data: {
      label?: string | null;
      encryptedSecret?: string;
    },
  ): Promise<Device>;

  /**
   * Update device status after receiving a heartbeat/event.
   */
  updateStatus(
    id: string,
    data: {
      lastStatus: PowerStatus;
      lastSeenAt: Date;
      statusChangedAt?: Date;
      firmwareVersion?: string;
      batteryVoltage?: number | null;
    },
  ): Promise<Device>;

  /**
   * Delete device by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Check if device exists by MAC address.
   */
  existsByMacAddress(macAddress: string): Promise<boolean>;

  /**
   * Find all devices for a user (through UserDevice).
   */
  findByUserId(userId: string): Promise<Device[]>;

  /**
   * Atomically check-and-clear the sticky "force OTA check" flag for a device.
   * Consumes (clears) the flag so it is served at most once per request.
   * @returns true if the flag was set (and has now been cleared), false otherwise.
   */
  consumeOtaForceCheckRequest(id: string): Promise<boolean>;

  /**
   * Set the sticky "force OTA check" flag for a device (e.g. from an admin
   * CLI command post-upload). Served (and cleared) on the device's next
   * `/api/device/status` call via {@link consumeOtaForceCheckRequest}.
   */
  requestOtaForceCheck(id: string): Promise<void>;
}
