import { BaseError } from './base.error.js';

/**
 * Thrown when LIVR validation fails.
 * Maps to HTTP 400 Bad Request.
 */
export class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;

  /**
   * LIVR error format: { fieldName: 'ERROR_CODE' }
   */
  readonly validationErrors: Record<string, string>;

  constructor(validationErrors: Record<string, string>) {
    const message = 'Validation failed';
    super(message, { errors: validationErrors });
    this.validationErrors = validationErrors;
  }

  override toJSON() {
    return {
      code: this.code,
      message: this.message,
      errors: this.validationErrors,
    };
  }
}
