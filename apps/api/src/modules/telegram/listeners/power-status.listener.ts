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
import { TranslationService } from '../i18n/index.js';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../i18n/locale.config.js';
import {
  buildCheckStatusButton,
  buildViewHistoryButton,
} from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** Rate limiting constants for Telegram API */
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

function resolveMessageType(event: PowerStatusChangedEvent): string {
  if (event.isPowerLost) return 'power_lost';
  if (event.isPowerRestored) return 'power_restored';
  return event.newStatus === PowerStatus.ON
    ? 'device_online'
    : 'device_offline';
}

interface RecipientGroup {
  locale: string;
  timezone: string;
  recipients: Array<{ chatId: string; userId: string }>;
}

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
    private readonly translationService: TranslationService,
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

      // 3. Get outage duration from domain event
      const durationSeconds = event.isPowerRestored
        ? event.durationSeconds
        : null;

      // 4. Group recipients by locale/timezone
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

      const messageType = resolveMessageType(event);

      const totalRecipients = [...groups.values()].reduce(
        (sum, g) => sum + g.recipients.length,
        0,
      );
      this.logger.log(
        `Sending notification: type=${messageType} device=${deviceLabel} recipients=${totalRecipients}`,
      );

      // 5. Format and send one message per locale/timezone group
      for (const group of groups.values()) {
        const message = this.formatNotificationMessage(
          event,
          deviceLabel,
          durationSeconds,
          group.locale,
          group.timezone,
        );

        const msgs = this.translationService.getMessages(group.locale);
        const inlineKeyboard = event.isPowerLost
          ? buildCheckStatusButton(msgs)
          : event.isPowerRestored
            ? buildViewHistoryButton(msgs)
            : undefined;

        await this.sendWithRateLimit(
          bot,
          message,
          group.recipients,
          inlineKeyboard,
        );
      }

      this.logger.log(
        `Notification delivered: type=${messageType} device=${deviceLabel}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to process power status notification',
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
    inlineKeyboard?: ReturnType<typeof buildCheckStatusButton>,
  ): Promise<void> {
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const sendPromises = batch.map(async ({ chatId, userId }) => {
        try {
          await bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            ...(inlineKeyboard ? inlineKeyboard : {}),
          });
          this.logger.debug(`Notification sent to user ${chatId}`);
        } catch (error) {
          this.logger.warn(
            `Failed to send notification to user ${userId}`,
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

  private formatNotificationMessage(
    event: PowerStatusChangedEvent,
    deviceLabel: string,
    durationSeconds: number | null,
    locale: string,
    timezone: string,
  ): string {
    if (event.isPowerLost) {
      return this.messageFormatter.formatPowerLost(
        deviceLabel,
        event.timestamp,
        locale,
        timezone,
        event.batteryVoltage,
      );
    }

    if (event.isPowerRestored) {
      return this.messageFormatter.formatPowerRestored(
        deviceLabel,
        event.timestamp,
        durationSeconds,
        locale,
        timezone,
        event.batteryVoltage,
      );
    }

    // First status report (no previous status)
    if (event.newStatus === PowerStatus.ON) {
      return this.messageFormatter.formatDeviceOnline(deviceLabel, locale);
    }

    return this.messageFormatter.formatDeviceOffline(deviceLabel, locale);
  }
}
