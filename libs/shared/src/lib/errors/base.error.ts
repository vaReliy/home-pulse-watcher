/**
 * Base error class for all application errors.
 * Provides a consistent structure for error handling across layers.
 */
export abstract class BaseError extends Error {
  /** Unique error code for identifying error type */
  abstract readonly code: string;

  /** HTTP status code mapping for Interface layer */
  abstract readonly httpStatus: number;

  /** Additional error context/fields */
  readonly fields?: Record<string, unknown>;

  constructor(message: string, fields?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.fields = fields;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes error for JSON response
   */
  toJSON(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      ...(this.fields && { fields: this.fields }),
    };
  }
}

export interface ErrorResponse {
  code: string;
  message: string;
  fields?: Record<string, unknown>;
}
