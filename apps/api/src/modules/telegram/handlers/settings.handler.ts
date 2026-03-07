import { Injectable, Logger } from '@nestjs/common';
import { TranslationService } from '../i18n/index.js';
import { escapeMarkdownV2 } from '../formatters/escape-markdown.js';
import {
  buildMainMenuKeyboard,
  buildSettingsKeyboard,
} from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles settings screen — shows current locale/timezone with inline keyboard.
 * Requires authenticated user.
 */
@Injectable()
export class SettingsHandler {
  private readonly logger = new Logger(SettingsHandler.name);

  constructor(private readonly translationService: TranslationService) {}

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
      const currentSettings = msgs.SETTINGS_CURRENT(
        escapeMarkdownV2(user.locale ?? 'uk'),
        escapeMarkdownV2(user.timezone ?? 'Europe/Kyiv'),
      );

      await ctx.reply(`${msgs.SETTINGS_HEADER}\n\n${currentSettings}`, {
        parse_mode: 'MarkdownV2',
        ...buildSettingsKeyboard(msgs),
      });
    } catch (error) {
      this.logger.error(
        'Failed to show settings',
        error instanceof Error ? error.stack : String(error),
      );
      await ctx.reply(msgs.ERROR_GENERIC, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    }
  }
}
