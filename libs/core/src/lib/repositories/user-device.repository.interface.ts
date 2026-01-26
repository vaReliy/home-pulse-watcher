import type { UserDevice } from '../entities/user-device.entity.js';
import type { DeviceRole } from '../types/device-role.enum.js';

/**
 * Repository interface for UserDevice entity operations.
 */
export interface IUserDeviceRepository {
  /**
   * Find association by composite key.
   */
  findByUserAndDevice(
    userId: string,
    deviceId: string
  ): Promise<UserDevice | null>;

  /**
   * Find all associations for a user.
   */
  findByUserId(userId: string): Promise<UserDevice[]>;

  /**
   * Find all associations for a device.
   */
  findByDeviceId(deviceId: string): Promise<UserDevice[]>;

  /**
   * Create a new user-device association.
   */
  create(data: {
    userId: string;
    deviceId: string;
    customName?: string | null;
    role?: DeviceRole;
  }): Promise<UserDevice>;

  /**
   * Update association (role or custom name).
   */
  update(
    userId: string,
    deviceId: string,
    data: {
      customName?: string | null;
      role?: DeviceRole;
    }
  ): Promise<UserDevice>;

  /**
   * Delete association.
   */
  delete(userId: string, deviceId: string): Promise<void>;

  /**
   * Check if association exists.
   */
  exists(userId: string, deviceId: string): Promise<boolean>;

  /**
   * Count users associated with a device.
   */
  countByDeviceId(deviceId: string): Promise<number>;
}
