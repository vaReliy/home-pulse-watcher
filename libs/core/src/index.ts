// Types/Enums
export { BoardType } from './lib/types/board-type.enum.js';
export { DeviceRole } from './lib/types/device-role.enum.js';
export { PowerStatus } from './lib/types/power-status.enum.js';
export {
  channelsVisibleTo,
  isReleaseChannel,
  ReleaseChannel,
} from './lib/types/release-channel.enum.js';
export { DeviceType, isDeviceType } from './lib/types/device-type.enum.js';

// Entities
export { Device } from './lib/entities/device.entity.js';
export { FirmwareRelease } from './lib/entities/firmware-release.entity.js';
export { PowerEvent } from './lib/entities/power-event.entity.js';
export { UserDevice } from './lib/entities/user-device.entity.js';
export { User } from './lib/entities/user.entity.js';

// Service Interfaces
export { SIGNED_URL_TTL_MS } from './lib/services/index.js';
export type { IFirmwareStorageService } from './lib/services/index.js';

// Repository Interfaces
export type { IDeviceRepository } from './lib/repositories/device.repository.interface.js';
export type {
  CreateFirmwareReleaseInput,
  IFirmwareReleaseRepository,
} from './lib/repositories/firmware-release.repository.interface.js';
export type {
  IPowerEventRepository,
  PowerEventQueryOptions,
} from './lib/repositories/power-event.repository.interface.js';
export type { IUserDeviceRepository } from './lib/repositories/user-device.repository.interface.js';
export type { IUserRepository } from './lib/repositories/user.repository.interface.js';
