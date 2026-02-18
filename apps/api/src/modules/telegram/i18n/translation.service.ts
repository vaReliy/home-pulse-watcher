import { Injectable } from '@nestjs/common';
import type { Messages } from './messages.type.js';
import type { SupportedLocale } from './locale.config.js';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locale.config.js';
import { messagesEn } from './messages.en.js';
import { messagesUk } from './messages.uk.js';

const MESSAGES_MAP: Record<SupportedLocale, Messages> = {
  en: messagesEn,
  uk: messagesUk,
};

/**
 * Provides locale-aware message strings for the Telegram bot.
 */
@Injectable()
export class TranslationService {
  /** Returns the Messages object for the given locale, falling back to the default. */
  getMessages(locale?: string): Messages {
    if (locale && SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
      return MESSAGES_MAP[locale as SupportedLocale];
    }
    return MESSAGES_MAP[DEFAULT_LOCALE];
  }
}
