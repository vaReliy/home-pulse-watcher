export const REPOSITORY_TOKENS = {
  USER: Symbol('IUserRepository'),
  DEVICE: Symbol('IDeviceRepository'),
  USER_DEVICE: Symbol('IUserDeviceRepository'),
  POWER_EVENT: Symbol('IPowerEventRepository'),
} as const;
