import { Injectable } from '@nestjs/common';
import type { Device, PowerEvent } from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import { TranslationService } from '../i18n/index.js';
import {
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  LOCALE_INTL_MAP,
} from '../i18n/locale.config.js';
import type { SupportedLocale } from '../i18n/locale.config.js';

/**
 * Formats messages for Telegram with HTML formatting.
 */
@Injectable()
export class MessageFormatter {
  constructor(private readonly translationService: TranslationService) {}

  /**
   * Escape special HTML characters to prevent formatting issues.
   */
  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

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
    const label = this.escapeHtml(rawLabel);
    const status = device.lastStatus === PowerStatus.ON ? 'ON' : 'OFF';
    const lastSeen = device.lastSeenAt
      ? this.formatDateTime(device.lastSeenAt, locale, timezone)
      : msgs.LAST_SEEN_NEVER;

    return msgs.DEVICE_STATUS(label, status, lastSeen);
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

    const header = `<b>${msgs.DEVICE_STATUS_HEADER}</b>\n`;
    const statuses = devices
      .map(({ device, customName }) =>
        this.formatDeviceStatus(device, customName, locale, timezone),
      )
      .join('\n\n');

    return header + statuses;
  }

  /**
   * Format power lost notification.
   */
  formatPowerLost(
    deviceLabel: string,
    timestamp: Date,
    locale?: string,
    timezone?: string,
  ): string {
    const msgs = this.translationService.getMessages(locale);
    const label = this.escapeHtml(deviceLabel);
    return msgs.POWER_LOST(
      label,
      this.formatDateTime(timestamp, locale, timezone),
    );
  }

  /**
   * Format power restored notification.
   */
  formatPowerRestored(
    deviceLabel: string,
    timestamp: Date,
    durationSeconds: number | null,
    locale?: string,
    timezone?: string,
  ): string {
    const msgs = this.translationService.getMessages(locale);
    const label = this.escapeHtml(deviceLabel);
    const duration =
      durationSeconds !== null
        ? this.formatDuration(durationSeconds, locale)
        : msgs.DURATION_UNKNOWN;
    return msgs.POWER_RESTORED(
      label,
      this.formatDateTime(timestamp, locale, timezone),
      duration,
    );
  }

  /**
   * Format device online notification (first status report).
   */
  formatDeviceOnline(deviceLabel: string, locale?: string): string {
    const msgs = this.translationService.getMessages(locale);
    const label = this.escapeHtml(deviceLabel);
    return msgs.DEVICE_ONLINE(label);
  }

  /**
   * Format device offline notification (first status report).
   */
  formatDeviceOffline(deviceLabel: string, locale?: string): string {
    const msgs = this.translationService.getMessages(locale);
    const label = this.escapeHtml(deviceLabel);
    return msgs.DEVICE_OFFLINE(label);
  }

  /**
   * Format outage history for all devices.
   */
  formatHistory(
    deviceHistories: Array<{ label: string; events: PowerEvent[] }>,
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

    const intlLocale = this.getIntlLocale(locale);
    const tz = timezone ?? DEFAULT_TIMEZONE;

    const now = new Date();
    const monthName = now.toLocaleString(intlLocale, {
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    });
    const lines = [`<b>${msgs.OUTAGE_HISTORY_HEADER(monthName)}</b>\n`];

    for (const { label, events } of deviceHistories) {
      const escapedLabel = this.escapeHtml(label);
      lines.push(`<b>${escapedLabel}</b>`);

      if (events.length === 0) {
        lines.push(`  ${msgs.NO_EVENTS_THIS_MONTH}\n`);
        continue;
      }

      for (const event of events) {
        const time = this.formatDateTime(event.timestamp, locale, timezone);
        const status =
          event.status === PowerStatus.ON
            ? `🟢 ${msgs.STATUS_ON}`
            : `🔴 ${msgs.STATUS_OFF}`;
        const duration =
          event.duration !== null
            ? ` (${this.formatDuration(event.duration, locale)})`
            : '';
        lines.push(`  ${time} — ${status}${duration}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  /**
   * Format a date for display in the user's timezone.
   */
  formatDateTime(date: Date, locale?: string, timezone?: string): string {
    const intlLocale = this.getIntlLocale(locale);
    const tz = timezone ?? DEFAULT_TIMEZONE;

    return date.toLocaleString(intlLocale, {
      year: 'numeric',
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
    if (secs > 0 || parts.length === 0)
      parts.push(`${secs}${msgs.DURATION_SECONDS}`);

    return parts.join(' ');
  }

  private getIntlLocale(locale?: string): string {
    const key = (locale ?? DEFAULT_LOCALE) as SupportedLocale;
    return LOCALE_INTL_MAP[key] ?? LOCALE_INTL_MAP[DEFAULT_LOCALE];
  }
}
