import { Injectable } from '@nestjs/common';
import { TranslationService } from '../i18n/index.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles help display — shows how to use the bot.
 * Works for all users (registered or not).
 */
@Injectable()
export class HelpHandler {
  constructor(private readonly translationService: TranslationService) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const locale = ctx.user?.locale;
    const msgs = this.translationService.getMessages(locale);
    await ctx.reply(msgs.HELP, {
      parse_mode: 'MarkdownV2',
      ...buildMainMenuKeyboard(msgs),
    });
  }
}
