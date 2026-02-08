import type {
  Device,
  IDeviceRepository,
  IUserDeviceRepository,
  IUserRepository,
  User,
} from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface UnlinkDeviceFromUserInput {
  telegramId?: string;
  userId?: string;
  mac?: string;
  deviceId?: string;
}

export interface UnlinkDeviceFromUserOutput {
  user: User;
  device: Device;
}

/** Removes the association between a device and a user. */
export class UnlinkDeviceFromUserService extends BaseService<
  UnlinkDeviceFromUserInput,
  UnlinkDeviceFromUserOutput
> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly deviceRepository: IDeviceRepository,
    private readonly userDeviceRepository: IUserDeviceRepository,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      telegramId: ['string', 'telegramId'],
      userId: ['string'],
      mac: ['string'],
      deviceId: ['string'],
    };
  }

  protected async execute(
    params: UnlinkDeviceFromUserInput,
    _context: ServiceContext,
  ): Promise<UnlinkDeviceFromUserOutput> {
    if (!params.telegramId && !params.userId) {
      throw new ValidationError({
        user: 'Either telegramId or userId is required',
      });
    }

    if (!params.mac && !params.deviceId) {
      throw new ValidationError({
        device: 'Either mac or deviceId is required',
      });
    }

    const user = await this.resolveUser(params);
    const device = await this.resolveDevice(params);

    const linked = await this.userDeviceRepository.exists(user.id, device.id);
    if (!linked) {
      throw new DomainError(
        DomainErrorCode.DEVICE_NOT_LINKED,
        `Device ${device.macAddress} is not linked to user ${user.id}`,
      );
    }

    await this.userDeviceRepository.delete(user.id, device.id);

    return { user, device };
  }

  private async resolveUser(params: UnlinkDeviceFromUserInput): Promise<User> {
    if (params.telegramId) {
      const user = await this.userRepository.findByTelegramId(
        BigInt(params.telegramId),
      );
      if (!user) {
        throw new NotFoundError('User', `telegramId=${params.telegramId}`);
      }
      return user;
    }

    const userId = params.userId as string;
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  private async resolveDevice(
    params: UnlinkDeviceFromUserInput,
  ): Promise<Device> {
    if (params.mac) {
      const normalizedMac = params.mac.toUpperCase();
      const device =
        await this.deviceRepository.findByMacAddress(normalizedMac);
      if (!device) {
        throw new NotFoundError('Device', `mac=${normalizedMac}`);
      }
      return device;
    }

    const deviceId = params.deviceId as string;
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      throw new NotFoundError('Device', deviceId);
    }
    return device;
  }
}
