import { normalizePemKey } from '../modules/storage/pem-key.util.js';

interface RequiredVar {
  name: string;
  validate?: (value: string) => string | null;
}

interface OptionalVar {
  name: string;
  validate: (value: string) => string | null;
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
 * Required only in production — Cloud Run scales to zero, so prod always runs
 * webhook mode (this secret guards it). Dev/test use Telegram long-polling instead.
 */
const PRODUCTION_REQUIRED_VARS: RequiredVar[] = [
  {
    name: 'TELEGRAM_WEBHOOK_SECRET',
    validate: (value) =>
      value.length >= 16
        ? null
        : 'must be at least 16 characters (empty or short secrets allow timing-safe bypass)',
  },
];

const OPTIONAL_VARS: OptionalVar[] = [
  {
    name: 'ADMIN_UPLOAD_TOKEN',
    validate: (value) =>
      value.length >= 32
        ? null
        : 'must be at least 32 characters (bearer token guarding /admin/firmware)',
  },
  {
    name: 'GCP_SERVICE_ACCOUNT_KEY',
    validate: (value) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return 'must be valid JSON';
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('client_email' in parsed) ||
        !('private_key' in parsed)
      ) {
        return 'must be a service account JSON containing client_email and private_key';
      }
      // Normalize and validate private_key PEM format early at startup.
      const key = (parsed as Record<string, unknown>)['private_key'];
      if (typeof key === 'string') {
        const normalized = normalizePemKey(key);
        if (!normalized.startsWith('-----BEGIN')) {
          return 'private_key must be a valid PEM block starting with "-----BEGIN"';
        }
      }
      return null;
    },
  },
];

/**
 * Validates required environment variables at startup.
 * Logs a CRITICAL error and exits with code 1 if any required var is missing or invalid.
 * Must be called before NestFactory.create() — uses console.error since no logger is available yet.
 */
export function validateEnv(): void {
  const errors: string[] = [];

  const requiredVars =
    process.env['NODE_ENV'] === 'production'
      ? [...REQUIRED_VARS, ...PRODUCTION_REQUIRED_VARS]
      : REQUIRED_VARS;

  for (const { name, validate } of requiredVars) {
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

  for (const { name, validate } of OPTIONAL_VARS) {
    const value = process.env[name];
    if (value) {
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
