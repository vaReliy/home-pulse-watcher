import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface RequestOtaForceCheckInput {
  id?: string;
  macAddress?: string;
}

export interface RequestOtaForceCheckOutput {
  device: Device;
}

/**
 * Sets the sticky "force OTA check" flag on a device (admin CLI use case).
 * The flag is served, and cleared, on the device's next `/api/device/status` call.
 */
export class RequestOtaForceCheckService extends BaseService<
  RequestOtaForceCheckInput,
  RequestOtaForceCheckOutput
> {
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
    params: RequestOtaForceCheckInput,
    _context: ServiceContext,
  ): Promise<RequestOtaForceCheckOutput> {
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

    await this.deviceRepository.requestOtaForceCheck(device.id);

    return { device };
  }
}
