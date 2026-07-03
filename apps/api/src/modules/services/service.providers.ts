import type { Provider } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserRepository,
  IUserDeviceRepository,
  IPowerEventRepository,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
} from '@home-pulse-watcher/core';
import {
  RegisterDeviceService,
  GetDeviceService,
  ListDevicesService,
  CreateUserService,
  ListUsersService,
  ProcessPowerStatusService,
  GetPowerHistoryService,
  LinkDeviceToUserService,
  UnlinkDeviceFromUserService,
  UpdateDeviceService,
  DeleteDeviceService,
  RotateDeviceSecretService,
  RequestOtaForceCheckService,
  CheckOtaUpdateService,
  UploadFirmwareService,
  ListFirmwareReleasesService,
} from '@home-pulse-watcher/application';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REPOSITORY_TOKENS } from '../repositories/repository.tokens.js';
import { STORAGE_TOKENS } from '../storage/storage.tokens.js';
import { SERVICE_TOKENS } from './service.tokens.js';
import { AsyncEventEmitterAdapter } from './async-event-emitter.adapter.js';

export const serviceProviders: Provider[] = [
  {
    provide: SERVICE_TOKENS.REGISTER_DEVICE,
    useFactory: (deviceRepo: IDeviceRepository) =>
      new RegisterDeviceService(deviceRepo),
    inject: [REPOSITORY_TOKENS.DEVICE],
  },
  {
    provide: SERVICE_TOKENS.GET_DEVICE,
    useFactory: (deviceRepo: IDeviceRepository) =>
      new GetDeviceService(deviceRepo),
    inject: [REPOSITORY_TOKENS.DEVICE],
  },
  {
    provide: SERVICE_TOKENS.LIST_DEVICES,
    useFactory: (deviceRepo: IDeviceRepository, userRepo: IUserRepository) =>
      new ListDevicesService(deviceRepo, userRepo),
    inject: [REPOSITORY_TOKENS.DEVICE, REPOSITORY_TOKENS.USER],
  },
  {
    provide: SERVICE_TOKENS.CREATE_USER,
    useFactory: (userRepo: IUserRepository) => new CreateUserService(userRepo),
    inject: [REPOSITORY_TOKENS.USER],
  },
  {
    provide: SERVICE_TOKENS.PROCESS_POWER_STATUS,
    useFactory: (
      deviceRepo: IDeviceRepository,
      powerEventRepo: IPowerEventRepository,
      eventEmitter: EventEmitter2,
    ) =>
      new ProcessPowerStatusService(
        deviceRepo,
        powerEventRepo,
        new AsyncEventEmitterAdapter(eventEmitter),
      ),
    inject: [
      REPOSITORY_TOKENS.DEVICE,
      REPOSITORY_TOKENS.POWER_EVENT,
      EventEmitter2,
    ],
  },
  {
    provide: SERVICE_TOKENS.GET_POWER_HISTORY,
    useFactory: (powerEventRepo: IPowerEventRepository) =>
      new GetPowerHistoryService(powerEventRepo),
    inject: [REPOSITORY_TOKENS.POWER_EVENT],
  },
  {
    provide: SERVICE_TOKENS.LINK_DEVICE_TO_USER,
    useFactory: (
      userRepo: IUserRepository,
      deviceRepo: IDeviceRepository,
      userDeviceRepo: IUserDeviceRepository,
    ) => new LinkDeviceToUserService(userRepo, deviceRepo, userDeviceRepo),
    inject: [
      REPOSITORY_TOKENS.USER,
      REPOSITORY_TOKENS.DEVICE,
      REPOSITORY_TOKENS.USER_DEVICE,
    ],
  },
  {
    provide: SERVICE_TOKENS.UNLINK_DEVICE_FROM_USER,
    useFactory: (
      userRepo: IUserRepository,
      deviceRepo: IDeviceRepository,
      userDeviceRepo: IUserDeviceRepository,
    ) => new UnlinkDeviceFromUserService(userRepo, deviceRepo, userDeviceRepo),
    inject: [
      REPOSITORY_TOKENS.USER,
      REPOSITORY_TOKENS.DEVICE,
      REPOSITORY_TOKENS.USER_DEVICE,
    ],
  },
  {
    provide: SERVICE_TOKENS.UPDATE_DEVICE,
    useFactory: (deviceRepo: IDeviceRepository) =>
      new UpdateDeviceService(deviceRepo),
    inject: [REPOSITORY_TOKENS.DEVICE],
  },
  {
    provide: SERVICE_TOKENS.DELETE_DEVICE,
    useFactory: (
      deviceRepo: IDeviceRepository,
      userDeviceRepo: IUserDeviceRepository,
      powerEventRepo: IPowerEventRepository,
    ) => new DeleteDeviceService(deviceRepo, userDeviceRepo, powerEventRepo),
    inject: [
      REPOSITORY_TOKENS.DEVICE,
      REPOSITORY_TOKENS.USER_DEVICE,
      REPOSITORY_TOKENS.POWER_EVENT,
    ],
  },
  {
    provide: SERVICE_TOKENS.ROTATE_DEVICE_SECRET,
    useFactory: (deviceRepo: IDeviceRepository) =>
      new RotateDeviceSecretService(deviceRepo),
    inject: [REPOSITORY_TOKENS.DEVICE],
  },
  {
    provide: SERVICE_TOKENS.REQUEST_OTA_FORCE_CHECK,
    useFactory: (deviceRepo: IDeviceRepository) =>
      new RequestOtaForceCheckService(deviceRepo),
    inject: [REPOSITORY_TOKENS.DEVICE],
  },
  {
    provide: SERVICE_TOKENS.LIST_USERS,
    useFactory: (userRepo: IUserRepository) => new ListUsersService(userRepo),
    inject: [REPOSITORY_TOKENS.USER],
  },
  {
    provide: SERVICE_TOKENS.CHECK_OTA_UPDATE,
    useFactory: (
      deviceRepo: IDeviceRepository,
      firmwareRepo: IFirmwareReleaseRepository,
      storage: IFirmwareStorageService,
    ) => {
      const encryptionKey = process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
      if (!encryptionKey) {
        throw new Error('DEVICE_SECRET_ENCRYPTION_KEY not configured');
      }
      return new CheckOtaUpdateService(
        deviceRepo,
        firmwareRepo,
        storage,
        encryptionKey,
      );
    },
    inject: [
      REPOSITORY_TOKENS.DEVICE,
      REPOSITORY_TOKENS.FIRMWARE_RELEASE,
      STORAGE_TOKENS.FIRMWARE_STORAGE,
    ],
  },
  {
    provide: SERVICE_TOKENS.UPLOAD_FIRMWARE,
    useFactory: (
      storage: IFirmwareStorageService,
      firmwareRepo: IFirmwareReleaseRepository,
    ) => new UploadFirmwareService(storage, firmwareRepo),
    inject: [
      STORAGE_TOKENS.FIRMWARE_STORAGE,
      REPOSITORY_TOKENS.FIRMWARE_RELEASE,
    ],
  },
  {
    provide: SERVICE_TOKENS.LIST_FIRMWARE_RELEASES,
    useFactory: (firmwareRepo: IFirmwareReleaseRepository) =>
      new ListFirmwareReleasesService(firmwareRepo),
    inject: [REPOSITORY_TOKENS.FIRMWARE_RELEASE],
  },
];
