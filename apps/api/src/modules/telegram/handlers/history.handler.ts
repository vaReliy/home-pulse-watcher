import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  GetPowerHistoryService,
  GetUserDevicesOverviewService,
} from '@home-pulse-watcher/application';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { collapseEvents } from '../formatters/collapse-events.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { TranslationService } from '../i18n/index.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** History window: 7 days in milliseconds. */
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Upper bound for events fetched per device. Capped at 100 — the maximum
 * `limit` accepted by {@link GetPowerHistoryService}'s LIVR validation
 * (`max_number: 100`). Previously fetched up to 2000 events directly from
 * the repository; going through the shared service trades that unbounded
 * coverage for centralized validation. Message truncation still applies
 * on top of this.
 */
const HISTORY_EVENT_MAX = 100;

/**
 * Handles history display — shows current month's power events for all user devices.
 * Requires authenticated user.
 */
@Injectable()
export class HistoryHandler {
  private readonly logger = new Logger(HistoryHandler.name);

  constructor(
    @Inject(SERVICE_TOKENS.GET_USER_DEVICES_OVERVIEW)
    private readonly getUserDevicesOverviewService: GetUserDevicesOverviewService,
    @Inject(SERVICE_TOKENS.GET_POWER_HISTORY)
    private readonly getPowerHistoryService: GetPowerHistoryService,
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
      const { data: overview } = await this.getUserDevicesOverviewService.run({
        userId: user.id,
      });

      if (overview.devices.length === 0) {
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
        overview.devices.map(async ({ device, customName }) => {
          const label = customName ?? device.label ?? device.macAddress;

          const { data: history } = await this.getPowerHistoryService.run({
            deviceId: device.id,
            startDate: startDate.toISOString(),
            orderBy: 'asc',
            limit: HISTORY_EVENT_MAX,
          });

          return { label, events: collapseEvents(history.events) };
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
