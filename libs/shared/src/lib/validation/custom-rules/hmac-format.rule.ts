/**
 * LIVR custom rule for validating HMAC-SHA256 signature format.
 * Expects a 64-character hexadecimal string.
 *
 * Usage in LIVR schema: { signature: 'hmacFormat' }
 */
export function hmacFormatRule(): () => (value: unknown) => string | undefined {
  return () => {
    return (value: unknown): string | undefined => {
      // Empty values are handled by 'required' rule
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      if (typeof value !== 'string') {
        return 'FORMAT_ERROR';
      }

      // HMAC-SHA256 produces 64 hex characters
      const hmacPattern = /^[a-f0-9]{64}$/i;

      if (!hmacPattern.test(value)) {
        return 'INVALID_HMAC_FORMAT';
      }

      return undefined;
    };
  };
}
