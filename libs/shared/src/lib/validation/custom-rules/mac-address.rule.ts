/**
 * LIVR custom rule for validating MAC addresses.
 * Accepts formats: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX (case-insensitive)
 *
 * Usage in LIVR schema: { macAddress: 'macAddress' }
 */
export function macAddressRule(): () => (value: unknown) => string | undefined {
  return () => {
    return (value: unknown): string | undefined => {
      // Empty values are handled by 'required' rule
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      if (typeof value !== 'string') {
        return 'FORMAT_ERROR';
      }

      // MAC address pattern: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
      const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

      if (!macPattern.test(value)) {
        return 'INVALID_MAC_ADDRESS';
      }

      return undefined;
    };
  };
}
