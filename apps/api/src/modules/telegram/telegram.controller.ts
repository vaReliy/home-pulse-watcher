import {
  Controller,
  Post,
  Req,
  Res,
  Inject,
  Optional,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Telegraf } from 'telegraf';
import { TELEGRAM_TOKENS } from './telegram.tokens.js';
import type { TelegramContext } from './types/telegram-context.type.js';

/**
 * Handles incoming Telegram webhook updates.
 * Required for production deployment on Cloud Run (scales to zero, polling not viable).
 */
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    @Optional()
    @Inject(TELEGRAM_TOKENS.BOT)
    private readonly bot: Telegraf<TelegramContext> | null,
  ) {}

  /**
   * Receives Telegram webhook POST updates and delegates to Telegraf.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Webhook received but bot is not configured');
      res.sendStatus(HttpStatus.OK);
      return;
    }

    try {
      await this.bot.handleUpdate(req.body);
      res.sendStatus(HttpStatus.OK);
    } catch (error) {
      this.logger.error('Error processing webhook update', error);
      res.sendStatus(HttpStatus.OK);
    }
  }
}
