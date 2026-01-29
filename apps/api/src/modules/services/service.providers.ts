import type { Provider } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserRepository,
} from '@home-pulse-watcher/core';
import {
  RegisterDeviceService,
  GetDeviceService,
  ListDevicesService,
  CreateUserService,
} from '@home-pulse-watcher/application';
import { REPOSITORY_TOKENS } from '../repositories/repository.tokens';
import { SERVICE_TOKENS } from './service.tokens';

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
    useFactory: (deviceRepo: IDeviceRepository) =>
      new ListDevicesService(deviceRepo),
    inject: [REPOSITORY_TOKENS.DEVICE],
  },
  {
    provide: SERVICE_TOKENS.CREATE_USER,
    useFactory: (userRepo: IUserRepository) => new CreateUserService(userRepo),
    inject: [REPOSITORY_TOKENS.USER],
  },
];
