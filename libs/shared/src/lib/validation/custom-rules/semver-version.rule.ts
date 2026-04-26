/**
 * LIVR custom rule for validating semver version strings.
 * Accepts: MAJOR.MINOR.PATCH and MAJOR.MINOR.PATCH-prerelease (e.g. 1.2.3, 1.2.3-alpha.1)
 *
 * Usage in LIVR schema: { currentVersion: ['required', 'string', 'semverVersion'] }
 */
export function semverVersionRule(): () => (
  value: unknown,
) => string | undefined {
  return () => {
    return (value: unknown): string | undefined => {
      // Empty values are handled by 'required' rule
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      if (typeof value !== 'string') {
        return 'FORMAT_ERROR';
      }

      // Semver pattern: MAJOR.MINOR.PATCH with optional pre-release label
      const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

      if (!semverPattern.test(value)) {
        return 'INVALID_SEMVER_VERSION';
      }

      return undefined;
    };
  };
}
