import type { Messages } from './messages.type.js';

/**
 * English translations for Telegram bot messages.
 */
export const messagesEn: Messages = {
  // Welcome & Registration
  WELCOME: `<b>Welcome to HomePulse Watcher!</b>

Your account has been created. Use /devices to see your linked devices.`,

  ALREADY_REGISTERED: `You are already registered! Use /help to see available commands.`,

  NOT_REGISTERED: `You are not registered. Use /start to create an account.`,

  // Commands
  HELP: `<b>Available Commands:</b>

/start - Register your account
/status - Show power status of all devices
/devices - List your linked devices
/history - Show outage history for current month
/help - Show this help message`,

  // Status
  NO_DEVICES: `You don't have any devices linked yet.

Contact your administrator to link a device to your account.`,

  DEVICE_STATUS_HEADER: 'Device Status:',
  DEVICE_STATUS: (label, status, lastSeen) =>
    `<b>${label}</b>: ${status === 'ON' ? '🟢' : '🔴'} ${status}\nLast seen: ${lastSeen}`,

  // Devices list
  YOUR_DEVICES_HEADER: 'Your Devices:',
  MAC_LABEL: 'MAC:',
  ROLE_LABEL: 'Role:',

  // Notifications
  POWER_LOST: (label, time) =>
    `⚡️ <b>Power Lost</b>

Device: <b>${label}</b>
Time: ${time}`,

  POWER_RESTORED: (label, time, duration) =>
    `✅ <b>Power Restored</b>

Device: <b>${label}</b>
Time: ${time}
Outage duration: ${duration}`,

  DEVICE_ONLINE: (label) => `📡 Device <b>${label}</b> is now online`,

  DEVICE_OFFLINE: (label) => `📡 Device <b>${label}</b> is now offline`,

  // History
  NO_HISTORY: 'No power events recorded this month.',
  NO_EVENTS_THIS_MONTH: 'No events this month',
  OUTAGE_HISTORY_HEADER: (monthName) => `Outage History — ${monthName}`,

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
  ERROR_GENERIC: 'Something went wrong. Please try again later.',
  ERROR_DEVICE_ALREADY_REGISTERED:
    'This device is already registered in the system.',
  ERROR_DEVICE_NOT_OWNED: `You don't have permission to access this device.`,
  ERROR_USER_ALREADY_EXISTS:
    'You are already registered! Use /help to see available commands.',
  ERROR_UNAUTHORIZED: 'You are not authorized to perform this action.',
};
