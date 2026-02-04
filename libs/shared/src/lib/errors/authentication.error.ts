import { BaseError } from './base.error.js';

/**
 * Error codes for authentication failures.
 */
export const AuthenticationErrorCode = {
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EXPIRED_TIMESTAMP: 'EXPIRED_TIMESTAMP',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
} as const;

export type AuthenticationErrorCodeType =
  (typeof AuthenticationErrorCode)[keyof typeof AuthenticationErrorCode];

/**
 * Thrown when authentication fails (HMAC verification, missing credentials, etc.).
 * Maps to HTTP 401 Unauthorized.
 */
export class AuthenticationError extends BaseError {
  readonly code: AuthenticationErrorCodeType;
  readonly httpStatus = 401;

  constructor(
    message: string,
    code: AuthenticationErrorCodeType = AuthenticationErrorCode.INVALID_CREDENTIALS,
    fields?: Record<string, unknown>,
  ) {
    super(message, fields);
    this.code = code;
  }
}
