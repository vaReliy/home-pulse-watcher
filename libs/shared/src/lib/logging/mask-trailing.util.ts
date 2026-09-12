/** Default number of trailing characters kept visible by {@link maskTrailing}. */
const DEFAULT_VISIBLE_CHARS = 4;

/**
 * Truncates a string for log output, keeping only its last `visibleChars`
 * characters. Used for PII-adjacent identifiers (MAC addresses, Telegram
 * IDs, chat/user IDs) that tie a log line to a specific device or person and
 * must never be logged in full — see docs/KNOWLEDGE_INBOX.md "Debug-log PII
 * redaction".
 * @param value - The raw identifier to mask.
 * @param visibleChars - Trailing character count to keep (default 4).
 * @returns `...XXXX`-style suffix, or `***` when `value.length <= visibleChars`.
 */
export function maskTrailing(
  value: string,
  visibleChars: number = DEFAULT_VISIBLE_CHARS,
): string {
  if (value.length <= visibleChars) {
    return '***';
  }
  return `...${value.slice(-visibleChars)}`;
}
