# Learning Guide - Phase 5 Concepts

## Concept 1: MarkdownV2 Escaping for Telegram

```typescript
// formatters/escape-markdown.ts

/** Escapes all MarkdownV2 special characters in a string. */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/** Wraps already-escaped text in bold MarkdownV2 syntax. */
export function boldMd(escapedText: string): string {
  return `*${escapedText}*`;
}

/** Wraps already-escaped text in inline code MarkdownV2 syntax. */
export function codeMd(text: string): string {
  // Inside code spans, only ` and \ need escaping
  const codeEscaped = text.replace(/([`\\])/g, '\\$1');
  return `\`${codeEscaped}\``;
}
```

**Why migrate from HTML to MarkdownV2?**

| Feature           | HTML (`parse_mode: 'HTML'`) | MarkdownV2 (`parse_mode: 'MarkdownV2'`) |
| ----------------- | --------------------------- | --------------------------------------- |
| Escape chars      | 3 (`&`, `<`, `>`)           | 19 (see below)                          |
| Nested formatting | Limited                     | Full support                            |
| Inline code       | `<code>text</code>`         | `` `text` ``                            |
| Spoilers          | Not supported               | `\|\|text\|\|`                          |
| Strikethrough     | `<s>text</s>`               | `~text~`                                |

MarkdownV2 is the more capable parse mode and aligns with Telegram's recommended direction.

**The 19 special characters that must be escaped:**

```
_ * [ ] ( ) ~ ` > # + - = | { } . ! \
```

**Escaping rules differ inside code spans:**

```
Body text:    escape ALL 19 characters with backslash
Code spans:   escape ONLY ` and \ (the other 17 are literal)
```

**Usage pattern — always escape before wrapping:**

```typescript
// ✅ Correct: escape first, then wrap in bold
const label = escapeMarkdownV2(rawLabel); // "Kitchen\\.1"
const bold = boldMd(label); // "*Kitchen\\.1*"

// ❌ Wrong: wrapping before escaping corrupts the * delimiters
const bold = boldMd(rawLabel); // "*Kitchen.1*"
const escaped = escapeMarkdownV2(bold); // "\\*Kitchen\\.1\\*" — broken
```

---

## Concept 2: Reply Keyboards vs Inline Keyboards

```typescript
// keyboards/keyboard.builder.ts
import { Markup } from 'telegraf';

/** Persistent 2x2 reply keyboard for the main menu. */
export function buildMainMenuKeyboard(msgs: Messages) {
  return Markup.keyboard([
    [msgs.BUTTON_STATUS, msgs.BUTTON_DEVICES],
    [msgs.BUTTON_SETTINGS, msgs.BUTTON_HELP],
  ]).resize();
}

/** Inline keyboard for the settings screen. */
export function buildSettingsKeyboard(msgs: Messages) {
  return Markup.inlineKeyboard([[Markup.button.callback(msgs.SETTINGS_LANGUAGE, 'settings:language')], [Markup.button.callback(msgs.SETTINGS_TIMEZONE, 'settings:timezone')]]);
}
```

**Why two keyboard types?**

| Property     | Reply Keyboard           | Inline Keyboard               |
| ------------ | ------------------------ | ----------------------------- |
| Location     | Replaces device keyboard | Attached to a message         |
| Persistence  | Stays until replaced     | Disappears with the message   |
| Input method | Sends text as message    | Sends callback data silently  |
| Handler      | `bot.hears()`            | `bot.action()`                |
| Use case     | Main menu navigation     | Contextual actions, sub-menus |

**Visual layout:**

```
Reply Keyboard (always visible):
┌──────────────────────────┐
│  [📊 Status] [📱 Devices] │
│  [⚙️ Settings] [❓ Help]  │
└──────────────────────────┘
  ↑ replaces the user's system keyboard

Inline Keyboard (attached to message):
┌──────────────────────────┐
│  ⚙️ Settings              │
│  Current: uk / Europe/Kyiv│
│                          │
│  [🌐 Language]            │
│  [🕐 Timezone]            │
└──────────────────────────┘
  ↑ buttons are part of the message
```

**`.resize()` is critical** — without it, the reply keyboard takes up half the screen on mobile. The `resize` flag tells Telegram to shrink buttons to fit their content.

---

## Concept 3: Button-Driven Navigation (hears + actions)

```typescript
// telegram.service.ts — setupHears()
this.bot.hears(this.translationService.getAllButtonTexts('BUTTON_STATUS'), async (ctx) => {
  await this.withAuth(ctx as TelegramContext, () => this.statusHandler.handle(ctx as TelegramContext));
});

// telegram.service.ts — setupActions()
this.bot.action('check_status', async (ctx) => {
  await ctx.answerCbQuery();
  await this.withAuth(ctx as TelegramContext, () => this.statusHandler.handle(ctx as TelegramContext));
});
```

**Why replace slash commands with buttons?**

```
Phase 4 (slash commands):
  User types: /status
  Bot replies: status message

Phase 5 (button-driven):
  User taps: [📊 Status] button on reply keyboard
  Bot matches text via hears(), replies: status message

  User taps: [Check Status] inline button on notification
  Bot matches callback via action(), replies: status message
```

**Registration order in TelegramService:**

```typescript
this.setupMiddleware(); // 1. Error handler
this.setupCommands(); // 2. /start (only slash command kept)
this.setupHears(); // 3. Reply keyboard text matching
this.setupActions(); // 4. Inline callback data matching
this.setupCatchAll(); // 5. Must be LAST — catches unrecognized text
```

The only slash command retained is `/start` (Telegram requires it for bot registration). All other navigation uses reply keyboard buttons.

---

## Concept 4: Locale-Aware Button Matching

```typescript
// i18n/translation.service.ts
type ButtonKey = 'BUTTON_STATUS' | 'BUTTON_DEVICES' | 'BUTTON_SETTINGS' | 'BUTTON_HELP';

/** Returns button text strings across all supported locales for a given button key. */
getAllButtonTexts(buttonKey: ButtonKey): string[] {
  return SUPPORTED_LOCALES.map((locale) => MESSAGES_MAP[locale][buttonKey]);
}

// Usage in telegram.service.ts
this.bot.hears(
  this.translationService.getAllButtonTexts('BUTTON_STATUS'),
  // getAllButtonTexts returns: ['📊 Статус', '📊 Status']
  handler,
);
```

**Why match all locales at once?**

```
Problem:
  User A (locale: uk) taps button → sends "📊 Статус"
  User B (locale: en) taps button → sends "📊 Status"
  Both must route to the same handler

Solution:
  bot.hears(['📊 Статус', '📊 Status'], handler)
  Telegraf matches if incoming text equals ANY string in the array
```

**How `bot.hears(string[])` works in Telegraf:**

```typescript
// Telegraf internally converts each string to an exact-match check.
// The array acts as OR — if ANY element matches, the handler fires.
bot.hears(['foo', 'bar'], handler);
// Equivalent to: if (text === 'foo' || text === 'bar') handler()
```

**The Messages interface enforces button keys exist in every locale:**

```typescript
// i18n/messages.type.ts
export interface Messages {
  BUTTON_STATUS: string;
  BUTTON_DEVICES: string;
  BUTTON_SETTINGS: string;
  BUTTON_HELP: string;
  // ... other keys
}
```

Adding a new locale requires implementing all button keys — the compiler catches missing translations.

---

## Concept 5: Callback Data Convention

```typescript
// keyboards/keyboard.builder.ts
Markup.button.callback(msgs.SETTINGS_LANGUAGE, 'settings:language');
Markup.button.callback(msgs.SETTINGS_TIMEZONE, 'settings:timezone');
Markup.button.callback('🇺🇦 Українська', 'lang:uk');
Markup.button.callback('🇬🇧 English', 'lang:en');
Markup.button.callback('Europe/Kyiv', 'tz:Europe/Kyiv');

// telegram.service.ts — static matching
this.bot.action('settings:language', handler);
this.bot.action('check_status', handler);

// telegram.service.ts — regex matching for dynamic values
this.bot.action(/^lang:(.+)$/, async (ctx) => {
  const newLocale = ctx.match[1]; // 'uk' or 'en'
});

this.bot.action(/^tz:(.+)$/, async (ctx) => {
  const newTimezone = ctx.match[1]; // 'Europe/Kyiv'
});
```

**Convention: `entity:action` or `entity:value`**

| Callback Data       | Pattern         | Captures      |
| ------------------- | --------------- | ------------- |
| `settings:language` | Static          | —             |
| `settings:timezone` | Static          | —             |
| `check_status`      | Static          | —             |
| `view_history`      | Static          | —             |
| `lang:uk`           | `/^lang:(.+)$/` | `uk`          |
| `tz:Europe/Kyiv`    | `/^tz:(.+)$/`   | `Europe/Kyiv` |

**Telegram's 64-byte limit on callback data:**

```
✅ 'lang:uk'              — 7 bytes
✅ 'tz:Europe/Kyiv'       — 14 bytes
✅ 'settings:language'    — 17 bytes
❌ 'user:123:device:456:action:configure:param:value'  — too long
```

Keep callback data short. Use entity IDs or codes, not full labels.

**Always validate dynamic values server-side:**

```typescript
const VALID_LOCALES = new Set(['uk', 'en']);
const VALID_TIMEZONES = new Set(['Europe/Kyiv', 'Europe/London', 'Europe/Warsaw', 'US/Eastern']);

this.bot.action(/^lang:(.+)$/, async (ctx) => {
  const newLocale = ctx.match[1];
  if (!VALID_LOCALES.has(newLocale)) return; // Silently ignore invalid
  // ... proceed
});
```

---

## Concept 6: Stateless Settings Flow

```typescript
// telegram.service.ts — settings:language action
this.bot.action('settings:language', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await this.resolveUser(ctx as TelegramContext);
  if (!user) return;
  const userMsgs = this.translationService.getMessages(user.locale);
  await ctx.editMessageText(userMsgs.SETTINGS_LANGUAGE_HEADER, {
    ...buildLanguageKeyboard(),
  });
});

// telegram.service.ts — lang:xx action
this.bot.action(/^lang:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const newLocale = ctx.match[1];
  if (!VALID_LOCALES.has(newLocale)) return;

  const user = await this.resolveUser(ctx as TelegramContext);
  if (!user) return;

  await this.userRepository.update(user.id, { locale: newLocale });

  const newMsgs = this.translationService.getMessages(newLocale);
  await ctx.editMessageText(newMsgs.SETTINGS_LANGUAGE_UPDATED, {
    parse_mode: 'MarkdownV2',
  });
  // Re-send reply keyboard with updated locale
  await ctx.reply(newMsgs.SETTINGS_HEADER, {
    parse_mode: 'MarkdownV2',
    ...buildMainMenuKeyboard(newMsgs),
  });
});
```

**Why no scenes or sessions?**

| Approach        | State Storage         | Complexity                            | Failure Mode    |
| --------------- | --------------------- | ------------------------------------- | --------------- |
| Scenes/Sessions | In-memory or Redis    | High — need session middleware        | Lost on restart |
| Stateless       | Database (User model) | Low — each callback is self-contained | None            |

**The flow uses `editMessageText()` for in-place sub-menus:**

```
User taps [⚙️ Settings]
  → Bot sends settings message with inline keyboard
     [🌐 Language]
     [🕐 Timezone]

