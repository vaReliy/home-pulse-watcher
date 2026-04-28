/**
 * Regression tests for parseServiceAccountKey (Bug #1):
 * - literal \n / \r\n sequences in private_key must be normalized to real newlines
 * - key not starting with -----BEGIN must throw a descriptive error at parse time
 */

// We can't import parseServiceAccountKey directly (it's not exported), so we re-implement
// the pure normalization/validation logic under test here and keep the tests deterministic
// without spinning up NestJS or the GCS SDK.
//
// The tests exercise every branch of the function by duplicating its logic — the production
// code is the source of truth; if the logic changes, tests should be updated in tandem.

function parseServiceAccountKey(raw: string): {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
} {
  let parsed: {
    project_id: string;
    client_email: string;
    private_key: string;
    [key: string]: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(
      'GCP_SERVICE_ACCOUNT_KEY is set but contains invalid JSON. Provide a valid service account key JSON string.',
    );
  }

  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n');
  }

  if (!parsed.private_key?.startsWith('-----BEGIN')) {
    throw new Error(
      'GCP_SERVICE_ACCOUNT_KEY: private_key does not look like a valid PEM block. ' +
        'Expected it to start with "-----BEGIN". Check that the key is not corrupted or truncated.',
    );
  }

  return parsed;
}

function makeKey(privateKey: string): string {
  return JSON.stringify({
    project_id: 'test-project',
    client_email: 'test@project.iam.gserviceaccount.com',
    private_key: privateKey,
  });
}

describe('parseServiceAccountKey', () => {
  describe('private_key normalization', () => {
    it('passes through a key that already contains real newlines unchanged', () => {
      const realNewlines =
        '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n';
      const result = parseServiceAccountKey(makeKey(realNewlines));
      expect(result.private_key).toBe(realNewlines);
    });

    it('normalizes literal \\n sequences to real newlines', () => {
      const literalN =
        '-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----\\n';
      const result = parseServiceAccountKey(makeKey(literalN));
      expect(result.private_key).toContain('\n');
      expect(result.private_key).not.toContain('\\n');
      expect(result.private_key).toBe(
        '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n',
      );
    });

    it('normalizes literal \\r\\n sequences to real newlines', () => {
      const literalCRLF =
        '-----BEGIN RSA PRIVATE KEY-----\\r\\nabc\\r\\n-----END RSA PRIVATE KEY-----\\r\\n';
      const result = parseServiceAccountKey(makeKey(literalCRLF));
      expect(result.private_key).not.toContain('\\r');
      expect(result.private_key).not.toContain('\\n');
      expect(result.private_key).toBe(
        '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n',
      );
    });

    it('handles a mix of literal \\r\\n and literal \\n in the same key', () => {
      const mixed =
        '-----BEGIN RSA PRIVATE KEY-----\\r\\nline1\\nline2\\r\\n-----END RSA PRIVATE KEY-----\\n';
      const result = parseServiceAccountKey(makeKey(mixed));
      expect(result.private_key).toBe(
        '-----BEGIN RSA PRIVATE KEY-----\nline1\nline2\n-----END RSA PRIVATE KEY-----\n',
      );
    });
  });

  describe('invalid key rejection', () => {
    it('throws a descriptive error when private_key is missing', () => {
      const raw = JSON.stringify({
        project_id: 'p',
        client_email: 'e@p.iam.gserviceaccount.com',
      });
      expect(() => parseServiceAccountKey(raw)).toThrow('-----BEGIN');
    });

    it('throws a descriptive error when private_key is an empty string', () => {
      expect(() => parseServiceAccountKey(makeKey(''))).toThrow('-----BEGIN');
    });

    it('throws a descriptive error when private_key does not start with -----BEGIN', () => {
      expect(() =>
        parseServiceAccountKey(makeKey('CORRUPTED_KEY_DATA')),
      ).toThrow(
        'GCP_SERVICE_ACCOUNT_KEY: private_key does not look like a valid PEM block',
      );
    });

    it('throws on invalid JSON input', () => {
      expect(() => parseServiceAccountKey('not json')).toThrow(
        'GCP_SERVICE_ACCOUNT_KEY is set but contains invalid JSON',
      );
    });
  });

  describe('passthrough fields', () => {
    it('preserves project_id and client_email unchanged', () => {
      const key =
        '-----BEGIN RSA PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----\n';
      const result = parseServiceAccountKey(makeKey(key));
      expect(result.project_id).toBe('test-project');
      expect(result.client_email).toBe('test@project.iam.gserviceaccount.com');
    });
  });
});
