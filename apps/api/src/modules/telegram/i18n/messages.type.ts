/**
 * Shape of all translatable Telegram bot messages.
 * Every locale must implement this interface.
 */
export interface Messages {
  // Welcome & Registration
  WELCOME: string;
  ALREADY_REGISTERED: string;
  NOT_REGISTERED: string;

  // Commands
  HELP: string;

  // Reply keyboard buttons
  BUTTON_STATUS: string;
  BUTTON_DEVICES: string;
  BUTTON_SETTINGS: string;
  BUTTON_HELP: string;

  // Inline keyboard buttons
  BUTTON_CHECK_STATUS: string;
  BUTTON_VIEW_HISTORY: string;

  // Device management buttons
  BUTTON_MANAGE_DEVICE: (label: string) => string;
  BUTTON_RENAME: string;
  BUTTON_DELETE: string;
  BUTTON_ROTATE_SECRET: string;
  BUTTON_REQUEST_OTA_CHECK: string;
  BUTTON_CONFIRM_DELETE: string;
  BUTTON_CANCEL: string;

  // Settings
  SETTINGS_HEADER: string;
  SETTINGS_LANGUAGE: string;
  SETTINGS_TIMEZONE: string;
  SETTINGS_LANGUAGE_HEADER: string;
  SETTINGS_TIMEZONE_HEADER: string;
  SETTINGS_LANGUAGE_UPDATED: string;
  SETTINGS_TIMEZONE_UPDATED: string;
  SETTINGS_CURRENT: (locale: string, timezone: string) => string;

  // Catch-all
  UNKNOWN_COMMAND: string;

  // Status
  NO_DEVICES: string;
  DEVICE_STATUS_HEADER: string;
  DEVICE_STATUS: (
    label: string,
    status: 'ON' | 'OFF',
    lastSeen: string,
    statusSince: string | null,
  ) => string;

  // Devices list
  YOUR_DEVICES_HEADER: string;
  MAC_LABEL: string;
  ROLE_LABEL: string;
  FIRMWARE_LABEL: string;
  FIRMWARE_VERSION_UNKNOWN: string;
  RELEASE_CHANNEL_LABEL: string;

  // Device management actions
  DEVICE_MENU_HEADER: (label: string) => string;
  DEVICE_RENAME_PROMPT: (label: string) => string;
  DEVICE_RENAMED: (newLabel: string) => string;
  DEVICE_DELETE_CONFIRM: (label: string) => string;
  DEVICE_DELETED: (label: string) => string;
  DEVICE_DELETE_CANCELLED: string;
  DEVICE_SECRET_ROTATED: (secret: string) => string;
  DEVICE_OTA_CHECK_REQUESTED: (label: string) => string;

  // Notifications
  POWER_LOST: (label: string, time: string) => string;
  POWER_RESTORED: (label: string, time: string, duration: string) => string;
  DEVICE_ONLINE: (label: string) => string;
  DEVICE_OFFLINE: (label: string) => string;

  // Battery (UPS Edition)
  BATTERY_LEVEL: (voltage: string, percentage: string) => string;
  BATTERY_LOW_ALERT: (
    label: string,
    voltage: string,
    percentage: string,
    time: string,
  ) => string;

  // History
  NO_HISTORY: string;
  NO_EVENTS_IN_PERIOD: string;
  OUTAGE_HISTORY_HEADER: (period: string) => string;
  HISTORY_LAST_7_DAYS: string;
  HISTORY_TRUNCATED: (shown: number, total: number) => string;

  // Duration units
  DURATION_HOURS: string;
  DURATION_MINUTES: string;
  DURATION_SECONDS: string;

  // Status labels
  LAST_SEEN_NEVER: string;
  DURATION_UNKNOWN: string;
  STATUS_ON: string;
  STATUS_OFF: string;

  // Errors
  ERROR_GENERIC: string;
  ERROR_DEVICE_ALREADY_REGISTERED: string;
  ERROR_DEVICE_NOT_OWNED: string;
  ERROR_USER_ALREADY_EXISTS: string;
  ERROR_UNAUTHORIZED: string;
  ERROR_FORBIDDEN_ROLE: string;
  ERROR_DEVICE_NOT_FOUND: string;
  ERROR_INVALID_LABEL: string;
}
