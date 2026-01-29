import * as crypto from 'node:crypto';
import type { IDeviceRepository, Device } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface RegisterDeviceInput {
  macAddress: string;
  label?: string;
}

export interface RegisterDeviceOutput {
  device: Device;
  secret: string;
}

export class RegisterDeviceService extends BaseService<
  RegisterDeviceInput,
  RegisterDeviceOutput
> {
  constructor(private readonly deviceRepository: IDeviceRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      macAddress: ['required', 'macAddress'],
      label: { max_length: 100 },
    };
  }

  protected async execute(
    params: RegisterDeviceInput,
    context: ServiceContext
  ): Promise<RegisterDeviceOutput> {
    const normalizedMac = params.macAddress.toUpperCase();

    const existing =
      await this.deviceRepository.existsByMacAddress(normalizedMac);
    if (existing) {
      throw new DomainError(
        DomainErrorCode.DEVICE_ALREADY_REGISTERED,
        `Device with MAC ${normalizedMac} is already registered`
      );
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const appSalt = context.config?.appGlobalSalt;
    if (!appSalt) {
      throw new Error('appGlobalSalt not provided in service context');
    }

    const secretHash = crypto
      .createHmac('sha256', appSalt)
      .update(secret)
      .digest('hex');

    const device = await this.deviceRepository.create({
      macAddress: normalizedMac,
      secretHash,
      label: params.label ?? null,
    });

    return {
      device,
      secret,
    };
  }
}
