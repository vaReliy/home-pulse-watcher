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
import {
  assertCallerHasRole,
  type Caller,
} from './assert-caller-has-role.util.js';

export interface LinkDeviceToUserInput {
  telegramId?: string;
  userId?: string;
  mac?: string;
  deviceId?: string;
  role?: string;
  caller: Caller;
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
      telegramId: ['string', 'telegramId'],
      userId: ['string'],
      mac: ['string'],
      deviceId: ['string'],
      role: { one_of: ['OWNER', 'EDITOR', 'VIEWER'] },
      caller: 'required',
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

    const existingMemberships = await this.userDeviceRepository.findByDeviceId(
      device.id,
    );
    const isFirstLink = existingMemberships.length === 0;
    let role: DeviceRole;

    if (isFirstLink) {
      // First link is self-registration: force VIEWER for non-system callers,
      // regardless of any requested role param. Defense-in-depth — the
      // caller-role check below is deliberately skipped on this path, so a
      // future untrusted caller (bot/REST) must not be able to self-grant
      // OWNER via a forwarded role param. The trusted CLI (`caller: {
      // system: true }`) bypasses this and honors an explicit `--role`,
      // matching its trusted-bypass treatment elsewhere in this file.
      role =
        'system' in params.caller
          ? ((params.role as DeviceRole) ?? DeviceRole.VIEWER)
          : DeviceRole.VIEWER;
    } else {
      role = (params.role as DeviceRole) ?? DeviceRole.VIEWER;

      const deviceIdentifier = params.mac
        ? `mac=${params.mac.toUpperCase()}`
        : (params.deviceId as string);

      await assertCallerHasRole(
        this.userDeviceRepository,
        params.caller,
        device.id,
        DeviceRole.OWNER,
        deviceIdentifier,
      );
    }

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
