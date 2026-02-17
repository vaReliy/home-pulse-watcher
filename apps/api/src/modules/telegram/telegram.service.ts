import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import type { Telegraf } from 'telegraf';
import type { IUserRepository } from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../repositories/repository.tokens.js';
import { TELEGRAM_TOKENS } from './telegram.tokens.js';
import type { TelegramConfig } from './telegram.config.js';
import type { TelegramContext } from './types/telegram-context.type.js';
import { StartHandler } from './handlers/start.handler.js';
import { StatusHandler } from './handlers/status.handler.js';
import { DevicesHandler } from './handlers/devices.handler.js';
import { HelpHandler } from './handlers/help.handler.js';
import { HistoryHandler } from './handlers/history.handler.js';
import { MESSAGES } from './constants/messages.constants.js';

/**
 * Manages Telegraf bot lifecycle and command registration.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Optional()
    @Inject(TELEGRAM_TOKENS.BOT)
    private readonly bot: Telegraf<TelegramContext> | null,
    @Optional()
    @Inject(TELEGRAM_TOKENS.CONFIG)
    private readonly config: TelegramConfig | null,
    @Inject(REPOSITORY_TOKENS.USER)
    private readonly userRepository: IUserRepository,
    private readonly startHandler: StartHandler,
    private readonly statusHandler: StatusHandler,
    private readonly devicesHandler: DevicesHandler,
    private readonly helpHandler: HelpHandler,
    private readonly historyHandler: HistoryHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.bot || !this.config) {
      this.logger.warn(
        'Telegram bot not configured (TELEGRAM_BOT_TOKEN not set)',
      );
      return;
    }

    this.setupMiddleware();
    this.setupCommands();
    await this.startBot();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.bot || !this.config) return;

    // Only stop in polling mode — in webhook mode there's nothing to stop,
    // and calling stop() could theoretically interact with the webhook.
    if (!this.config.useWebhook) {
      this.logger.log('Stopping Telegram bot polling...');
      try {
        this.bot.stop('SIGTERM');
        this.logger.log('Telegram bot stopped');
      } catch (error) {
        this.logger.error('Error stopping Telegram bot', error);
      }
    }
  }

  private setupMiddleware(): void {
    if (!this.bot) return;

    // Error handling middleware — reply to user so errors aren't silent
    this.bot.catch(async (err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err);
      try {
        if (ctx.chat) {
          await ctx.reply(MESSAGES.ERROR_GENERIC);
        }
      } catch (replyError) {
        this.logger.error('Failed to send error reply to user', replyError);
      }
    });
  }

  private setupCommands(): void {
    if (!this.bot) return;

    // /start - works without authentication
    this.bot.command('start', async (ctx) => {
      try {
        await this.startHandler.handle(ctx as TelegramContext);
      } catch (error) {
        this.logger.error('Error in /start handler', error);
        await ctx.reply(MESSAGES.ERROR_GENERIC);
      }
    });

    // /help - works without authentication
    this.bot.command('help', async (ctx) => {
      try {
        await this.helpHandler.handle(ctx as TelegramContext);
      } catch (error) {
        this.logger.error('Error in /help handler', error);
        await ctx.reply(MESSAGES.ERROR_GENERIC);
      }
    });

    // /status - requires authentication
    this.bot.command('status', async (ctx) => {
      try {
        await this.withAuth(ctx as TelegramContext, () =>
          this.statusHandler.handle(ctx as TelegramContext),
        );
      } catch (error) {
        this.logger.error('Error in /status handler', error);
        await ctx.reply(MESSAGES.ERROR_GENERIC);
      }
    });

    // /devices - requires authentication
    this.bot.command('devices', async (ctx) => {
      try {
        await this.withAuth(ctx as TelegramContext, () =>
          this.devicesHandler.handle(ctx as TelegramContext),
        );
      } catch (error) {
        this.logger.error('Error in /devices handler', error);
        await ctx.reply(MESSAGES.ERROR_GENERIC);
      }
    });

    // /history - requires authentication
    this.bot.command('history', async (ctx) => {
      try {
        await this.withAuth(ctx as TelegramContext, () =>
          this.historyHandler.handle(ctx as TelegramContext),
        );
      } catch (error) {
        this.logger.error('Error in /history handler', error);
        await ctx.reply(MESSAGES.ERROR_GENERIC);
      }
    });
  }

  /**
   * Authentication wrapper for protected commands.
   */
  private async withAuth(
    ctx: TelegramContext,
    handler: () => Promise<void>,
  ): Promise<void> {
    const telegramId = ctx.from?.id;

    if (!telegramId) {
      await ctx.reply(MESSAGES.ERROR_GENERIC);
      return;
    }

    let user;
    try {
      user = await this.userRepository.findByTelegramId(BigInt(telegramId));
    } catch (error) {
      this.logger.error('Failed to look up user during authentication', error);
      await ctx.reply(MESSAGES.ERROR_GENERIC);
      return;
    }

    if (!user) {
      await ctx.reply(MESSAGES.NOT_REGISTERED, { parse_mode: 'HTML' });
      return;
    }

    // Attach user to context
    ctx.user = user;

    await handler();
  }

  private async startBot(): Promise<void> {
    if (!this.bot || !this.config) return;

    if (this.config.useWebhook) {
      if (!this.config.webhookDomain) {
        this.logger.error(
          'TELEGRAM_USE_WEBHOOK is true but TELEGRAM_WEBHOOK_DOMAIN is not set. ' +
            'Bot cannot receive commands without a webhook URL.',
        );
        return;
      }

      // Production: use webhooks with retry for cold start resilience
      const webhookUrl = `${this.config.webhookDomain}/api/telegram/webhook`;
      await this.setWebhookWithRetry(webhookUrl);
    } else {
      // Safety: refuse polling in production — it calls deleteWebhook internally
      // and would wipe the registered webhook URL
      if (process.env['NODE_ENV'] === 'production') {
        this.logger.error(
          'Polling mode blocked in production (would delete webhook). ' +
            'Set TELEGRAM_USE_WEBHOOK=true and TELEGRAM_WEBHOOK_DOMAIN.',
        );
        return;
      }

      // Development: use long polling (don't await - runs in background)
      this.bot.launch();
      this.logger.log('Telegram bot started with long polling');
    }
  }

  /**
   * Registers the webhook URL with Telegram, retrying on transient failures.
   */
  private async setWebhookWithRetry(
    webhookUrl: string,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bot!.telegram.setWebhook(webhookUrl, {
          ...(this.config!.webhookSecret && {
            secret_token: this.config!.webhookSecret,
          }),
        });
        this.logger.log(`Telegram bot webhook set to: ${webhookUrl}`);

        // Verify webhook registration
        try {
          const info = await this.bot!.telegram.getWebhookInfo();
          this.logger.log(
            `Webhook verified: url=${info.url}, pending=${info.pending_update_count}, ` +
              `last_error=${info.last_error_message ?? 'none'}`,
          );
        } catch (verifyError) {
          this.logger.warn('Failed to verify webhook info', verifyError);
        }

        return;
      } catch (error) {
        this.logger.error(
          `Failed to set webhook (attempt ${attempt}/${maxRetries})`,
          error,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    this.logger.error('All webhook registration attempts failed');
  }
}
