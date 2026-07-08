import type {
  IUserDeviceRepository,
  IUserRepository,
} from '@home-pulse-watcher/core';
import {
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface NotificationRecipient {
  userId: string;
  chatId: string;
  locale: string;
  timezone: string;
}

export interface GetDeviceNotificationRecipientsInput {
  deviceId: string;
}

export interface GetDeviceNotificationRecipientsOutput {
  recipients: NotificationRecipient[];
}

/**
 * Retrieves users associated with a device, resolved to notification
 * recipients (chatId/locale/timezone), in exactly 2 queries regardless of
 * user count. Locale/timezone are returned raw from the User entity —
 * i18n default fallback belongs to the Interface layer consumer.
 */
export class GetDeviceNotificationRecipientsService extends BaseService<
  GetDeviceNotificationRecipientsInput,
  GetDeviceNotificationRecipientsOutput
> {
  constructor(
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly userRepository: IUserRepository,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      deviceId: ['required', 'string'],
    };
  }

  protected async execute(
    params: GetDeviceNotificationRecipientsInput,
    _context: ServiceContext,
  ): Promise<GetDeviceNotificationRecipientsOutput> {
    const userDevices = await this.userDeviceRepository.findByDeviceId(
      params.deviceId,
    );

    const userIds = userDevices.map((userDevice) => userDevice.userId);
    const users = await this.userRepository.findByIds(userIds);

    const recipients: NotificationRecipient[] = users.map((user) => ({
      userId: user.id,
      chatId: user.telegramId.toString(),
      locale: user.locale,
      timezone: user.timezone,
    }));

    return { recipients };
  }
}
