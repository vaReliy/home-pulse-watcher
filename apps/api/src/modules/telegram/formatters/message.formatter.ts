import { Injectable } from '@nestjs/common';
import type { Device } from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import type { BatteryLowEvent } from '@home-pulse-watcher/application';
import { TranslationService } from '../i18n/index.js';
import type { Messages } from '../i18n/index.js';
import {
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  LOCALE_INTL_MAP,
} from '../i18n/locale.config.js';
import type { SupportedLocale } from '../i18n/locale.config.js';
import type { CollapsedEvent } from './collapse-events.js';
import { escapeMarkdownV2, boldMd } from './escape-markdown.js';
import { batteryPercentage, formatVoltage } from './battery.utils.js';

/** Telegram MarkdownV2 message character limit. */
const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

/** Safe limit leaving room for the truncation notice. */
const TRUNCATION_SAFE_LENGTH = 3900;

/**
 * Shared field cluster for power-event notification formatting
 * (`formatPowerLost`, `formatPowerRestored`). Grouping these avoids a long
 * parameter list and the transposition risk of adjacent `locale`/`timezone`
 * string params.
 *
 * Note: `durationSeconds` is only meaningful for `formatPowerRestored`
 * (`formatPowerLost` ignores it) — bundled here for a single shared shape
 * rather than per-method param lists.
 */
export interface PowerEventMessageParams {
  deviceLabel: string;
  timestamp: Date;
  locale?: string;
  timezone?: string;
  batteryVoltage?: number | null;
  durationSeconds: number | null;
}

/**
 * Formats messages for Telegram with MarkdownV2 formatting.
 */
@Injectable()
export class MessageFormatter {
  constructor(private readonly translationService: TranslationService) {}

  /**
   * Format a single device status for display.
   */
  formatDeviceStatus(
    device: Device,
    customName?: string | null,
    locale?: string,
    timezone?: string,
  ): string {
    const msgs = this.translationService.getMessages(locale);
    const rawLabel = customName ?? device.label ?? device.macAddress;
    const label = escapeMarkdownV2(rawLabel);
    const status = device.lastStatus === PowerStatus.ON ? 'ON' : 'OFF';
    const lastSeen = device.lastSeenAt
      ? escapeMarkdownV2(
          this.formatDateTime(device.lastSeenAt, locale, timezone),
        )
      : msgs.LAST_SEEN_NEVER;
    const statusSince = device.statusChangedAt
      ? escapeMarkdownV2(
          this.formatDateTime(device.statusChangedAt, locale, timezone),
        )
      : null;

    let statusLine = msgs.DEVICE_STATUS(label, status, lastSeen, statusSince);

    if (device.batteryVoltage !== null) {
      const voltage = escapeMarkdownV2(formatVoltage(device.batteryVoltage));
      const pct = escapeMarkdownV2(
        String(batteryPercentage(device.batteryVoltage)),
      );
      statusLine += `\n${msgs.BATTERY_LEVEL(voltage, pct)}`;
    }

    return statusLine;
  }

  /**
   * Format all devices status as a single message.
   */
  formatAllDevicesStatus(
    devices: Array<{ device: Device; customName?: string | null }>,
    locale?: string,
    timezone?: string,
  ): string {
    const msgs = this.translationService.getMessages(locale);

    if (devices.length === 0) {
      return msgs.NO_DEVICES;
    }

    const header = `${boldMd(escapeMarkdownV2(msgs.DEVICE_STATUS_HEADER))}\n`;
    const statuses = devices
      .map(({ device, customName }) =>
        this.formatDeviceStatus(device, customName, locale, timezone),
      )
      .join('\n\n');

    return header + statuses;
  }

  /**
   * Format power lost notification.
   * Optionally appends battery level if the device has a UPS module.
   */
  formatPowerLost({
    deviceLabel,
    timestamp,
    locale,
    timezone,
    batteryVoltage,
  }: PowerEventMessageParams): string {
    const msgs = this.translationService.getMessages(locale);
    const label = escapeMarkdownV2(deviceLabel);
    const message = msgs.POWER_LOST(
      label,
      escapeMarkdownV2(this.formatDateTime(timestamp, locale, timezone)),
    );

    return this.appendBatteryLine(message, batteryVoltage, msgs);
  }

  /**
   * Format battery low SOS alert notification.
   */
  formatBatteryLowAlert(
    event: BatteryLowEvent,
    locale?: string,
    timezone?: string,
  ): string {
    const msgs = this.translationService.getMessages(locale);
    const label = escapeMarkdownV2(event.deviceLabel ?? 'Unknown Device');
    const voltage = escapeMarkdownV2(formatVoltage(event.batteryVoltage));
    const pct = escapeMarkdownV2(
      String(batteryPercentage(event.batteryVoltage)),
    );
    const time = escapeMarkdownV2(
      this.formatDateTime(event.timestamp, locale, timezone),
    );
    return msgs.BATTERY_LOW_ALERT(label, voltage, pct, time);
  }

  /**
   * Format power restored notification.
   * Optionally appends battery level if the device has a UPS module.
   */
  formatPowerRestored({
    deviceLabel,
    timestamp,
    durationSeconds,
    locale,
    timezone,
    batteryVoltage,
  }: PowerEventMessageParams): string {
    const msgs = this.translationService.getMessages(locale);
    const label = escapeMarkdownV2(deviceLabel);
    const duration =
      durationSeconds !== null
        ? escapeMarkdownV2(this.formatDuration(durationSeconds, locale))
        : msgs.DURATION_UNKNOWN;
    const message = msgs.POWER_RESTORED(
      label,
      escapeMarkdownV2(this.formatDateTime(timestamp, locale, timezone)),
      duration,
    );

    return this.appendBatteryLine(message, batteryVoltage, msgs);
  }