User taps [🌐 Language]
  → Bot EDITS the same message (not a new one)
     "Choose language:"
     [🇺🇦 Українська] [🇬🇧 English]

User taps [🇬🇧 English]
  → Bot EDITS message to "Language updated ✓"
  → Bot sends NEW message with updated reply keyboard
```

**Why re-send the reply keyboard after locale change?**

Reply keyboard button labels are static text set at send time. After changing locale from `uk` to `en`, the old keyboard still shows Ukrainian labels. Sending a new message with `buildMainMenuKeyboard(newMsgs)` replaces the keyboard with English labels.

---

## Concept 7: Catch-All Handler Pattern

```typescript
// telegram.service.ts — setupCatchAll()
private setupCatchAll(): void {
  if (!this.bot) return;

  this.bot.on('text', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await this.userRepository.findByTelegramId(BigInt(telegramId));
    if (!user) return; // Ignore unregistered users silently

    const userMsgs = this.translationService.getMessages(user.locale);
    await ctx.reply(userMsgs.UNKNOWN_COMMAND, {
      parse_mode: 'MarkdownV2',
      ...buildMainMenuKeyboard(userMsgs), // Always re-attach keyboard
    });
  });
}
```

**Why registration order matters:**

```
Telegraf processes handlers in registration order (first match wins).

