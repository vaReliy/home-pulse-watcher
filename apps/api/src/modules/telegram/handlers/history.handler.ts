import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserDeviceRepository,
  IPowerEventRepository,
} from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { MESSAGES } from '../constants/messages.constants.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles /history command - shows current month's power events for all user devices.
 * Requires authenticated user.
 */
@Injectable()
export class HistoryHandler {
  private readonly logger = new Logger(HistoryHandler.name);

  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
    @Inject(REPOSITORY_TOKENS.USER_DEVICE)
    private readonly userDeviceRepository: IUserDeviceRepository,
    @Inject(REPOSITORY_TOKENS.POWER_EVENT)
    private readonly powerEventRepository: IPowerEventRepository,
    private readonly messageFormatter: MessageFormatter,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const user = ctx.user;
    if (!user) {
      await ctx.reply(MESSAGES.NOT_REGISTERED, { parse_mode: 'HTML' });
      return;
    }

    try {
      const userDevices = await this.userDeviceRepository.findByUserId(user.id);

      if (userDevices.length === 0) {
        await ctx.reply(MESSAGES.NO_DEVICES, { parse_mode: 'HTML' });
        return;
      }

      // First day of current month
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);

      const deviceHistories = await Promise.all(
        userDevices.map(async (ud) => {
          const device = await this.deviceRepository.findById(ud.deviceId);
          const label =
            ud.customName ?? device?.label ?? device?.macAddress ?? 'Unknown';

          const events = await this.powerEventRepository.findMany({
            deviceId: ud.deviceId,
            startDate,
            orderBy: 'asc',
          });

          return { label, events };
        }),
      );

      const message = this.messageFormatter.formatHistory(deviceHistories);
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Failed to fetch power history', error);
      await ctx.reply(MESSAGES.ERROR_GENERIC);
    }
  }
}
