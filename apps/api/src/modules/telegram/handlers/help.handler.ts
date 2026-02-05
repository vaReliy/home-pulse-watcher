import { Injectable } from '@nestjs/common';
import { MESSAGES } from '../constants/messages.constants.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles /help command - shows available commands.
 * Works for all users (registered or not).
 */
@Injectable()
export class HelpHandler {
  async handle(ctx: TelegramContext): Promise<void> {
    await ctx.reply(MESSAGES.HELP, { parse_mode: 'HTML' });
  }
}
