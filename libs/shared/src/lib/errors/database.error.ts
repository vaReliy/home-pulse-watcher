import { BaseError } from './base.error.js';

/**
 * Error codes for database operation failures.
 */
export const DatabaseErrorCode = {
  UNIQUE_CONSTRAINT: 'UNIQUE_CONSTRAINT',
  FOREIGN_KEY_CONSTRAINT: 'FOREIGN_KEY_CONSTRAINT',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  QUERY_ERROR: 'QUERY_ERROR',
} as const;

export type DatabaseErrorCodeType =
  (typeof DatabaseErrorCode)[keyof typeof DatabaseErrorCode];

/**
 * Thrown when a database operation fails.
 * Translates infrastructure-level (Prisma) errors into domain-friendly errors.
 */
export class DatabaseError extends BaseError {
  readonly code: DatabaseErrorCodeType;
  readonly httpStatus: number;

  constructor(
    code: DatabaseErrorCodeType,
    message: string,
    fields?: Record<string, unknown>,
  ) {
    super(message, fields);
    this.code = code;
    this.httpStatus = this.resolveHttpStatus(code);
  }

  private resolveHttpStatus(code: DatabaseErrorCodeType): number {
    switch (code) {
      case DatabaseErrorCode.UNIQUE_CONSTRAINT:
        return 409;
      case DatabaseErrorCode.CONNECTION_FAILED:
        return 503;
      default:
        return 500;
    }
  }
}
