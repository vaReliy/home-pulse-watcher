interface RequiredVar {
  name: string;
  validate?: (value: string) => string | null;
}

const REQUIRED_VARS: RequiredVar[] = [
  { name: 'DATABASE_URL' },
  {
    name: 'DEVICE_SECRET_ENCRYPTION_KEY',
    validate: (value) =>
      /^[0-9a-f]{64}$/i.test(value)
        ? null
        : 'must be exactly 64 hex characters (32 bytes for AES-256-GCM)',
  },
];

/**
 * Validates required environment variables at startup.
 * Logs a CRITICAL error and exits with code 1 if any required var is missing or invalid.
 * Must be called before NestFactory.create() — uses console.error since no logger is available yet.
 */
export function validateEnv(): void {
  const errors: string[] = [];

  for (const { name, validate } of REQUIRED_VARS) {
    const value = process.env[name];
    if (!value) {
      errors.push(`${name} is required but not set`);
      continue;
    }
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        errors.push(`${name}: ${validationError}`);
      }
    }
  }

  if (errors.length > 0) {
    const message = `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`;

    if (process.env['NODE_ENV'] === 'production') {
      console.error(JSON.stringify({ severity: 'CRITICAL', message }));
    } else {
      console.error(`[EnvValidation] CRITICAL: ${message}`);
    }
    process.exit(1);
  }
}
