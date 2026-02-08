import type {
  IDeviceRepository,
  IUserRepository,
  Device,
} from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface ListDevicesInput {
  userId?: string;
  telegramId?: string;
}

export interface ListDevicesOutput {
  devices: Device[];
  total: number;
}

/** Lists devices for a user, identified by userId or telegramId. */
export class ListDevicesService extends BaseService<
  ListDevicesInput,
  ListDevicesOutput
> {
  constructor(
    private readonly deviceRepository: IDeviceRepository,
    private readonly userRepository: IUserRepository,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      userId: 'string',
      telegramId: ['string', 'telegramId'],
    };
  }

  protected async execute(
    params: ListDevicesInput,
    _context: ServiceContext,
  ): Promise<ListDevicesOutput> {
    if (!params.userId && !params.telegramId) {
      throw new ValidationError({
        user: 'Either userId or telegramId is required',
      });
    }

    const userId = await this.resolveUserId(params);
    const devices = await this.deviceRepository.findByUserId(userId);

    return {
      devices,
      total: devices.length,
    };
  }

  private async resolveUserId(params: ListDevicesInput): Promise<string> {
    if (params.userId) {
      return params.userId;
    }

    const user = await this.userRepository.findByTelegramId(
      BigInt(params.telegramId as string),
    );
    if (!user) {
      throw new NotFoundError('User', `telegramId=${params.telegramId}`);
    }
    return user.id;
  }
}
