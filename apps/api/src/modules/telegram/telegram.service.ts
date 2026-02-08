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
    if (this.bot) {
      this.logger.log('Stopping Telegram bot...');
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

    // Error handling middleware
    this.bot.catch((err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err);
    });
  }

  private setupCommands(): void {
    if (!this.bot) return;

    // /start - works without authentication
    this.bot.command('start', async (ctx) => {
      await this.startHandler.handle(ctx as TelegramContext);
    });

    // /help - works without authentication
    this.bot.command('help', async (ctx) => {
      await this.helpHandler.handle(ctx as TelegramContext);
    });

    // /status - requires authentication
    this.bot.command('status', async (ctx) => {
      await this.withAuth(ctx as TelegramContext, () =>
        this.statusHandler.handle(ctx as TelegramContext),
      );
    });

    // /devices - requires authentication
    this.bot.command('devices', async (ctx) => {
      await this.withAuth(ctx as TelegramContext, () =>
        this.devicesHandler.handle(ctx as TelegramContext),
      );
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

    const user = await this.userRepository.findByTelegramId(BigInt(telegramId));

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

    if (this.config.useWebhook && this.config.webhookDomain) {
      // Production: use webhooks
      const webhookUrl = `${this.config.webhookDomain}/api/telegram/webhook`;
      await this.bot.telegram.setWebhook(webhookUrl);
      this.logger.log(`Telegram bot webhook set to: ${webhookUrl}`);
    } else {
      // Development: use long polling (don't await - runs in background)
      this.bot.launch();
      this.logger.log('Telegram bot started with long polling');
    }
  }
}
