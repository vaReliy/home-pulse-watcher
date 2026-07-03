export const DeviceType = {
  UPS: 'UPS',
  MAINS: 'MAINS',
} as const;

export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

/**
 * Type guard: returns true when value is a valid DeviceType member.
 * Use this to validate DB-sourced strings before casting.
 */
export function isDeviceType(value: unknown): value is DeviceType {
  return (Object.values(DeviceType) as unknown[]).includes(value);
}
