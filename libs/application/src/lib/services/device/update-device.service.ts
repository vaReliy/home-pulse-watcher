import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface UpdateDeviceInput {
  id?: string;
  macAddress?: string;
  label: string;
}

export interface UpdateDeviceOutput {
  device: Device;
}

/** Updates device information (label). */
export class UpdateDeviceService extends BaseService<
  UpdateDeviceInput,
  UpdateDeviceOutput
> {
  constructor(private readonly deviceRepository: IDeviceRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      id: 'string',
      macAddress: 'macAddress',
      label: ['required', { max_length: 100 }],
    };
  }

  protected async execute(
    params: UpdateDeviceInput,
    _context: ServiceContext,
  ): Promise<UpdateDeviceOutput> {
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

    const updated = await this.deviceRepository.update(device.id, {
      label: params.label,
    });

    return { device: updated };
  }
}
