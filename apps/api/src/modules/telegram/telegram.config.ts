/**
 * Telegram bot configuration interface.
 */
export interface TelegramConfig {
  botToken: string;
  adminChatId?: string;
  useWebhook: boolean;
  webhookDomain?: string;
}

/**
 * Validates and returns Telegram configuration from environment variables.
 * @throws Error if TELEGRAM_BOT_TOKEN is not set
 */
export function validateTelegramConfig(): TelegramConfig {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  return {
    botToken,
    adminChatId: process.env['TELEGRAM_ADMIN_CHAT_ID'],
    useWebhook: process.env['TELEGRAM_USE_WEBHOOK'] === 'true',
    webhookDomain: process.env['TELEGRAM_WEBHOOK_DOMAIN'],
  };
}
