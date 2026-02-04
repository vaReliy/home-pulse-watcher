/**
 * LIVR custom rule for validating power status values.
 * Accepts only 0 (OFF) or 1 (ON).
 *
 * Usage in LIVR schema: { status: ['required', 'powerStatus'] }
 */
export function powerStatusRule(): () => (
  value: unknown,
) => string | undefined {
  return () => {
    return (value: unknown): string | undefined => {
      // Empty values are handled by 'required' rule
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      // Accept both number and string representations
      const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

      if (numValue !== 0 && numValue !== 1) {
        return 'INVALID_POWER_STATUS';
      }

      return undefined;
    };
  };
}
