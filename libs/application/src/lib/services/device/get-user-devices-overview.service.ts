import type {
  Device,
  DeviceRole,
  IDeviceRepository,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import {
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface UserDeviceOverview {
  device: Device;
  customName: string | null;
  role: DeviceRole;
}

export interface GetUserDevicesOverviewInput {
  userId: string;
}

export interface GetUserDevicesOverviewOutput {
  devices: UserDeviceOverview[];
  total: number;
}

/**
 * Retrieves all devices linked to a user, with role/customName and
 * denormalized device status, in exactly 2 queries regardless of device
 * count (no per-device N+1 lookups).
 */
export class GetUserDevicesOverviewService extends BaseService<
  GetUserDevicesOverviewInput,
  GetUserDevicesOverviewOutput
> {
  constructor(
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly deviceRepository: IDeviceRepository,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      userId: ['required', 'string'],
    };
  }

  protected async execute(
    params: GetUserDevicesOverviewInput,
    _context: ServiceContext,
  ): Promise<GetUserDevicesOverviewOutput> {
    const userDevices = await this.userDeviceRepository.findByUserId(
      params.userId,
    );

    const deviceIds = userDevices.map((userDevice) => userDevice.deviceId);
    const devices = await this.deviceRepository.findByIds(deviceIds);
    const deviceById = new Map(devices.map((device) => [device.id, device]));

    const overview: UserDeviceOverview[] = [];
    for (const userDevice of userDevices) {
      const device = deviceById.get(userDevice.deviceId);
      if (!device) continue;
      overview.push({
        device,
        customName: userDevice.customName,
        role: userDevice.role,
      });
    }

    return { devices: overview, total: overview.length };
  }
}
