import { Markup } from 'telegraf';
import { DeviceRole } from '@home-pulse-watcher/core';
import type { Messages } from '../i18n/messages.type.js';

/** One row per manageable device, callback `dev:menu:<deviceId>`. */
export interface ManageableDevice {
  id: string;
  label: string;
}

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

/**
 * One "manage" row per device the caller can act on (EDITOR or OWNER role).
 * VIEWER-only devices are omitted by the caller before passing devices here —
 * this keeps role filtering visible at the call site instead of buried here.
 */
export function buildDeviceManageKeyboard(
  msgs: Messages,
  devices: ManageableDevice[],
) {
  return Markup.inlineKeyboard(
    devices.map((device) => [
      Markup.button.callback(
        msgs.BUTTON_MANAGE_DEVICE(device.label),
        `dev:menu:${device.id}`,
      ),
    ]),
  );
}

/** Inline keyboard for the per-device action menu, filtered by the caller's role. */
export function buildDeviceActionKeyboard(
  msgs: Messages,
  deviceId: string,
  role: DeviceRole,
) {
  const rows = [];

  if (role === DeviceRole.EDITOR || role === DeviceRole.OWNER) {
    rows.push([
      Markup.button.callback(msgs.BUTTON_RENAME, `dev:rename:${deviceId}`),
    ]);
  }

  if (role === DeviceRole.OWNER) {
    rows.push([
      Markup.button.callback(
        msgs.BUTTON_ROTATE_SECRET,
        `dev:rotate:${deviceId}`,
      ),
    ]);
    rows.push([
      Markup.button.callback(
        msgs.BUTTON_REQUEST_OTA_CHECK,
        `dev:ota:${deviceId}`,
      ),
    ]);
    rows.push([
      Markup.button.callback(msgs.BUTTON_DELETE, `dev:delete:ask:${deviceId}`),
    ]);
  }

  return Markup.inlineKeyboard(rows);
}

/** Inline confirm/cancel keyboard for the destructive delete action. */
export function buildDeleteConfirmKeyboard(msgs: Messages, deviceId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        msgs.BUTTON_CONFIRM_DELETE,
        `dev:delete:yes:${deviceId}`,
      ),
      Markup.button.callback(msgs.BUTTON_CANCEL, `dev:delete:no:${deviceId}`),
    ],
  ]);
}
