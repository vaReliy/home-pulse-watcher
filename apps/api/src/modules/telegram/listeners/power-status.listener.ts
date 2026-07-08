import {
  POWER_STATUS_CHANGED_EVENT,
  PowerStatusChangedEvent,
} from '@home-pulse-watcher/application';
import type { GetDeviceNotificationRecipientsService } from '@home-pulse-watcher/application';
import { PowerStatus } from '@home-pulse-watcher/core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Telegraf } from 'telegraf';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import type { PowerEventMessageParams } from '../formatters/message.formatter.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { TranslationService } from '../i18n/index.js';
import {
  buildCheckStatusButton,
  buildViewHistoryButton,
} from '../keyboards/index.js';
import type {
  DispatchMessage,
  RecipientGroup,
} from '../notifications/notification-dispatcher.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

function resolveMessageType(event: PowerStatusChangedEvent): string {
  if (event.isPowerLost) return 'power_lost';
  if (event.isPowerRestored) return 'power_restored';
  return event.newStatus === PowerStatus.ON
    ? 'device_online'
    : 'device_offline';
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
    @Inject(SERVICE_TOKENS.GET_DEVICE_NOTIFICATION_RECIPIENTS)
    private readonly getDeviceNotificationRecipientsService: GetDeviceNotificationRecipientsService,
    private readonly notificationDispatcher: NotificationDispatcher,
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
      // 1. Resolve recipients (chatId/locale/timezone) in 2 queries.
      const { data } = await this.getDeviceNotificationRecipientsService.run({
        deviceId: event.deviceId,
      });

      if (data.recipients.length === 0) {
        this.logger.debug(
          'No users subscribed to device, skipping notification',
        );
        return;
      }

      const deviceLabel = event.deviceLabel ?? 'Unknown Device';

      // 2. Get outage duration from domain event
      const durationSeconds = event.isPowerRestored
        ? event.durationSeconds
        : null;

      const messageType = resolveMessageType(event);

      this.logger.log(
        `Sending notification: type=${messageType} device=${deviceLabel} recipients=${data.recipients.length}`,
      );

      // 3. Group by locale/timezone, format and send one message per group.
      await this.notificationDispatcher.dispatch(
        bot,
        data.recipients,
        (group: RecipientGroup): DispatchMessage => {
          const text = this.formatNotificationMessage(
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

          return { text, extra: inlineKeyboard };
        },
      );

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

  private formatNotificationMessage(
    event: PowerStatusChangedEvent,
    deviceLabel: string,
    durationSeconds: number | null,
    locale: string,
    timezone: string,
  ): string {
    if (event.isPowerLost) {
      return this.messageFormatter.formatPowerLost(
        this.buildPowerEventMessageParams(
          event,
          deviceLabel,
          durationSeconds,
          locale,
          timezone,
        ),
      );
    }

    if (event.isPowerRestored) {
      return this.messageFormatter.formatPowerRestored(
        this.buildPowerEventMessageParams(
          event,
          deviceLabel,
          durationSeconds,
          locale,
          timezone,
        ),
      );
    }

    // First status report (no previous status)
    if (event.newStatus === PowerStatus.ON) {
      return this.messageFormatter.formatDeviceOnline(deviceLabel, locale);
    }

    return this.messageFormatter.formatDeviceOffline(deviceLabel, locale);
  }

  private buildPowerEventMessageParams(
    event: PowerStatusChangedEvent,
    deviceLabel: string,
    durationSeconds: number | null,
    locale: string,
    timezone: string,
  ): PowerEventMessageParams {
    return {
      deviceLabel,
      timestamp: event.timestamp,
      locale,
      timezone,
      batteryVoltage: event.batteryVoltage,
      durationSeconds,
    };
  }
}
