import { BaseError } from './base.error.js';

/**
 * Error codes for business rule violations.
 * Add new codes as needed for different domain rules.
 */
export const DomainErrorCode = {
  DEVICE_ALREADY_REGISTERED: 'DEVICE_ALREADY_REGISTERED',
  DEVICE_NOT_OWNED: 'DEVICE_NOT_OWNED',
  INVALID_HMAC_SIGNATURE: 'INVALID_HMAC_SIGNATURE',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  DEVICE_ALREADY_LINKED: 'DEVICE_ALREADY_LINKED',
  DEVICE_NOT_LINKED: 'DEVICE_NOT_LINKED',
  UNAUTHORIZED_ACTION: 'UNAUTHORIZED_ACTION',
  BOARD_MISMATCH: 'BOARD_MISMATCH',
  INVALID_DEVICE_STATE: 'INVALID_DEVICE_STATE',
} as const;

export type DomainErrorCodeType =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

/**
 * Thrown when business rules are violated.
 * Maps to HTTP 422 Unprocessable Entity (or 409 Conflict for duplicates, 403 for forbidden).
 */
export class DomainError extends BaseError {
  readonly code: DomainErrorCodeType;
  readonly httpStatus: number;

  constructor(
    code: DomainErrorCodeType,
    message: string,
    fields?: Record<string, unknown>,
  ) {
    super(message, fields);
    this.code = code;
    this.httpStatus = this.resolveHttpStatus(code);
  }

  private resolveHttpStatus(code: DomainErrorCodeType): number {
    const conflictCodes: DomainErrorCodeType[] = [
      DomainErrorCode.DEVICE_ALREADY_REGISTERED,
      DomainErrorCode.USER_ALREADY_EXISTS,
      DomainErrorCode.DEVICE_ALREADY_LINKED,
    ];

    const forbiddenCodes: DomainErrorCodeType[] = [
      DomainErrorCode.UNAUTHORIZED_ACTION,
      DomainErrorCode.DEVICE_NOT_OWNED,
    ];

    /** Data-integrity violations that indicate a server-side bug, not a client error. */
    const internalCodes: DomainErrorCodeType[] = [
      DomainErrorCode.BOARD_MISMATCH,
      DomainErrorCode.INVALID_DEVICE_STATE,
    ];

    if (conflictCodes.includes(code)) return 409;
    if (forbiddenCodes.includes(code)) return 403;
    if (internalCodes.includes(code)) return 500;
    return 422;
  }
}
