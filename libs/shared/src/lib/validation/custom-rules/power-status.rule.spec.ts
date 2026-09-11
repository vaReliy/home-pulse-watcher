import { powerStatusRule } from './power-status.rule.js';

describe('powerStatusRule', () => {
  it('returns undefined for numeric 0', () => {
    expect(powerStatusRule()()(0)).toBeUndefined();
  });

  it('returns undefined for numeric 1', () => {
    expect(powerStatusRule()()(1)).toBeUndefined();
  });

  it('returns undefined for string "0"', () => {
    expect(powerStatusRule()()('0')).toBeUndefined();
  });

  it('returns undefined for string "1"', () => {
    expect(powerStatusRule()()('1')).toBeUndefined();
  });

  it('returns INVALID_POWER_STATUS for other numbers', () => {
    expect(powerStatusRule()()(2)).toBe('INVALID_POWER_STATUS');
    expect(powerStatusRule()()(-1)).toBe('INVALID_POWER_STATUS');
  });

  it('returns INVALID_POWER_STATUS for a non-numeric string', () => {
    expect(powerStatusRule()()('on')).toBe('INVALID_POWER_STATUS');
  });

  it('returns undefined for a string with trailing garbage (parseInt coercion accepts it)', () => {
    // parseInt('1abc', 10) === 1 — this rule's coercion accepts it, matching
    // its documented "accepts both number and string representations" contract.
    expect(powerStatusRule()()('1abc')).toBeUndefined();
  });

  it('returns INVALID_POWER_STATUS for boolean values', () => {
    expect(powerStatusRule()()(true)).toBe('INVALID_POWER_STATUS');
    expect(powerStatusRule()()(false)).toBe('INVALID_POWER_STATUS');
  });

  it('returns INVALID_POWER_STATUS for object/array values', () => {
    expect(powerStatusRule()()({})).toBe('INVALID_POWER_STATUS');
    expect(powerStatusRule()()([])).toBe('INVALID_POWER_STATUS');
  });

  it('returns undefined for empty/null/undefined values (delegated to required rule)', () => {
    expect(powerStatusRule()()(null)).toBeUndefined();
    expect(powerStatusRule()()(undefined)).toBeUndefined();
    expect(powerStatusRule()()('')).toBeUndefined();
  });
});
