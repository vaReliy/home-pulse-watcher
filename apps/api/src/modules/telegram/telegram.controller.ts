import {
  Controller,
  Get,
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

    // Validate webhook secret if configured
    if (this.config?.webhookSecret) {
      const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== this.config.webhookSecret) {
        this.logger.warn('Webhook request with invalid secret token');
        res.sendStatus(HttpStatus.UNAUTHORIZED);
        return;
      }
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

  /**
   * [DIAGNOSTIC] Returns current Telegram webhook state for debugging.
   * TODO: protect with auth or remove after debugging.
   */
  @Get('debug-webhook')
  async debugWebhook(): Promise<Record<string, unknown>> {
    if (!this.bot || !this.config) {
      return {
        error: 'Bot or config not available',
        botConfigured: !!this.bot,
        configLoaded: !!this.config,
      };
    }

    const info = await this.bot.telegram.getWebhookInfo();
    const expectedUrl = this.config.webhookDomain
      ? `${this.config.webhookDomain}/api/telegram/webhook`
      : null;

    return {
      currentUrl: info.url || null,
      expectedUrl,
      urlMatch: !!expectedUrl && info.url === expectedUrl,
      hasCustomCertificate: info.has_custom_certificate,
      pendingUpdateCount: info.pending_update_count,
      lastErrorDate: info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
      lastErrorMessage: info.last_error_message ?? null,
      lastSynchronizationErrorDate: info.last_synchronization_error_date
        ? new Date(info.last_synchronization_error_date * 1000).toISOString()
        : null,
      maxConnections: info.max_connections,
      ipAddress: info.ip_address ?? null,
    };
  }

  /**
   * [DIAGNOSTIC] Re-registers the webhook with Telegram.
   * TODO: protect with auth or remove after debugging.
   */
  @Post('reset-webhook')
  async resetWebhook(): Promise<Record<string, unknown>> {
    if (!this.bot || !this.config) {
      return {
        success: false,
        error: 'Bot or config not available',
        botConfigured: !!this.bot,
        configLoaded: !!this.config,
      };
    }

    if (!this.config.webhookDomain) {
      return {
        success: false,
        error: 'No webhookDomain configured (TELEGRAM_WEBHOOK_DOMAIN env var)',
      };
    }

    const webhookUrl = `${this.config.webhookDomain}/api/telegram/webhook`;

    await this.bot.telegram.setWebhook(webhookUrl, {
      secret_token: this.config.webhookSecret,
    });

    const info = await this.bot.telegram.getWebhookInfo();

    return {
      success: info.url === webhookUrl,
      registeredUrl: info.url || null,
      expectedUrl: webhookUrl,
      pendingUpdateCount: info.pending_update_count,
      lastErrorMessage: info.last_error_message ?? null,
    };
  }
}
