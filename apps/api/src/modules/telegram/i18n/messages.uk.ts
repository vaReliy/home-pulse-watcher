import type { Messages } from './messages.type.js';

/**
 * Ukrainian translations for Telegram bot messages.
 */
export const messagesUk: Messages = {
  // Welcome & Registration
  WELCOME: `<b>Ласкаво просимо до HomePulse Watcher!</b>

Ваш обліковий запис створено. Використовуйте /devices щоб побачити ваші пристрої.`,

  ALREADY_REGISTERED: `Ви вже зареєстровані! Використовуйте /help щоб побачити доступні команди.`,

  NOT_REGISTERED: `Ви не зареєстровані. Використовуйте /start щоб створити обліковий запис.`,

  // Commands
  HELP: `<b>Доступні команди:</b>

/start - Зареєструвати обліковий запис
/status - Показати статус живлення пристроїв
/devices - Список ваших пристроїв
/history - Історія відключень за поточний місяць
/help - Показати цю довідку`,

  // Status
  NO_DEVICES: `У вас ще немає підключених пристроїв.

Зверніться до адміністратора для підключення пристрою.`,

  DEVICE_STATUS_HEADER: 'Статус пристроїв:',
  DEVICE_STATUS: (label, status, lastSeen) =>
    `<b>${label}</b>: ${status === 'ON' ? '🟢' : '🔴'} ${status === 'ON' ? 'Увімк' : 'Вимк'}\nОстаннє з'єднання: ${lastSeen}`,

  // Devices list
  YOUR_DEVICES_HEADER: 'Ваші пристрої:',
  MAC_LABEL: 'MAC:',
  ROLE_LABEL: 'Роль:',

  // Notifications
  POWER_LOST: (label, time) =>
    `⚡️ <b>Зникло електропостачання</b>

Пристрій: <b>${label}</b>
Час: ${time}`,

  POWER_RESTORED: (label, time, duration) =>
    `✅ <b>Електропостачання відновлено</b>

Пристрій: <b>${label}</b>
Час: ${time}
Тривалість відключення: ${duration}`,

  DEVICE_ONLINE: (label) => `📡 Пристрій <b>${label}</b> в мережі`,

  DEVICE_OFFLINE: (label) => `📡 Пристрій <b>${label}</b> офлайн`,

  // History
  NO_HISTORY: 'Немає подій за поточний місяць.',
  NO_EVENTS_THIS_MONTH: 'Немає подій за цей місяць',
  OUTAGE_HISTORY_HEADER: (monthName) => `Історія відключень — ${monthName}`,

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
  ERROR_GENERIC: 'Щось пішло не так. Спробуйте пізніше.',
  ERROR_DEVICE_ALREADY_REGISTERED: 'Цей пристрій вже зареєстрований у системі.',
  ERROR_DEVICE_NOT_OWNED: 'У вас немає доступу до цього пристрою.',
  ERROR_USER_ALREADY_EXISTS:
    'Ви вже зареєстровані! Використовуйте /help щоб побачити доступні команди.',
  ERROR_UNAUTHORIZED: 'У вас немає прав для виконання цієї дії.',
};
