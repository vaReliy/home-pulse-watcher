export const REPOSITORY_TOKENS = {
  USER: Symbol('IUserRepository'),
  DEVICE: Symbol('IDeviceRepository'),
  USER_DEVICE: Symbol('IUserDeviceRepository'),
  POWER_EVENT: Symbol('IPowerEventRepository'),
  FIRMWARE_RELEASE: Symbol('IFirmwareReleaseRepository'),
} as const;
