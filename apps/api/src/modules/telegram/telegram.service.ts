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
import { SettingsHandler } from './handlers/settings.handler.js';
import { TranslationService } from './i18n/index.js';
import { escapeMarkdownV2 } from './formatters/escape-markdown.js';
import {
  buildMainMenuKeyboard,
  buildLanguageKeyboard,
  buildTimezoneKeyboard,
} from './keyboards/index.js';

/** Valid timezone choices for the settings screen. */
const VALID_TIMEZONES = new Set([
  'Europe/Kyiv',
  'Europe/London',
  'Europe/Warsaw',
  'US/Eastern',
]);

/** Valid locale choices for the settings screen. */
const VALID_LOCALES = new Set(['uk', 'en']);

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
    private readonly settingsHandler: SettingsHandler,
    private readonly translationService: TranslationService,
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
    this.setupHears();
    this.setupActions();
    this.setupCatchAll();
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

    const msgs = this.translationService.getMessages();

    // Error handling middleware — reply to user so errors aren't silent
    this.bot.catch(async (err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err);
      try {
        if (ctx.chat) {
          await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
        }
      } catch (replyError) {
        this.logger.error('Failed to send error reply to user', replyError);
      }
    });
  }

  private setupCommands(): void {
    if (!this.bot) return;

    const msgs = this.translationService.getMessages();

    // /start — only slash command for regular users
    this.bot.command('start', async (ctx) => {
      try {
        await this.startHandler.handle(ctx as TelegramContext);
      } catch (error) {
        this.logger.error('Error in /start handler', error);
        await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
      }
    });
  }

  private setupHears(): void {
    if (!this.bot) return;

    const msgs = this.translationService.getMessages();

    // Status button
    this.bot.hears(
      this.translationService.getAllButtonTexts('BUTTON_STATUS'),
      async (ctx) => {
        try {
          await this.withAuth(ctx as TelegramContext, () =>
            this.statusHandler.handle(ctx as TelegramContext),
          );
        } catch (error) {
          this.logger.error('Error in status handler', error);
          await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
        }
      },
    );

    // Devices button
    this.bot.hears(
      this.translationService.getAllButtonTexts('BUTTON_DEVICES'),
      async (ctx) => {
        try {
          await this.withAuth(ctx as TelegramContext, () =>
            this.devicesHandler.handle(ctx as TelegramContext),
          );
        } catch (error) {
          this.logger.error('Error in devices handler', error);
          await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
        }
      },
    );

    // Settings button
    this.bot.hears(
      this.translationService.getAllButtonTexts('BUTTON_SETTINGS'),
      async (ctx) => {
        try {
          await this.withAuth(ctx as TelegramContext, () =>
            this.settingsHandler.handle(ctx as TelegramContext),
          );
        } catch (error) {
          this.logger.error('Error in settings handler', error);
          await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
        }
      },
    );

    // Help button — no auth required
    this.bot.hears(
      this.translationService.getAllButtonTexts('BUTTON_HELP'),
      async (ctx) => {
        try {
          // Attach user if registered (for locale-aware help)
          const telegramId = ctx.from?.id;
          if (telegramId) {
            const user = await this.userRepository.findByTelegramId(
              BigInt(telegramId),
            );
            if (user) {
              (ctx as TelegramContext).user = user;
            }
          }
          await this.helpHandler.handle(ctx as TelegramContext);
        } catch (error) {
          this.logger.error('Error in help handler', error);
          await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
        }
      },
    );
  }

  private setupActions(): void {
    if (!this.bot) return;

    // Inline button: check status (from power lost notification)
    this.bot.action('check_status', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await this.withAuth(ctx as TelegramContext, () =>
          this.statusHandler.handle(ctx as TelegramContext),
        );
      } catch (error) {
        this.logger.error('Error in check_status action', error);
        await ctx.answerCbQuery().catch(() => {
          /* already handled */
        });
      }
    });

    // Inline button: view history (from power restored notification)
    this.bot.action('view_history', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await this.withAuth(ctx as TelegramContext, () =>
          this.historyHandler.handle(ctx as TelegramContext),
        );
      } catch (error) {
        this.logger.error('Error in view_history action', error);
        await ctx.answerCbQuery().catch(() => {
          /* already handled */
        });
      }
    });

    // Settings: show language selection
    this.bot.action('settings:language', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const user = await this.resolveUser(ctx as TelegramContext);
        if (!user) return;
        const userMsgs = this.translationService.getMessages(user.locale);
        await ctx.editMessageText(userMsgs.SETTINGS_LANGUAGE_HEADER, {
          ...buildLanguageKeyboard(),
        });
      } catch (error) {
        this.logger.error('Error in settings:language action', error);
        await ctx.answerCbQuery().catch(() => {
          /* already handled */
        });
      }
    });

    // Settings: show timezone selection
    this.bot.action('settings:timezone', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const user = await this.resolveUser(ctx as TelegramContext);
        if (!user) return;
        const userMsgs = this.translationService.getMessages(user.locale);
        await ctx.editMessageText(userMsgs.SETTINGS_TIMEZONE_HEADER, {
          ...buildTimezoneKeyboard(userMsgs),
        });
      } catch (error) {
        this.logger.error('Error in settings:timezone action', error);
        await ctx.answerCbQuery().catch(() => {
          /* already handled */
        });
      }
    });

    // Language selected
    this.bot.action(/^lang:(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const newLocale = ctx.match[1];
        if (!VALID_LOCALES.has(newLocale)) return;

        const user = await this.resolveUser(ctx as TelegramContext);
        if (!user) return;

        await this.userRepository.update(user.id, { locale: newLocale });

        const newMsgs = this.translationService.getMessages(newLocale);
        await ctx.editMessageText(newMsgs.SETTINGS_LANGUAGE_UPDATED, {
          parse_mode: 'MarkdownV2',
        });
        // Re-send main menu keyboard with new locale
        await ctx.reply(newMsgs.SETTINGS_HEADER, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(newMsgs),
        });
      } catch (error) {
        this.logger.error('Error in lang action', error);
        await ctx.answerCbQuery().catch(() => {
          /* already handled */
        });
      }
    });

    // Timezone selected
    this.bot.action(/^tz:(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const newTimezone = ctx.match[1];
        if (!VALID_TIMEZONES.has(newTimezone)) return;

        const user = await this.resolveUser(ctx as TelegramContext);
        if (!user) return;

        await this.userRepository.update(user.id, { timezone: newTimezone });

        const userMsgs = this.translationService.getMessages(user.locale);
        const confirmation = `${userMsgs.SETTINGS_TIMEZONE_UPDATED}\n${escapeMarkdownV2(newTimezone)}`;
        await ctx.editMessageText(confirmation, {
          parse_mode: 'MarkdownV2',
        });
      } catch (error) {
        this.logger.error('Error in tz action', error);
        await ctx.answerCbQuery().catch(() => {
          /* already handled */
        });
      }
    });
  }

  /** Catch-all: registered users sending unrecognized text get a nudge. */
  private setupCatchAll(): void {
    if (!this.bot) return;

    this.bot.on('text', async (ctx) => {
      try {
        const telegramId = ctx.from?.id;
        if (!telegramId) return;

        const user = await this.userRepository.findByTelegramId(
          BigInt(telegramId),
        );
        if (!user) return; // Ignore unregistered users

        const userMsgs = this.translationService.getMessages(user.locale);
        await ctx.reply(userMsgs.UNKNOWN_COMMAND, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(userMsgs),
        });
      } catch (error) {
        this.logger.error('Error in catch-all handler', error);
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
    const msgs = this.translationService.getMessages();
    const telegramId = ctx.from?.id;

    if (!telegramId) {
      await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
      return;
    }

    let user;
    try {
      user = await this.userRepository.findByTelegramId(BigInt(telegramId));
    } catch (error) {
      this.logger.error('Failed to look up user during authentication', error);
      await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
      return;
    }

    if (!user) {
      await ctx.reply(msgs.NOT_REGISTERED, { parse_mode: 'MarkdownV2' });
      return;
    }

    // Attach user to context
    ctx.user = user;

    await handler();
  }

  /** Resolves user from callback query context without sending NOT_REGISTERED. */
  private async resolveUser(
    ctx: TelegramContext,
  ): Promise<Awaited<ReturnType<IUserRepository['findByTelegramId']>> | null> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return null;
    return this.userRepository.findByTelegramId(BigInt(telegramId));
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
