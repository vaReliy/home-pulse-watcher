import * as crypto from 'node:crypto';
import type {
  IDeviceRepository,
  IUserDeviceRepository,
  Device,
} from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import {
  NotFoundError,
  ValidationError,
  encryptDeviceSecret,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';
import {
  assertCallerHasRole,
  type Caller,
} from './assert-caller-has-role.util.js';

export interface RotateDeviceSecretInput {
  id?: string;
  macAddress?: string;
  caller: Caller;
}

export interface RotateDeviceSecretOutput {
  device: Device;
  secret: string;
}

/** Generates a new HMAC secret for a device, replacing the existing one. */
export class RotateDeviceSecretService extends BaseService<
  RotateDeviceSecretInput,
  RotateDeviceSecretOutput
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
      caller: 'required',
    };
  }

  protected async execute(
    params: RotateDeviceSecretInput,
    context: ServiceContext,
  ): Promise<RotateDeviceSecretOutput> {
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
      DeviceRole.OWNER,
    );

    const secret = crypto.randomBytes(32).toString('hex');

    const encryptionKey = context.config?.deviceSecretEncryptionKey;
    if (!encryptionKey) {
      throw new Error(
        'deviceSecretEncryptionKey not provided in service context',
      );
    }

    const encryptedSecret = encryptDeviceSecret(secret, encryptionKey);

    const updated = await this.deviceRepository.update(device.id, {
      encryptedSecret,
    });

    return {
      device: updated,
      secret,
    };
  }
}
