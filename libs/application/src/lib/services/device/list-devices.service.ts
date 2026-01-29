import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface ListDevicesInput {
  userId?: string;
}

export interface ListDevicesOutput {
  devices: Device[];
  total: number;
}

export class ListDevicesService extends BaseService<
  ListDevicesInput,
  ListDevicesOutput
> {
  constructor(private readonly deviceRepository: IDeviceRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      userId: 'string',
    };
  }

  protected async execute(
    params: ListDevicesInput,
    _context: ServiceContext
  ): Promise<ListDevicesOutput> {
    if (!params.userId) {
      throw new ValidationError({
        userId: 'userId is required for listing devices',
      });
    }

    const devices = await this.deviceRepository.findByUserId(params.userId);

    return {
      devices,
      total: devices.length,
    };
  }
}
