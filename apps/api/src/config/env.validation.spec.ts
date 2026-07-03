import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.exit = jest.fn() as unknown as typeof process.exit;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    jest.restoreAllMocks();
  });

  const BASE_ENV = {
    DATABASE_URL: 'postgresql://localhost/test',
    DEVICE_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
    GCS_BUCKET_NAME: 'test-bucket',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
    ADMIN_UPLOAD_TOKEN: 'a'.repeat(32),
  };

  it('passes when all required vars are set', () => {
    process.env = { ...BASE_ENV };
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _, ...rest } = BASE_ENV;
    process.env = { ...rest };
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('passes when TELEGRAM_WEBHOOK_SECRET is missing outside production', () => {
    const { TELEGRAM_WEBHOOK_SECRET: _, ...rest } = BASE_ENV;
    process.env = { ...rest };
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits in production when TELEGRAM_WEBHOOK_SECRET is empty string', () => {
    process.env = {
      ...BASE_ENV,
      TELEGRAM_WEBHOOK_SECRET: '',
      NODE_ENV: 'production',
    };
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('exits in production when TELEGRAM_WEBHOOK_SECRET is shorter than 16 characters', () => {
    process.env = {
      ...BASE_ENV,
      TELEGRAM_WEBHOOK_SECRET: 'tooshort',
      NODE_ENV: 'production',
    };
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('passes in production when TELEGRAM_WEBHOOK_SECRET is exactly 16 characters', () => {
    process.env = {
      ...BASE_ENV,
      TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(16),
      NODE_ENV: 'production',
    };
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits in production when TELEGRAM_WEBHOOK_SECRET is missing', () => {
    const { TELEGRAM_WEBHOOK_SECRET: _, ...rest } = BASE_ENV;
    process.env = { ...rest, NODE_ENV: 'production' };
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('passes when ADMIN_UPLOAD_TOKEN is missing outside production', () => {
    const { ADMIN_UPLOAD_TOKEN: _, ...rest } = BASE_ENV;
    process.env = { ...rest };
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits in production when ADMIN_UPLOAD_TOKEN is missing', () => {
    const { ADMIN_UPLOAD_TOKEN: _, ...rest } = BASE_ENV;
    process.env = { ...rest, NODE_ENV: 'production' };
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('exits in production when ADMIN_UPLOAD_TOKEN is shorter than 32 characters', () => {
    process.env = {
      ...BASE_ENV,
      ADMIN_UPLOAD_TOKEN: 'a'.repeat(31),
      NODE_ENV: 'production',
    };
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('logs CRITICAL JSON in production on failure', () => {
    const { TELEGRAM_WEBHOOK_SECRET: _, ...rest } = BASE_ENV;
    process.env = { ...rest, NODE_ENV: 'production' };
    validateEnv();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"severity":"CRITICAL"'),
    );
  });
});
