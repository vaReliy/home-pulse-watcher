import { maskTrailing } from './mask-trailing.util.js';

describe('maskTrailing', () => {
  it('keeps last 4 chars by default, prefixed with ...', () => {
    expect(maskTrailing('AA:BB:CC:DD:EE:FF')).toBe('...E:FF');
  });

  it('returns *** when value length equals the default visible chars', () => {
    expect(maskTrailing('abcd')).toBe('***');
  });

  it('returns *** when value length is below the default visible chars', () => {
    expect(maskTrailing('ab')).toBe('***');
  });

  it('returns *** for an empty string', () => {
    expect(maskTrailing('')).toBe('***');
  });

  it('supports a custom visibleChars count', () => {
    expect(maskTrailing('1234567890', 2)).toBe('...90');
  });

  it('returns *** when value length equals a custom visibleChars', () => {
    expect(maskTrailing('123', 3)).toBe('***');
  });

  it('masks a long numeric Telegram-style ID', () => {
    expect(maskTrailing('123456789012')).toBe('...9012');
  });
});
