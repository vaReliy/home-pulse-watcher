import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserDeviceRepository,
  IPowerEventRepository,
} from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { TranslationService } from '../i18n/index.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** History window: 7 days in milliseconds. */
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum events per device in history view. */
const HISTORY_EVENT_LIMIT = 50;

/**
 * Handles history display — shows current month's power events for all user devices.
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
    private readonly translationService: TranslationService,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const user = ctx.user;
    if (!user) {
      const msgs = this.translationService.getMessages();
      await ctx.reply(msgs.NOT_REGISTERED, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
      return;
    }

    const msgs = this.translationService.getMessages(user.locale);

    try {
      const userDevices = await this.userDeviceRepository.findByUserId(user.id);

      if (userDevices.length === 0) {
        await ctx.reply(msgs.NO_DEVICES, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(msgs),
        });
        return;
      }

      // Last 7 days
      const now = new Date();
      const startDate = new Date(now.getTime() - HISTORY_WINDOW_MS);

      const deviceHistories = await Promise.all(
        userDevices.map(async (ud) => {
          const device = await this.deviceRepository.findById(ud.deviceId);
          const label =
            ud.customName ?? device?.label ?? device?.macAddress ?? 'Unknown';

          const events = await this.powerEventRepository.findMany({
            deviceId: ud.deviceId,
            startDate,
            orderBy: 'asc',
            limit: HISTORY_EVENT_LIMIT,
          });

          return { label, events };
        }),
      );

      const message = this.messageFormatter.formatHistory(
        deviceHistories,
        user.locale,
        user.timezone,
      );
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    } catch (error) {
      this.logger.error(
        'Failed to fetch power history',
        error instanceof Error ? error.stack : String(error),
      );
      await ctx.reply(msgs.ERROR_GENERIC, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    }
  }
}
