/**
 * Roles that define user permissions for a device.
 * OWNER: Full control (can delete, transfer ownership)
 * EDITOR: Can modify device settings and view events
 * VIEWER: Read-only access to device and events
 */
export const DeviceRole = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const;

export type DeviceRole = (typeof DeviceRole)[keyof typeof DeviceRole];
