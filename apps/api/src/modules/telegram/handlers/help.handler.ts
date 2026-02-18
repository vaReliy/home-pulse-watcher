import { Injectable } from '@nestjs/common';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles /help command - shows available commands.
 * Works for all users (registered or not).
 */
@Injectable()
export class HelpHandler {
  constructor(private readonly translationService: TranslationService) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const msgs = this.translationService.getMessages();
    await ctx.reply(msgs.HELP, { parse_mode: 'HTML' });
  }
}
