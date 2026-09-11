import type {
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
} from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';
import {
  assertCallerHasRole,
  type Caller,
} from './assert-caller-has-role.util.js';

export interface UpdateDeviceInput {
  id?: string;
  macAddress?: string;
  label: string;
  caller: Caller;
}

export interface UpdateDeviceOutput {
  device: Device;
}

/** Updates device information (label). Requires at least EDITOR role unless caller is `{ system: true }`. */
export class UpdateDeviceService extends BaseService<
  UpdateDeviceInput,
  UpdateDeviceOutput
> {
  constructor(
    private readonly deviceRepository: IDeviceRepository,
    private readonly userDeviceRepository: IUserDeviceRepository,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      id: 'string',
      macAddress: 'macAddress',
      label: ['required', { max_length: 100 }],
      caller: 'required',
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

    await assertCallerHasRole(
      this.userDeviceRepository,
      params.caller,
      device.id,
      DeviceRole.EDITOR,
    );

    const updated = await this.deviceRepository.update(device.id, {
      label: params.label,
    });

    return { device: updated };
  }
}
