// Device services
export {
  RegisterDeviceService,
  type RegisterDeviceInput,
  type RegisterDeviceOutput,
} from './device/register-device.service.js';

export {
  GetDeviceService,
  type GetDeviceInput,
} from './device/get-device.service.js';

export {
  ListDevicesService,
  type ListDevicesInput,
  type ListDevicesOutput,
} from './device/list-devices.service.js';

export {
  LinkDeviceToUserService,
  type LinkDeviceToUserInput,
  type LinkDeviceToUserOutput,
} from './device/link-device-to-user.service.js';

// User services
export {
  CreateUserService,
  type CreateUserInput,
} from './user/create-user.service.js';

export {
  ListUsersService,
  type ListUsersInput,
  type ListUsersOutput,
} from './user/list-users.service.js';

// Power event services
export {
  ProcessPowerStatusService,
  type ProcessPowerStatusInput,
  type ProcessPowerStatusOutput,
  type IEventEmitter,
} from './power-event/process-power-status.service.js';

export {
  GetPowerHistoryService,
  type GetPowerHistoryInput,
  type GetPowerHistoryOutput,
} from './power-event/get-power-history.service.js';
