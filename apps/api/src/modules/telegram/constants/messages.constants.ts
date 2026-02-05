/**
 * Telegram bot message templates.
 * Organized for i18n readiness - all user-facing strings in one place.
 */
export const MESSAGES = {
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
/help - Show this help message`,

  // Status
  NO_DEVICES: `You don't have any devices linked yet.

Contact your administrator to link a device to your account.`,

  DEVICE_STATUS: (
    label: string,
    status: 'ON' | 'OFF',
    lastSeen: string,
  ): string =>
    `<b>${label}</b>: ${status === 'ON' ? '🟢' : '🔴'} ${status}\nLast seen: ${lastSeen}`,

  // Notifications
  POWER_LOST: (label: string, time: string): string =>
    `⚡️ <b>Power Lost</b>

Device: <b>${label}</b>
Time: ${time}`,

  POWER_RESTORED: (label: string, time: string, duration: string): string =>
    `✅ <b>Power Restored</b>

Device: <b>${label}</b>
Time: ${time}
Outage duration: ${duration}`,

  DEVICE_ONLINE: (label: string): string =>
    `📡 Device <b>${label}</b> is now online`,

  DEVICE_OFFLINE: (label: string): string =>
    `📡 Device <b>${label}</b> is now offline`,

  // Errors - Generic
  ERROR_GENERIC: `Something went wrong. Please try again later.`,

  // Errors - Domain specific (mapped from DomainErrorCode)
  ERROR_DEVICE_ALREADY_REGISTERED: `This device is already registered in the system.`,
  ERROR_DEVICE_NOT_OWNED: `You don't have permission to access this device.`,
  ERROR_USER_ALREADY_EXISTS: `You are already registered! Use /help to see available commands.`,
  ERROR_UNAUTHORIZED: `You are not authorized to perform this action.`,
} as const;
