/**
 * Roles that define user permissions for a device.
 * OWNER: Full control (can delete, transfer ownership)
 * EDITOR: Can modify device settings and view events
 * VIEWER: Read-only access to device and events
 */
export enum DeviceRole {
  OWNER = 'OWNER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}
