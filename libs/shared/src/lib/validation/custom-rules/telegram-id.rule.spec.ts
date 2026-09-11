import { telegramIdRule } from './telegram-id.rule.js';

describe('telegramIdRule', () => {
  it('returns undefined for a valid numeric string', () => {
    expect(telegramIdRule()()('123456789')).toBeUndefined();
  });

  it('returns undefined for a single-digit numeric string', () => {
    expect(telegramIdRule()()('0')).toBeUndefined();
  });

  it('returns undefined for a very large numeric string (beyond Number.MAX_SAFE_INTEGER)', () => {
    expect(telegramIdRule()()('99999999999999999999')).toBeUndefined();
  });

  it('returns INVALID_TELEGRAM_ID for a negative numeric string', () => {
    expect(telegramIdRule()()('-123')).toBe('INVALID_TELEGRAM_ID');
  });

  it('returns INVALID_TELEGRAM_ID for a decimal numeric string', () => {
    expect(telegramIdRule()()('123.45')).toBe('INVALID_TELEGRAM_ID');
  });

  it('returns INVALID_TELEGRAM_ID for a string with leading/trailing whitespace', () => {
    expect(telegramIdRule()()(' 123 ')).toBe('INVALID_TELEGRAM_ID');
  });

  it('returns INVALID_TELEGRAM_ID for a MarkdownV2-sensitive string', () => {
    expect(telegramIdRule()()('123_456')).toBe('INVALID_TELEGRAM_ID');
    expect(telegramIdRule()()('*123*')).toBe('INVALID_TELEGRAM_ID');
  });

  it('returns INVALID_TELEGRAM_ID for a non-numeric string', () => {
    expect(telegramIdRule()()('abc')).toBe('INVALID_TELEGRAM_ID');
  });

  it('returns FORMAT_ERROR for non-string values', () => {
    expect(telegramIdRule()()(123456789)).toBe('FORMAT_ERROR');
    expect(telegramIdRule()()({})).toBe('FORMAT_ERROR');
  });

  it('returns undefined for empty/null/undefined values (delegated to required rule)', () => {
    expect(telegramIdRule()()(null)).toBeUndefined();
    expect(telegramIdRule()()(undefined)).toBeUndefined();
    expect(telegramIdRule()()('')).toBeUndefined();
  });
});