setupCommands()   → /start
setupHears()      → "📊 Status", "📱 Devices", "⚙️ Settings", "❓ Help"
setupActions()    → check_status, view_history, settings:*, lang:*, tz:*
setupCatchAll()   → anything else ← MUST BE LAST

If catch-all were registered first:
  User taps [📊 Status] → catch-all fires → "Unknown command" ← wrong!
```

**Why ignore unregistered users?**

```typescript
if (!user) return; // Don't reply to strangers

// Without this: random Telegram users discover the bot, send messages,
// get "Unknown command" replies — unnecessary traffic and information leak.
// With this: unregistered users get silence, registered users get help.
```

**Why always re-attach the reply keyboard?**

The reply keyboard can disappear if the user clears their chat or if Telegram's client resets. Attaching `buildMainMenuKeyboard(userMsgs)` to the catch-all reply ensures the keyboard is always restored, even from unexpected states.

---

## Concept 8: Inline Buttons in Notifications

```typescript
// keyboards/keyboard.builder.ts
export function buildCheckStatusButton(msgs: Messages) {
  return Markup.inlineKeyboard([[Markup.button.callback(msgs.BUTTON_CHECK_STATUS, 'check_status')]]);
}

export function buildViewHistoryButton(msgs: Messages) {
  return Markup.inlineKeyboard([[Markup.button.callback(msgs.BUTTON_VIEW_HISTORY, 'view_history')]]);
}

