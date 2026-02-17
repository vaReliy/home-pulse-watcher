import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Telegraf } from 'telegraf';
import type {
  IUserRepository,
  IUserDeviceRepository,
  IDeviceRepository,
} from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import {
  PowerStatusChangedEvent,
  POWER_STATUS_CHANGED_EVENT,
} from '@home-pulse-watcher/application';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** Rate limiting constants for Telegram API */
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

/**
 * Listens for power status change events and sends Telegram notifications.
 */
@Injectable()
export class PowerStatusListener {
  private readonly logger = new Logger(PowerStatusListener.name);

  constructor(
    @Optional()
    @Inject(TELEGRAM_TOKENS.BOT)
    private readonly bot: Telegraf<TelegramContext> | null,
    @Inject(REPOSITORY_TOKENS.USER)
    private readonly userRepository: IUserRepository,
    @Inject(REPOSITORY_TOKENS.USER_DEVICE)
    private readonly userDeviceRepository: IUserDeviceRepository,
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
    private readonly messageFormatter: MessageFormatter,
  ) {}

  @OnEvent(POWER_STATUS_CHANGED_EVENT)
  async handlePowerStatusChanged(
    event: PowerStatusChangedEvent,
  ): Promise<void> {
    const bot = this.bot;
    if (!bot) {
      this.logger.debug('Telegram bot not configured, skipping notification');
      return;
    }

    this.logger.debug(
      `Power status changed for device ${event.deviceId}: ${event.previousStatus} -> ${event.newStatus}`,
    );

    try {
      // 1. Find all users subscribed to this device
      const userDevices = await this.userDeviceRepository.findByDeviceId(
        event.deviceId,
      );

      if (userDevices.length === 0) {
        this.logger.debug(
          'No users subscribed to device, skipping notification',
        );
        return;
      }

      // 2. Get device info for label
      const device = await this.deviceRepository.findById(event.deviceId);
      const deviceLabel =
        event.deviceLabel ?? device?.label ?? 'Unknown Device';

      // 3. Get outage duration from domain event (calculated by ProcessPowerStatusService)
      const durationSeconds = event.isPowerRestored
        ? event.durationSeconds
        : null;

      // 4. Format message based on status change
      const message = this.formatNotificationMessage(
        event,
        deviceLabel,
        durationSeconds,
      );

      // 5. Collect user chat IDs
      const recipients: Array<{ chatId: string; userId: string }> = [];
      for (const ud of userDevices) {
        const user = await this.userRepository.findById(ud.userId);
        if (user) {
          recipients.push({
            chatId: user.telegramId.toString(),
            userId: ud.userId,
          });
        }
      }

      // 6. Send notifications with rate limiting
      await this.sendWithRateLimit(bot, message, recipients);
    } catch (error) {
      this.logger.error('Failed to process power status notification', error);
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
            parse_mode: 'HTML',
          });
          this.logger.debug(`Notification sent to user ${chatId}`);
        } catch (error) {
          this.logger.warn(
            `Failed to send notification to user ${userId}`,
            error,
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

  private formatNotificationMessage(
    event: PowerStatusChangedEvent,
    deviceLabel: string,
    durationSeconds: number | null,
  ): string {
    if (event.isPowerLost) {
      return this.messageFormatter.formatPowerLost(
        deviceLabel,
        event.timestamp,
      );
    }

    if (event.isPowerRestored) {
      return this.messageFormatter.formatPowerRestored(
        deviceLabel,
        event.timestamp,
        durationSeconds,
      );
    }

    // First status report (no previous status)
    if (event.newStatus === PowerStatus.ON) {
      return this.messageFormatter.formatDeviceOnline(deviceLabel);
    }

    return this.messageFormatter.formatDeviceOffline(deviceLabel);
  }
}
