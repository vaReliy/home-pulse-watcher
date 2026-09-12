import type { Messages } from './messages.type.js';

/**
 * English translations for Telegram bot messages (MarkdownV2).
 */
export const messagesEn: Messages = {
  // Welcome & Registration
  WELCOME: `*Welcome to HomePulse Watcher\\!*

Your account has been created\\. Use the menu below to navigate\\.`,

  ALREADY_REGISTERED:
    'You are already registered\\! Use the menu below to navigate\\.',

  NOT_REGISTERED:
    'You are not registered\\. Use /start to create an account\\.',

  // Commands
  HELP: `*How to use the bot:*

Use the menu buttons at the bottom of the screen:
📊 *Status* — current device status
📱 *My Devices* — list your devices
⚙️ *Settings* — language and timezone
❓ *Help* — this help message`,

  // Reply keyboard buttons
  BUTTON_STATUS: '📊 Status',
  BUTTON_DEVICES: '📱 My Devices',
  BUTTON_SETTINGS: '⚙️ Settings',
  BUTTON_HELP: '❓ Help',

  // Inline keyboard buttons
  BUTTON_CHECK_STATUS: '📊 Check Status',
  BUTTON_VIEW_HISTORY: '📋 View History',

  // Device management buttons
  BUTTON_MANAGE_DEVICE: (label) => `⚙️ ${label}`,
  BUTTON_RENAME: '✏️ Rename',
  BUTTON_DELETE: '🗑 Delete',
  BUTTON_ROTATE_SECRET: '🔑 Rotate Secret',
  BUTTON_REQUEST_OTA_CHECK: '🔄 Check OTA',
  BUTTON_CONFIRM_DELETE: '✅ Yes, delete',
  BUTTON_CANCEL: '❌ Cancel',

  // Settings
  SETTINGS_HEADER: '*Settings*',
  SETTINGS_LANGUAGE: '🌐 Language',
  SETTINGS_TIMEZONE: '🕐 Timezone',
  SETTINGS_LANGUAGE_HEADER: 'Choose language:',
  SETTINGS_TIMEZONE_HEADER: 'Choose timezone:',
  SETTINGS_LANGUAGE_UPDATED: 'Language updated\\!',
  SETTINGS_TIMEZONE_UPDATED: 'Timezone updated\\!',
  SETTINGS_CURRENT: (locale, timezone) =>
    `Language: ${locale}\nTimezone: ${timezone}`,

  // Catch-all
  UNKNOWN_COMMAND: 'Please use the menu buttons below to navigate\\.',

  // Status
  NO_DEVICES: `You don't have any devices linked yet\\.

Contact your administrator to link a device to your account\\.`,

  DEVICE_STATUS_HEADER: 'Device Status:',
  DEVICE_STATUS: (label, status, lastSeen, statusSince) =>
    `*${label}*: ${status === 'ON' ? '🟢' : '🔴'} ${status}${statusSince ? `\nStatus since: ${statusSince}` : ''}\nLast seen: ${lastSeen}`,

  // Devices list
  YOUR_DEVICES_HEADER: 'Your Devices:',
  MAC_LABEL: 'MAC:',
  ROLE_LABEL: 'Role:',
  FIRMWARE_LABEL: 'Firmware:',
  FIRMWARE_VERSION_UNKNOWN: 'n/a',
  RELEASE_CHANNEL_LABEL: 'Channel:',

  // Device management actions
  DEVICE_MENU_HEADER: (label) => `*${label}* — choose an action:`,
  DEVICE_RENAME_PROMPT: (label) => `Send the new name for *${label}*\\.`,
  DEVICE_RENAMED: (newLabel) => `Device renamed to *${newLabel}*\\.`,
  DEVICE_DELETE_CONFIRM: (label) =>
    `⚠️ Delete *${label}*\\? This removes the device, all user access, and its power event history\\. This cannot be undone\\.`,
  DEVICE_DELETED: (label) => `Device *${label}* deleted\\.`,
  DEVICE_DELETE_CANCELLED: 'Delete cancelled\\.',
  DEVICE_SECRET_ROTATED: (secret) =>
    `New device secret generated:\n\n${secret}\n\nThis will NOT be shown again\\. Update the device firmware with this secret\\.`,
  DEVICE_OTA_CHECK_REQUESTED: (label) =>
    `OTA check requested for *${label}*\\. The device will check for updates on its next status report\\.`,

  // Notifications
  POWER_LOST: (label, time) =>
    `⚡️ *Power Lost*

Device: *${label}*
Time: ${time}`,

  POWER_RESTORED: (label, time, duration) =>
    `✅ *Power Restored*

Device: *${label}*
Time: ${time}
Outage duration: ${duration}`,

  DEVICE_ONLINE: (label) => `📡 Device *${label}* is now online`,

  DEVICE_OFFLINE: (label) => `📡 Device *${label}* is now offline`,

  // Battery (UPS Edition)
  BATTERY_LEVEL: (voltage, percentage) =>
    `🔋 Battery: ${voltage}V \\(${percentage}%\\)`,

  BATTERY_LOW_ALERT: (label, voltage, percentage, time) =>
    `🆘 *Low Battery Alert\\!*

Device: *${label}*
Charge: ${voltage}V \\(${percentage}%\\)
Time: ${time}`,

  // History
  NO_HISTORY: 'No power events in the last 7 days\\.',
  NO_EVENTS_IN_PERIOD: 'No events',
  OUTAGE_HISTORY_HEADER: (period) => `Outage History — ${period}`,
  HISTORY_LAST_7_DAYS: 'last 7 days',
  HISTORY_TRUNCATED: (shown, total) =>
    `\\.\\.\\.showing ${shown} of ${total} events`,

  // Duration units
  DURATION_HOURS: 'h',
  DURATION_MINUTES: 'm',
  DURATION_SECONDS: 's',

  // Status labels
  LAST_SEEN_NEVER: 'Never',
  DURATION_UNKNOWN: 'Unknown',
  STATUS_ON: 'ON',
  STATUS_OFF: 'OFF',

  // Errors
  ERROR_GENERIC: 'Something went wrong\\. Please try again later\\.',
  ERROR_DEVICE_ALREADY_REGISTERED:
    'This device is already registered in the system\\.',
  ERROR_DEVICE_NOT_OWNED: `You don't have permission to access this device\\.`,
  ERROR_USER_ALREADY_EXISTS:
    'You are already registered\\! Use the menu below to navigate\\.',
  ERROR_UNAUTHORIZED: 'You are not authorized to perform this action\\.',
  ERROR_FORBIDDEN_ROLE: 'You are not authorized to perform this action\\.',
  ERROR_DEVICE_NOT_FOUND: 'Device not found\\.',
  ERROR_INVALID_LABEL: 'Invalid device name\\. Use up to 100 characters\\.',
};
