import type {
  Device,
  IDeviceRepository,
  IUserDeviceRepository,
  IUserRepository,
  User,
  UserDevice,
} from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface LinkDeviceToUserInput {
  telegramId?: string;
  userId?: string;
  mac?: string;
  deviceId?: string;
  role?: string;
}

export interface LinkDeviceToUserOutput {
  userDevice: UserDevice;
  user: User;
  device: Device;
}

/** Links an existing device to an existing user account. */
export class LinkDeviceToUserService extends BaseService<
  LinkDeviceToUserInput,
  LinkDeviceToUserOutput
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
      telegramId: ['string'],
      userId: ['string'],
      mac: ['string'],
      deviceId: ['string'],
      role: { one_of: ['OWNER', 'EDITOR', 'VIEWER'] },
    };
  }

  protected async execute(
    params: LinkDeviceToUserInput,
    _context: ServiceContext,
  ): Promise<LinkDeviceToUserOutput> {
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

    const alreadyLinked = await this.userDeviceRepository.exists(
      user.id,
      device.id,
    );
    if (alreadyLinked) {
      throw new DomainError(
        DomainErrorCode.DEVICE_ALREADY_LINKED,
        `Device ${device.macAddress} is already linked to user ${user.id}`,
      );
    }

    const role = (params.role as DeviceRole) ?? DeviceRole.VIEWER;

    const userDevice = await this.userDeviceRepository.create({
      userId: user.id,
      deviceId: device.id,
      role,
    });

    return { userDevice, user, device };
  }

  private async resolveUser(params: LinkDeviceToUserInput): Promise<User> {
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

  private async resolveDevice(params: LinkDeviceToUserInput): Promise<Device> {
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
