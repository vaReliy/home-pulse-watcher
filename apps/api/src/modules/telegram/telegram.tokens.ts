/**
 * Dependency injection tokens for Telegram module components.
 */
export const TELEGRAM_TOKENS = {
  BOT: Symbol('TelegrafBot'),
  CONFIG: Symbol('TelegramConfig'),
} as const;
