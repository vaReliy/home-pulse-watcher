/**
 * Supported locales and defaults for the Telegram bot i18n system.
 */

export const SUPPORTED_LOCALES = ['uk', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'uk';
export const DEFAULT_TIMEZONE = 'Europe/Kyiv';

/** Maps short locale codes to Intl locale strings for date/number formatting. */
export const LOCALE_INTL_MAP: Record<SupportedLocale, string> = {
  uk: 'uk-UA',
  en: 'en-US',
};
