/**
 * MarkdownV2 escaping utilities for Telegram messages.
 * Telegram MarkdownV2 requires escaping these characters:
 * _ * [ ] ( ) ~ ` > # + - = | { } . ! \
 */

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