// listeners/power-status.listener.ts
const inlineKeyboard = event.isPowerLost ? buildCheckStatusButton(msgs) : event.isPowerRestored ? buildViewHistoryButton(msgs) : undefined;

await bot.telegram.sendMessage(chatId, message, {
  parse_mode: 'MarkdownV2',
  ...(inlineKeyboard ? inlineKeyboard : {}),
});
```

**Contextual buttons per notification type:**

```
Power Lost notification:
  ⚡ Power Lost
  Device: Kitchen
  Time: 24 Feb 2026, 14:30
  [Check Status]          ← inline button

Power Restored notification:
  ✅ Power Restored
  Device: Kitchen
  Duration: 2h 15m
  [View History]          ← inline button
```

**The `answerCbQuery()` requirement:**

```typescript
this.bot.action('check_status', async (ctx) => {
  await ctx.answerCbQuery(); // ← MUST call this
  await this.withAuth(ctx as TelegramContext, () => this.statusHandler.handle(ctx as TelegramContext));
});
```

Telegram requires every callback query to be answered within 30 seconds. If `answerCbQuery()` is not called, the user sees a spinning loader on the button that never resolves. The call acknowledges receipt — even if the handler subsequently fails.

**Error handling pattern — answer first, handle errors second:**

```typescript
this.bot.action('view_history', async (ctx) => {
  try {
    await ctx.answerCbQuery(); // Always answer first
    await this.withAuth(/* ... */); // Then do work
  } catch (error) {
    this.logger.error('Error in view_history action', error);
    await ctx.answerCbQuery().catch(() => {
      /* already answered */
    });
  }
});
```

The `.catch()` in the error branch prevents unhandled rejection if `answerCbQuery()` was already called in the try block.

---

## Quick Reference: Phase 5 Files

| Layer      | File                                 | Purpose                                                |
| ---------- | ------------------------------------ | ------------------------------------------------------ |
| Formatters | `formatters/escape-markdown.ts`      | `escapeMarkdownV2()`, `boldMd()`, `codeMd()` helpers   |
| Formatters | `formatters/escape-markdown.spec.ts` | Tests for MarkdownV2 escaping edge cases               |
| Formatters | `formatters/message.formatter.ts`    | MarkdownV2 formatting (migrated from HTML)             |
| Keyboards  | `keyboards/keyboard.builder.ts`      | Reply + inline keyboard factory functions              |
| Keyboards  | `keyboards/keyboard.builder.spec.ts` | Keyboard builder tests                                 |
| Keyboards  | `keyboards/index.ts`                 | Barrel export for keyboard builders                    |
| Handlers   | `handlers/settings.handler.ts`       | Settings screen with inline keyboard                   |
| Handlers   | `handlers/settings.handler.spec.ts`  | Settings handler tests                                 |
| Handlers   | `handlers/start.handler.ts`          | Updated — attaches reply keyboard on registration      |
| Handlers   | `handlers/status.handler.ts`         | Updated — MarkdownV2 parse mode                        |
| Handlers   | `handlers/devices.handler.ts`        | Updated — MarkdownV2 parse mode                        |
| Handlers   | `handlers/help.handler.ts`           | Updated — MarkdownV2 parse mode                        |
| Handlers   | `handlers/history.handler.ts`        | Updated — MarkdownV2 parse mode                        |
| Listeners  | `listeners/power-status.listener.ts` | Updated — inline buttons on notifications              |
| Service    | `telegram.service.ts`                | Updated — hears/actions/catch-all registration         |
| Module     | `telegram.module.ts`                 | Updated — SettingsHandler + KeyboardBuilder providers  |
| i18n       | `i18n/messages.type.ts`              | Updated — button keys, settings keys, catch-all key    |
| i18n       | `i18n/messages.en.ts`                | Updated — English button labels and settings strings   |
| i18n       | `i18n/messages.uk.ts`                | Updated — Ukrainian button labels and settings strings |
| i18n       | `i18n/translation.service.ts`        | Updated — `getAllButtonTexts()` method                 |
