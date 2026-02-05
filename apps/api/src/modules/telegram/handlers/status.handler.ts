import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { MESSAGES } from '../constants/messages.constants.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles /status command - shows all devices power status.
 * Requires authenticated user.
 */
@Injectable()
export class StatusHandler {
  private readonly logger = new Logger(StatusHandler.name);

  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
    @Inject(REPOSITORY_TOKENS.USER_DEVICE)
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly messageFormatter: MessageFormatter,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const user = ctx.user;
    if (!user) {
      await ctx.reply(MESSAGES.NOT_REGISTERED, { parse_mode: 'HTML' });
      return;
    }

    try {
      // Get user's device associations
      const userDevices = await this.userDeviceRepository.findByUserId(user.id);

      if (userDevices.length === 0) {
        await ctx.reply(MESSAGES.NO_DEVICES, { parse_mode: 'HTML' });
        return;
      }

      // Fetch full device data
      const devicesWithNames = await Promise.all(
        userDevices.map(async (ud) => {
          const device = await this.deviceRepository.findById(ud.deviceId);
          return device ? { device, customName: ud.customName } : null;
        }),
      );

      const validDevices = devicesWithNames.filter(
        (d): d is NonNullable<typeof d> => d !== null,
      );

      const message =
        this.messageFormatter.formatAllDevicesStatus(validDevices);
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Failed to fetch device status', error);
      await ctx.reply(MESSAGES.ERROR_GENERIC);
    }
  }
}
