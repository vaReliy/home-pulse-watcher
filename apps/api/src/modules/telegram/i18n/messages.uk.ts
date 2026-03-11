import type { Messages } from './messages.type.js';

/**
 * Ukrainian translations for Telegram bot messages (MarkdownV2).
 */
export const messagesUk: Messages = {
  // Welcome & Registration
  WELCOME: `*Ласкаво просимо до HomePulse Watcher\\!*

Ваш обліковий запис створено\\. Використовуйте меню нижче для навігації\\.`,

  ALREADY_REGISTERED:
    'Ви вже зареєстровані\\! Використовуйте меню нижче для навігації\\.',

  NOT_REGISTERED:
    'Ви не зареєстровані\\. Використовуйте /start щоб створити обліковий запис\\.',

  // Commands
  HELP: `*Як користуватися ботом:*

Використовуйте кнопки меню внизу екрану:
📊 *Статус* — поточний стан пристроїв
📱 *Пристрої* — список ваших пристроїв
⚙️ *Налаштування* — мова та часовий пояс
❓ *Довідка* — ця довідка`,

  // Reply keyboard buttons
  BUTTON_STATUS: '📊 Статус',
  BUTTON_DEVICES: '📱 Пристрої',
  BUTTON_SETTINGS: '⚙️ Налаштування',
  BUTTON_HELP: '❓ Довідка',

  // Inline keyboard buttons
  BUTTON_CHECK_STATUS: '📊 Перевірити статус',
  BUTTON_VIEW_HISTORY: '📋 Переглянути історію',

  // Settings
  SETTINGS_HEADER: '*Налаштування*',
  SETTINGS_LANGUAGE: '🌐 Мова',
  SETTINGS_TIMEZONE: '🕐 Часовий пояс',
  SETTINGS_LANGUAGE_HEADER: 'Оберіть мову:',
  SETTINGS_TIMEZONE_HEADER: 'Оберіть часовий пояс:',
  SETTINGS_LANGUAGE_UPDATED: 'Мову змінено\\!',
  SETTINGS_TIMEZONE_UPDATED: 'Часовий пояс змінено\\!',
  SETTINGS_CURRENT: (locale, timezone) =>
    `Мова: ${locale}\nЧасовий пояс: ${timezone}`,

  // Catch-all
  UNKNOWN_COMMAND:
    'Будь ласка, використовуйте кнопки меню нижче для навігації\\.',

  // Status
  NO_DEVICES: `У вас ще немає підключених пристроїв\\.

Зверніться до адміністратора для підключення пристрою\\.`,

  DEVICE_STATUS_HEADER: 'Статус пристроїв:',
  DEVICE_STATUS: (label, status, lastSeen, statusSince) =>
    `*${label}*: ${status === 'ON' ? '🟢' : '🔴'} ${status === 'ON' ? 'Увімк' : 'Вимк'}${statusSince ? `\nСтатус з: ${statusSince}` : ''}\nОстаннє з\\'єднання: ${lastSeen}`,

  // Devices list
  YOUR_DEVICES_HEADER: 'Ваші пристрої:',
  MAC_LABEL: 'MAC:',
  ROLE_LABEL: 'Роль:',

  // Notifications
  POWER_LOST: (label, time) =>
    `⚡️ *Зникло електропостачання*

Пристрій: *${label}*
Час: ${time}`,

  POWER_RESTORED: (label, time, duration) =>
    `✅ *Електропостачання відновлено*

Пристрій: *${label}*
Час: ${time}
Тривалість відключення: ${duration}`,

  DEVICE_ONLINE: (label) => `📡 Пристрій *${label}* в мережі`,

  DEVICE_OFFLINE: (label) => `📡 Пристрій *${label}* офлайн`,

  // Battery (UPS Edition)
  BATTERY_LEVEL: (voltage, percentage) =>
    `🔋 Батарея: ${voltage}В \\(${percentage}%\\)`,

  BATTERY_LOW_ALERT: (label, voltage, percentage, time) =>
    `🆘 *Низький заряд батареї\\!*

Пристрій: *${label}*
Заряд: ${voltage}В \\(${percentage}%\\)
Час: ${time}`,

  // History
  NO_HISTORY: 'Немає подій за останні 7 днів\\.',
  NO_EVENTS_IN_PERIOD: 'Немає подій',
  OUTAGE_HISTORY_HEADER: (period) => `Історія відключень — ${period}`,
  HISTORY_LAST_7_DAYS: 'останні 7 днів',
  HISTORY_TRUNCATED: (shown, total) =>
    `\\.\\.\\.показано ${shown} з ${total} подій`,

  // Duration units
  DURATION_HOURS: 'год',
  DURATION_MINUTES: 'хв',
  DURATION_SECONDS: 'с',

  // Status labels
  LAST_SEEN_NEVER: 'Ніколи',
  DURATION_UNKNOWN: 'Невідомо',
  STATUS_ON: 'Увімк',
  STATUS_OFF: 'Вимк',

  // Errors
  ERROR_GENERIC: 'Щось пішло не так\\. Спробуйте пізніше\\.',
  ERROR_DEVICE_ALREADY_REGISTERED:
    'Цей пристрій вже зареєстрований у системі\\.',
  ERROR_DEVICE_NOT_OWNED: 'У вас немає доступу до цього пристрою\\.',
  ERROR_USER_ALREADY_EXISTS:
    'Ви вже зареєстровані\\! Використовуйте меню нижче для навігації\\.',
  ERROR_UNAUTHORIZED: 'У вас немає прав для виконання цієї дії\\.',
};
