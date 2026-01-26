import { DeviceRole } from '../types/device-role.enum.js';

/**
 * UserDevice domain entity.
 * Represents the many-to-many relationship between Users and Devices.
 * Contains role and optional custom naming.
 */
export class UserDevice {
  readonly userId: string;
  readonly deviceId: string;
  readonly customName: string | null;
  readonly role: DeviceRole;

  constructor(props: {
    userId: string;
    deviceId: string;
    customName: string | null;
    role: DeviceRole;
  }) {
    this.userId = props.userId;
    this.deviceId = props.deviceId;
    this.customName = props.customName;
    this.role = props.role;
  }

  /**
   * Checks if this association grants at least the specified role level.
   * Role hierarchy: VIEWER < EDITOR < OWNER
   */
  hasAtLeastRole(requiredRole: DeviceRole): boolean {
    const roleHierarchy: Record<DeviceRole, number> = {
      [DeviceRole.VIEWER]: 0,
      [DeviceRole.EDITOR]: 1,
      [DeviceRole.OWNER]: 2,
    };
    return roleHierarchy[this.role] >= roleHierarchy[requiredRole];
  }
}
