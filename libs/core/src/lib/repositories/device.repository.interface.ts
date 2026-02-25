import type { Device } from '../entities/device.entity.js';
import type { PowerStatus } from '../types/power-status.enum.js';

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
   * Create a new device.
   */
  create(data: {
    macAddress: string;
    encryptedSecret: string;
    label?: string | null;
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
      firmwareVersion?: string;
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
}
