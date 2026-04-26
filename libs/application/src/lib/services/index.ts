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

export {
  UnlinkDeviceFromUserService,
  type UnlinkDeviceFromUserInput,
  type UnlinkDeviceFromUserOutput,
} from './device/unlink-device-from-user.service.js';

export {
  UpdateDeviceService,
  type UpdateDeviceInput,
  type UpdateDeviceOutput,
} from './device/update-device.service.js';

export {
  DeleteDeviceService,
  type DeleteDeviceInput,
  type DeleteDeviceOutput,
} from './device/delete-device.service.js';

export {
  RotateDeviceSecretService,
  type RotateDeviceSecretInput,
  type RotateDeviceSecretOutput,
} from './device/rotate-device-secret.service.js';

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

// OTA services
export {
  CheckOtaUpdateService,
  type CheckOtaUpdateInput,
  type CheckOtaUpdateOutput,
} from './ota/index.js';

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
