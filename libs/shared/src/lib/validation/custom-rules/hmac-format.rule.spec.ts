import { hmacFormatRule } from './hmac-format.rule.js';

describe('hmacFormatRule', () => {
  it('returns undefined for a valid lowercase 64-char hex string', () => {
    expect(hmacFormatRule()()('a'.repeat(64))).toBeUndefined();
  });

  it('returns undefined for a valid uppercase 64-char hex string', () => {
    expect(hmacFormatRule()()('A'.repeat(64))).toBeUndefined();
  });

  it('returns undefined for a valid mixed-case 64-char hex string', () => {
    expect(hmacFormatRule()()('aB3f'.repeat(16))).toBeUndefined();
  });

  it('returns INVALID_HMAC_FORMAT for a string shorter than 64 chars', () => {
    expect(hmacFormatRule()()('a'.repeat(63))).toBe('INVALID_HMAC_FORMAT');
  });

  it('returns INVALID_HMAC_FORMAT for a string longer than 64 chars', () => {
    expect(hmacFormatRule()()('a'.repeat(65))).toBe('INVALID_HMAC_FORMAT');
  });

  it('returns INVALID_HMAC_FORMAT for a 64-char string with non-hex characters', () => {
    expect(hmacFormatRule()()('g'.repeat(64))).toBe('INVALID_HMAC_FORMAT');
  });

  it('returns INVALID_HMAC_FORMAT for a MarkdownV2-sensitive string', () => {
    expect(hmacFormatRule()()('*bold*_italic_'.padEnd(64, '0'))).toBe(
      'INVALID_HMAC_FORMAT',
    );
  });

  it('returns FORMAT_ERROR for non-string values', () => {
    expect(hmacFormatRule()()(123)).toBe('FORMAT_ERROR');
    expect(hmacFormatRule()()({})).toBe('FORMAT_ERROR');
    expect(hmacFormatRule()()(['a'.repeat(64)])).toBe('FORMAT_ERROR');
  });

  it('returns undefined for empty/null/undefined values (delegated to required rule)', () => {
    expect(hmacFormatRule()()(null)).toBeUndefined();
    expect(hmacFormatRule()()(undefined)).toBeUndefined();
    expect(hmacFormatRule()()('')).toBeUndefined();
  });
});
