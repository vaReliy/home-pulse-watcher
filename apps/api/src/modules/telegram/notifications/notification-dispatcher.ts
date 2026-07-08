import { Injectable, Logger } from '@nestjs/common';
import type { NotificationRecipient } from '@home-pulse-watcher/application';
import type { Telegraf } from 'telegraf';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../i18n/locale.config.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** Rate limiting constants for Telegram API (~30 msgs/sec ceiling). */
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

/** A single Telegram send target within a locale/timezone group. */
export interface DispatchRecipient {
  chatId: string;
  userId: string;
}

/** Recipients sharing the same locale/timezone — one formatted message per group. */
export interface RecipientGroup {
  locale: string;
  timezone: string;
  recipients: DispatchRecipient[];
}

/** Message payload produced per group by the caller's formatter callback. */
export interface DispatchMessage {
  text: string;
  /** Telegraf `sendMessage` extra options (e.g. inline keyboard). */
  extra?: object;
}

/**
 * Interface-layer (Telegraf-bound) delivery helper shared by all Telegram
 * notification listeners. Owns:
 *  - locale/timezone grouping of raw {@link NotificationRecipient}s, including
 *    the `?? DEFAULT_LOCALE` / `?? DEFAULT_TIMEZONE` fallback (deliberately
 *    NOT in the Application layer — the query service returns raw user
 *    values, this is presentation-layer default resolution)
 *  - 25-message / 1000ms rate-limited batch sending
 *
 * Extracted from near-identical logic previously duplicated between
 * `PowerStatusListener` and `BatteryLowListener`.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  /**
   * Groups recipients by (locale, timezone), applying the i18n default
   * fallback for any missing/empty value.
   */
  groupByLocaleAndTimezone(
    recipients: NotificationRecipient[],
  ): RecipientGroup[] {
    const groups = new Map<string, RecipientGroup>();

    for (const recipient of recipients) {
      const locale = recipient.locale ?? DEFAULT_LOCALE;
      const timezone = recipient.timezone ?? DEFAULT_TIMEZONE;
      const key = `${locale}:${timezone}`;

      if (!groups.has(key)) {
        groups.set(key, { locale, timezone, recipients: [] });
      }
      groups.get(key)!.recipients.push({
        chatId: recipient.chatId,
        userId: recipient.userId,
      });
    }

    return [...groups.values()];
  }

  /**
   * Groups recipients, then formats and sends one rate-limited message
   * batch per group via `buildMessage`.
   */
  async dispatch(
    bot: Telegraf<TelegramContext>,
    recipients: NotificationRecipient[],
    buildMessage: (group: RecipientGroup) => DispatchMessage,
  ): Promise<void> {
    const groups = this.groupByLocaleAndTimezone(recipients);

    for (const group of groups) {
      const { text, extra } = buildMessage(group);
      await this.sendWithRateLimit(bot, text, group.recipients, extra);
    }
  }

  /**
   * Send a single message to a recipient list in batches of
   * {@link BATCH_SIZE}, waiting {@link BATCH_DELAY_MS} between batches to
   * respect Telegram's rate limits. Per-recipient failures are logged and
   * do not abort the batch (`Promise.allSettled`).
   */
  private async sendWithRateLimit(
    bot: Telegraf<TelegramContext>,
    message: string,
    recipients: DispatchRecipient[],
    extra?: object,
  ): Promise<void> {
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const sendPromises = batch.map(async ({ chatId, userId }) => {
        try {
          await bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            ...(extra ?? {}),
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

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  }
}