  /**
   * Format device online notification (first status report).
   */
  formatDeviceOnline(deviceLabel: string, locale?: string): string {
    const msgs = this.translationService.getMessages(locale);
    const label = escapeMarkdownV2(deviceLabel);
    return msgs.DEVICE_ONLINE(label);
  }

  /**
   * Format device offline notification (first status report).
   */
  formatDeviceOffline(deviceLabel: string, locale?: string): string {
    const msgs = this.translationService.getMessages(locale);
    const label = escapeMarkdownV2(deviceLabel);
    return msgs.DEVICE_OFFLINE(label);
  }

  /**
   * Format outage history for all devices using collapsed events.
   */
  formatHistory(
    deviceHistories: Array<{ label: string; events: CollapsedEvent[] }>,
    locale?: string,
    timezone?: string,
  ): string {
    const msgs = this.translationService.getMessages(locale);

    if (
      deviceHistories.length === 0 ||
      deviceHistories.every((d) => d.events.length === 0)
    ) {
      return msgs.NO_HISTORY;
    }

    const lines = [
      `${boldMd(escapeMarkdownV2(msgs.OUTAGE_HISTORY_HEADER(msgs.HISTORY_LAST_7_DAYS)))}\n`,
    ];

    let totalOutages = 0;
    let totalDowntimeSeconds = 0;

    for (const { label, events } of deviceHistories) {
      const escapedLabel = escapeMarkdownV2(label);
      lines.push(boldMd(escapedLabel));

      if (events.length === 0) {
        lines.push(`  ${msgs.NO_EVENTS_IN_PERIOD}\n`);
        continue;
      }

      for (const event of events) {
        const time = escapeMarkdownV2(
          this.formatDateTime(event.timestamp, locale, timezone),
        );
        const status =
          event.status === PowerStatus.ON
            ? `🟢 ${msgs.STATUS_ON}`
            : `🔴 ${msgs.STATUS_OFF}`;

        if (event.status === PowerStatus.OFF) {
          totalOutages++;
          if (event.duration !== null) {
            totalDowntimeSeconds += event.duration;
          }
        }

        const duration =
          event.duration !== null
            ? ` \\(${escapeMarkdownV2(this.formatDuration(event.duration, locale))}\\)`
            : '';
        lines.push(`  ${time} — ${status}${duration}`);
      }
      lines.push('');
    }

    // Outage summary
    if (totalOutages > 0) {
      const summaryDuration = escapeMarkdownV2(
        this.formatDuration(totalDowntimeSeconds, locale),
      );
      lines.push(
        `\u{1F4CA} ${escapeMarkdownV2(String(totalOutages))} / ${summaryDuration}`,
      );
    }

    const totalEvents = deviceHistories.reduce(
      (sum, d) => sum + d.events.length,
      0,
    );

    const result = lines.join('\n').trimEnd();

    return this.truncateMessage(result, totalEvents, msgs);
  }

  /**
   * Truncate a history message to fit within Telegram's character limit.
   * Removes event lines from the end and appends a truncation notice.
   */
  private truncateMessage(
    message: string,
    totalEvents: number,
    msgs: Messages,
  ): string {
    if (message.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
      return message;
    }

    const lines = message.split('\n');
    let shownEvents = totalEvents;

    while (
      lines.join('\n').trimEnd().length > TRUNCATION_SAFE_LENGTH &&
      shownEvents > 0
    ) {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith('  ') && lines[i].includes(' — ')) {
          lines.splice(i, 1);
          shownEvents--;
          break;
        }
      }
    }

    lines.push(msgs.HISTORY_TRUNCATED(shownEvents, totalEvents));

    return lines.join('\n').trimEnd();
  }

  /**
   * Format a date for display in the user's timezone.
   */
  formatDateTime(date: Date, locale?: string, timezone?: string): string {
    const intlLocale = this.getIntlLocale(locale);
    const tz = timezone ?? DEFAULT_TIMEZONE;

    return date.toLocaleString(intlLocale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    });
  }

  /**
   * Format duration in seconds to human-readable string.
   */
  formatDuration(seconds: number, locale?: string): string {
    const msgs = this.translationService.getMessages(locale);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}${msgs.DURATION_HOURS}`);
    if (minutes > 0) parts.push(`${minutes}${msgs.DURATION_MINUTES}`);
    if (parts.length === 0) parts.push(`${secs}${msgs.DURATION_SECONDS}`);

    return parts.join(' ');
  }

  /**
   * Append a battery level line to a message when battery voltage is present.
   * Returns the message unchanged for devices without a UPS module (null voltage).
   */
  private appendBatteryLine(
    message: string,
    batteryVoltage: number | null | undefined,
    msgs: Messages,
  ): string {
    if (batteryVoltage == null) {
      return message;
    }

    const voltage = escapeMarkdownV2(formatVoltage(batteryVoltage));
    const pct = escapeMarkdownV2(String(batteryPercentage(batteryVoltage)));
    return `${message}\n${msgs.BATTERY_LEVEL(voltage, pct)}`;
  }

  private getIntlLocale(locale?: string): string {
    const key = (locale ?? DEFAULT_LOCALE) as SupportedLocale;
    return LOCALE_INTL_MAP[key] ?? LOCALE_INTL_MAP[DEFAULT_LOCALE];
  }
}
