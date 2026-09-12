import { macAddressRule } from './mac-address.rule.js';

describe('macAddressRule', () => {
  it('returns undefined for a valid colon-separated MAC address', () => {
    expect(macAddressRule()()('AA:BB:CC:DD:EE:FF')).toBeUndefined();
  });

  it('returns undefined for a valid hyphen-separated MAC address', () => {
    expect(macAddressRule()()('aa-bb-cc-dd-ee-ff')).toBeUndefined();
  });

  it('returns undefined for a lowercase MAC address', () => {
    expect(macAddressRule()()('aa:bb:cc:dd:ee:ff')).toBeUndefined();
  });

  it('accepts mixed colon/hyphen separators (regex allows either per-octet, not just uniformly)', () => {
    // Documents actual behavior: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    // matches each separator position independently, so a mixed-separator
    // string is NOT rejected. Not treated as a gap to fix here per tester
    // scope (behavior, not a security-relevant format ambiguity).
    expect(macAddressRule()()('AA:BB-CC:DD:EE:FF')).toBeUndefined();
  });

  it('returns INVALID_MAC_ADDRESS for too few octets', () => {
    expect(macAddressRule()()('AA:BB:CC:DD:EE')).toBe('INVALID_MAC_ADDRESS');
  });

  it('returns INVALID_MAC_ADDRESS for too many octets', () => {
    expect(macAddressRule()()('AA:BB:CC:DD:EE:FF:00')).toBe(
      'INVALID_MAC_ADDRESS',
    );
  });

  it('returns INVALID_MAC_ADDRESS for non-hex characters', () => {
    expect(macAddressRule()()('GG:BB:CC:DD:EE:FF')).toBe('INVALID_MAC_ADDRESS');
  });

  it('returns INVALID_MAC_ADDRESS for a MAC address without separators', () => {
    expect(macAddressRule()()('AABBCCDDEEFF')).toBe('INVALID_MAC_ADDRESS');
  });

  it('returns FORMAT_ERROR for non-string values', () => {
    expect(macAddressRule()()(123456)).toBe('FORMAT_ERROR');
    expect(macAddressRule()()({})).toBe('FORMAT_ERROR');
  });

  it('returns undefined for empty/null/undefined values (delegated to required rule)', () => {
    expect(macAddressRule()()(null)).toBeUndefined();
    expect(macAddressRule()()(undefined)).toBeUndefined();
    expect(macAddressRule()()('')).toBeUndefined();
  });
});
