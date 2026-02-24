import { Markup } from 'telegraf';
import type { Messages } from '../i18n/messages.type.js';

/** Persistent 2x2 reply keyboard for the main menu. */
export function buildMainMenuKeyboard(msgs: Messages) {
  return Markup.keyboard([
    [msgs.BUTTON_STATUS, msgs.BUTTON_DEVICES],
    [msgs.BUTTON_SETTINGS, msgs.BUTTON_HELP],
  ]).resize();
}

/** Inline keyboard for the settings screen. */
export function buildSettingsKeyboard(msgs: Messages) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(msgs.SETTINGS_LANGUAGE, 'settings:language')],
    [Markup.button.callback(msgs.SETTINGS_TIMEZONE, 'settings:timezone')],
  ]);
}

/** Inline keyboard for language selection (language-neutral flag emojis). */
export function buildLanguageKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '\u{1F1FA}\u{1F1E6} \u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430',
        'lang:uk',
      ),
      Markup.button.callback('\u{1F1EC}\u{1F1E7} English', 'lang:en'),
    ],
  ]);
}

/** Inline keyboard for timezone selection. */
export function buildTimezoneKeyboard(msgs: Messages) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Europe/Kyiv', 'tz:Europe/Kyiv'),
      Markup.button.callback('Europe/London', 'tz:Europe/London'),
    ],
    [
      Markup.button.callback('Europe/Warsaw', 'tz:Europe/Warsaw'),
      Markup.button.callback('US/Eastern', 'tz:US/Eastern'),
    ],
  ]);
}

/** Single inline button to check device status (used in power lost notifications). */
export function buildCheckStatusButton(msgs: Messages) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(msgs.BUTTON_CHECK_STATUS, 'check_status')],
  ]);
}

/** Single inline button to view history (used in power restored notifications). */
export function buildViewHistoryButton(msgs: Messages) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(msgs.BUTTON_VIEW_HISTORY, 'view_history')],
  ]);
}
