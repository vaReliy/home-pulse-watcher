import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Telegraf } from 'telegraf';
import type { IUserRepository, IUserDeviceRepository } from '@home-pulse-watcher/core';
import {
  BatteryLowEvent,
  BATTERY_LOW_EVENT,
} from '@home-pulse-watcher/application';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../i18n/locale.config.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** Rate limiting constants for Telegram API */
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

interface RecipientGroup {
  locale: string;
  timezone: string;
  recipients: Array<{ chatId: string; userId: string }>;
}

/**
 * Listens for battery low events and sends SOS Telegram notifications.
 */
@Injectable()
export class BatteryLowListener {
  private readonly logger = new Logger(BatteryLowListener.name);

  constructor(
    @Optional()
    @Inject(TELEGRAM_TOKENS.BOT)
    private readonly bot: Telegraf<TelegramContext> | null,
    @Inject(REPOSITORY_TOKENS.USER)
    private readonly userRepository: IUserRepository,
    @Inject(REPOSITORY_TOKENS.USER_DEVICE)
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly messageFormatter: MessageFormatter,
  ) {}

  @OnEvent(BATTERY_LOW_EVENT)
  async handleBatteryLow(event: BatteryLowEvent): Promise<void> {
    const bot = this.bot;
    if (!bot) {
      this.logger.debug('Telegram bot not configured, skipping battery alert');
      return;
    }

    this.logger.debug(
      `Battery low for device ${event.deviceId}: ${event.batteryVoltage}mV`,
    );

    try {
      // 1. Find all users subscribed to this device
      const userDevices = await this.userDeviceRepository.findByDeviceId(
        event.deviceId,
      );

      if (userDevices.length === 0) {
        this.logger.debug(
          'No users subscribed to device, skipping battery alert',
        );
        return;
      }

      const deviceLabel = event.deviceLabel ?? 'Unknown Device';

      // 2. Group recipients by locale/timezone
      const groups = new Map<string, RecipientGroup>();

      for (const ud of userDevices) {
        const user = await this.userRepository.findById(ud.userId);
        if (!user) continue;

        const locale = user.locale ?? DEFAULT_LOCALE;
        const timezone = user.timezone ?? DEFAULT_TIMEZONE;
        const key = `${locale}:${timezone}`;

        if (!groups.has(key)) {
          groups.set(key, { locale, timezone, recipients: [] });
        }
        groups.get(key)!.recipients.push({
          chatId: user.telegramId.toString(),
          userId: ud.userId,
        });
      }

      const totalRecipients = [...groups.values()].reduce(
        (sum, g) => sum + g.recipients.length,
        0,
      );
      this.logger.log(
        `Sending battery alert: device=${deviceLabel} voltage=${event.batteryVoltage}mV recipients=${totalRecipients}`,
      );

      // 3. Format and send one message per locale/timezone group
      for (const group of groups.values()) {
        const message = this.messageFormatter.formatBatteryLowAlert(
          event,
          group.locale,
          group.timezone,
        );

        await this.sendWithRateLimit(bot, message, group.recipients);
      }

      this.logger.log(
        `Battery alert delivered: device=${deviceLabel} voltage=${event.batteryVoltage}mV`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to process battery low notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Send messages in batches to respect Telegram rate limits (~30 msgs/sec).
   */
  private async sendWithRateLimit(
    bot: Telegraf<TelegramContext>,
    message: string,
    recipients: Array<{ chatId: string; userId: string }>,
  ): Promise<void> {
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const sendPromises = batch.map(async ({ chatId, userId }) => {
        try {
          await bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
          });
          this.logger.debug(`Battery alert sent to user ${chatId}`);
        } catch (error) {
          this.logger.warn(
            `Failed to send battery alert to user ${userId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      });

      await Promise.allSettled(sendPromises);

      // Add delay between batches to respect rate limits
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  }
}
