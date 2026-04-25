import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface GetDeviceInput {
  id?: string;
  macAddress?: string;
}

export class GetDeviceService extends BaseService<GetDeviceInput, Device> {
  constructor(private readonly deviceRepository: IDeviceRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      id: 'string',
      macAddress: 'macAddress',
    };
  }

  protected async execute(
    params: GetDeviceInput,
    _context: ServiceContext,
  ): Promise<Device> {
    if (!params.id && !params.macAddress) {
      throw new ValidationError({
        id: 'Either id or macAddress is required',
      });
    }

    let device: Device | null = null;

    if (params.id) {
      device = await this.deviceRepository.findById(params.id);
    } else if (params.macAddress) {
      device = await this.deviceRepository.findByMacAddress(
        params.macAddress.toUpperCase(),
      );
    }

    if (!device) {
      const identifier = params.id ?? params.macAddress ?? 'unknown';
      throw new NotFoundError('Device', identifier);
    }

    return device;
  }
}
