import { timingSafeEqual } from 'crypto';
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
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Telegraf } from 'telegraf';
import { TELEGRAM_TOKENS } from './telegram.tokens.js';
import type { TelegramConfig } from './telegram.config.js';
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
    @Optional()
    @Inject(TELEGRAM_TOKENS.CONFIG)
    private readonly config: TelegramConfig | null,
  ) {}

  /**
   * Receives Telegram webhook POST updates and delegates to Telegraf.
   * 60 req/sec/IP — matches Telegram's max update delivery rate per bot.
   */
  @Throttle({ default: { ttl: 1_000, limit: 60 } })
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

    // Require webhook secret — reject all requests if secret is absent at runtime.
    // env.validation.ts marks TELEGRAM_WEBHOOK_SECRET required, but guard defensively here
    // to prevent unsigned requests if that validation is ever bypassed.
    if (!this.config?.webhookSecret || this.config.webhookSecret.length === 0) {
      this.logger.error(
        'Webhook secret not configured — rejecting request to prevent unsigned update acceptance',
      );
      res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json({ error: 'Webhook not configured' });
      return;
    }

    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    const a = Buffer.from(typeof headerSecret === 'string' ? headerSecret : '');
    const b = Buffer.from(this.config.webhookSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Webhook request with invalid secret token');
      res.sendStatus(HttpStatus.UNAUTHORIZED);
      return;
    }

    try {
      this.logger.debug(
        `Webhook update received: update_id=${req.body?.update_id}, text=${req.body?.message?.text}`,
      );
      await this.bot.handleUpdate(req.body);
      res.sendStatus(HttpStatus.OK);
    } catch (error) {
      this.logger.error(
        'Error processing webhook update',
        error instanceof Error ? error.stack : String(error),
      );
      res.sendStatus(HttpStatus.OK);
    }
  }
}
