export const SERVICE_TOKENS = {
  REGISTER_DEVICE: Symbol('RegisterDeviceService'),
  GET_DEVICE: Symbol('GetDeviceService'),
  LIST_DEVICES: Symbol('ListDevicesService'),
  CREATE_USER: Symbol('CreateUserService'),
  PROCESS_POWER_STATUS: Symbol('ProcessPowerStatusService'),
  GET_POWER_HISTORY: Symbol('GetPowerHistoryService'),
} as const;
