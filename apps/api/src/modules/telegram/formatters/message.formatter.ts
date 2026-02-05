import { Injectable } from '@nestjs/common';
import type { Device } from '@home-pulse-watcher/core';
import { PowerStatus } from '@home-pulse-watcher/core';
import { MESSAGES } from '../constants/messages.constants.js';

/**
 * Formats messages for Telegram with HTML formatting.
 */
@Injectable()
export class MessageFormatter {
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
  formatDeviceStatus(device: Device, customName?: string | null): string {
    const rawLabel = customName ?? device.label ?? device.macAddress;
    const label = this.escapeHtml(rawLabel);
    const status = device.lastStatus === PowerStatus.ON ? 'ON' : 'OFF';
    const lastSeen = device.lastSeenAt
      ? this.formatDateTime(device.lastSeenAt)
      : 'Never';

    return MESSAGES.DEVICE_STATUS(label, status, lastSeen);
  }

  /**
   * Format all devices status as a single message.
   */
  formatAllDevicesStatus(
    devices: Array<{ device: Device; customName?: string | null }>,
  ): string {
    if (devices.length === 0) {
      return MESSAGES.NO_DEVICES;
    }

    const header = '<b>Device Status:</b>\n';
    const statuses = devices
      .map(({ device, customName }) => this.formatDeviceStatus(device, customName))
      .join('\n\n');

    return header + statuses;
  }

  /**
   * Format power lost notification.
   */
  formatPowerLost(deviceLabel: string, timestamp: Date): string {
    const label = this.escapeHtml(deviceLabel);
    return MESSAGES.POWER_LOST(label, this.formatDateTime(timestamp));
  }

  /**
   * Format power restored notification.
   */
  formatPowerRestored(
    deviceLabel: string,
    timestamp: Date,
    durationSeconds: number | null,
  ): string {
    const label = this.escapeHtml(deviceLabel);
    const duration =
      durationSeconds !== null
        ? this.formatDuration(durationSeconds)
        : 'Unknown';
    return MESSAGES.POWER_RESTORED(
      label,
      this.formatDateTime(timestamp),
      duration,
    );
  }

  /**
   * Format device online notification (first status report).
   */
  formatDeviceOnline(deviceLabel: string): string {
    const label = this.escapeHtml(deviceLabel);
    return MESSAGES.DEVICE_ONLINE(label);
  }

  /**
   * Format device offline notification (first status report).
   */
  formatDeviceOffline(deviceLabel: string): string {
    const label = this.escapeHtml(deviceLabel);
    return MESSAGES.DEVICE_OFFLINE(label);
  }

  /**
   * Format a date for display.
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  /**
   * Format duration in seconds to human-readable string.
   * Matches PowerEvent.formatDuration() for consistency.
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }
}
