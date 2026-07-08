import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GetUserDevicesOverviewService } from '@home-pulse-watcher/application';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { TranslationService } from '../i18n/index.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles status display — shows all devices power status.
 * Requires authenticated user.
 */
@Injectable()
export class StatusHandler {
  private readonly logger = new Logger(StatusHandler.name);

  constructor(
    @Inject(SERVICE_TOKENS.GET_USER_DEVICES_OVERVIEW)
    private readonly getUserDevicesOverviewService: GetUserDevicesOverviewService,
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
      const { data } = await this.getUserDevicesOverviewService.run({
        userId: user.id,
      });

      if (data.devices.length === 0) {
        await ctx.reply(msgs.NO_DEVICES, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(msgs),
        });
        return;
      }

      const validDevices = data.devices.map(({ device, customName }) => ({
        device,
        customName,
      }));

      const message = this.messageFormatter.formatAllDevicesStatus(
        validDevices,
        user.locale,
        user.timezone,
      );
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    } catch (error) {
      this.logger.error(
        'Failed to fetch device status',
        error instanceof Error ? error.stack : String(error),
      );
      await ctx.reply(msgs.ERROR_GENERIC, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    }
  }
}
