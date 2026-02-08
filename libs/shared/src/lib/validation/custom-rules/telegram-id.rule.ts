/**
 * LIVR custom rule for validating Telegram IDs.
 * Accepts only numeric strings (digits only).
 *
 * Usage in LIVR schema: { telegramId: ['string', 'telegramId'] }
 */
export function telegramIdRule(): () => (value: unknown) => string | undefined {
  return () => {
    return (value: unknown): string | undefined => {
      // Empty values are handled by 'required' rule
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      if (typeof value !== 'string') {
        return 'FORMAT_ERROR';
      }

      if (!/^\d+$/.test(value)) {
        return 'INVALID_TELEGRAM_ID';
      }

      return undefined;
    };
  };
}
