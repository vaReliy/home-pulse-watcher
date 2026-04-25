import type {
  IDeviceRepository,
  IUserDeviceRepository,
  IPowerEventRepository,
  Device,
} from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface DeleteDeviceInput {
  id?: string;
  macAddress?: string;
}

export interface DeleteDeviceOutput {
  device: Device;
  deletedLinksCount: number;
  deletedEventsCount: number;
}

/** Deletes a device and all its associations (user links, power events). */
export class DeleteDeviceService extends BaseService<
  DeleteDeviceInput,
  DeleteDeviceOutput
> {
  constructor(
    private readonly deviceRepository: IDeviceRepository,
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly powerEventRepository: IPowerEventRepository,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      id: 'string',
      macAddress: 'macAddress',
    };
  }

  protected async execute(
    params: DeleteDeviceInput,
    _context: ServiceContext,
  ): Promise<DeleteDeviceOutput> {
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

    // Remove user-device links
    const userDevices = await this.userDeviceRepository.findByDeviceId(
      device.id,
    );
    for (const ud of userDevices) {
      await this.userDeviceRepository.delete(ud.userId, ud.deviceId);
    }

    // Remove power events
    const deletedEventsCount = await this.powerEventRepository.deleteByDeviceId(
      device.id,
    );

    // Delete device
    await this.deviceRepository.delete(device.id);

    return {
      device,
      deletedLinksCount: userDevices.length,
      deletedEventsCount,
    };
  }
}
