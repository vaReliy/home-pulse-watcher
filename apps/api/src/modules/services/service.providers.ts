import type { Provider } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserRepository,
  IPowerEventRepository,
} from '@home-pulse-watcher/core';
import {
  RegisterDeviceService,
  GetDeviceService,
  ListDevicesService,
  CreateUserService,
  ProcessPowerStatusService,
  GetPowerHistoryService,
  type IEventEmitter,
} from '@home-pulse-watcher/application';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
        eventEmitter as IEventEmitter,
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
];
