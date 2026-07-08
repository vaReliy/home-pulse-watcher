import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Telegraf } from 'telegraf';
import type { GetDeviceNotificationRecipientsService } from '@home-pulse-watcher/application';
import {
  BatteryLowEvent,
  BATTERY_LOW_EVENT,
} from '@home-pulse-watcher/application';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TELEGRAM_TOKENS } from '../telegram.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import type {
  DispatchMessage,
  RecipientGroup,
} from '../notifications/notification-dispatcher.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

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
    @Inject(SERVICE_TOKENS.GET_DEVICE_NOTIFICATION_RECIPIENTS)
    private readonly getDeviceNotificationRecipientsService: GetDeviceNotificationRecipientsService,
    private readonly notificationDispatcher: NotificationDispatcher,
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
      // 1. Resolve recipients (chatId/locale/timezone) in 2 queries.
      const { data } = await this.getDeviceNotificationRecipientsService.run({
        deviceId: event.deviceId,
      });

      if (data.recipients.length === 0) {
        this.logger.debug(
          'No users subscribed to device, skipping battery alert',
        );
        return;
      }

      const deviceLabel = event.deviceLabel ?? 'Unknown Device';

      this.logger.log(
        `Sending battery alert: device=${deviceLabel} voltage=${event.batteryVoltage}mV recipients=${data.recipients.length}`,
      );

      // 2. Group by locale/timezone, format and send one message per group.
      await this.notificationDispatcher.dispatch(
        bot,
        data.recipients,
        (group: RecipientGroup): DispatchMessage => ({
          text: this.messageFormatter.formatBatteryLowAlert(
            event,
            group.locale,
            group.timezone,
          ),
        }),
      );

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
}
