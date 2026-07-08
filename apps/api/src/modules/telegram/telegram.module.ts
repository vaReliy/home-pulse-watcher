import { Module, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ServicesModule } from '../services/services.module.js';
import { TELEGRAM_TOKENS } from './telegram.tokens.js';
import {
  validateTelegramConfig,
  type TelegramConfig,
} from './telegram.config.js';
import { TelegramService } from './telegram.service.js';
import { TelegramController } from './telegram.controller.js';
import { MessageFormatter } from './formatters/message.formatter.js';
import { TranslationService } from './i18n/index.js';
import { StartHandler } from './handlers/start.handler.js';
import { StatusHandler } from './handlers/status.handler.js';
import { DevicesHandler } from './handlers/devices.handler.js';
import { HelpHandler } from './handlers/help.handler.js';
import { HistoryHandler } from './handlers/history.handler.js';
import { SettingsHandler } from './handlers/settings.handler.js';
import { PowerStatusListener } from './listeners/power-status.listener.js';
import { BatteryLowListener } from './listeners/battery-low.listener.js';
import { NotificationDispatcher } from './notifications/notification-dispatcher.js';
import type { TelegramContext } from './types/telegram-context.type.js';

@Module({
  imports: [ServicesModule],
  controllers: [TelegramController],
  providers: [
    // Configuration - returns null if TELEGRAM_BOT_TOKEN not set
    {
      provide: TELEGRAM_TOKENS.CONFIG,
      useFactory: (): TelegramConfig | null => {
        const logger = new Logger('TelegramModule');
        try {
          return validateTelegramConfig();
        } catch {
          logger.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN not set');
          return null;
        }
      },
    },
    // Telegraf Bot Instance - null if config is null
    {
      provide: TELEGRAM_TOKENS.BOT,
      useFactory: (
        config: TelegramConfig | null,
      ): Telegraf<TelegramContext> | null => {
        if (!config) return null;
        return new Telegraf<TelegramContext>(config.botToken);
      },
      inject: [TELEGRAM_TOKENS.CONFIG],
    },
    // i18n
    TranslationService,
    // Formatters
    MessageFormatter,
    // Handlers
    StartHandler,
    StatusHandler,
    DevicesHandler,
    HelpHandler,
    HistoryHandler,
    SettingsHandler,
    // Notification delivery (Telegraf-bound, Interface layer)
    NotificationDispatcher,
    // Event Listeners
    PowerStatusListener,
    BatteryLowListener,
    // Main Service
    TelegramService,
  ],
  exports: [TELEGRAM_TOKENS.BOT],
})
export class TelegramModule {}
