import { semverVersionRule } from './semver-version.rule.js';

describe('semverVersionRule', () => {
  // Locks the direct-invocation contract (semverVersionRule()()(value)) relied
  // on by ProcessPowerStatusService.sanitizeFirmwareVersion, which calls the
  // rule's innermost fn directly instead of going through Validator/schema.
  it('returns INVALID_SEMVER_VERSION for a non-semver string', () => {
    expect(semverVersionRule()()('test')).toBe('INVALID_SEMVER_VERSION');
  });

  it('returns undefined for a valid semver version', () => {
    expect(semverVersionRule()()('3.5.3-alpha.1')).toBeUndefined();
  });

  it('returns undefined for a valid semver version without pre-release', () => {
    expect(semverVersionRule()()('1.2.3')).toBeUndefined();
  });

  it('returns FORMAT_ERROR for non-string values', () => {
    expect(semverVersionRule()()(123)).toBe('FORMAT_ERROR');
  });

  it('returns undefined for empty/null/undefined values (delegated to required rule)', () => {
    expect(semverVersionRule()()(null)).toBeUndefined();
    expect(semverVersionRule()()(undefined)).toBeUndefined();
    expect(semverVersionRule()()('')).toBeUndefined();
  });
});
