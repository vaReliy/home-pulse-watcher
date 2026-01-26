import { BaseError } from './base.error.js';

/**
 * Thrown when a requested resource does not exist.
 * Maps to HTTP 404 Not Found.
 */
export class NotFoundError extends BaseError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;

  /** The type of resource that was not found */
  readonly resourceType: string;

  /** The identifier used to search for the resource */
  readonly identifier: string;

  constructor(resourceType: string, identifier: string) {
    const message = `${resourceType} not found: ${identifier}`;
    super(message, { resourceType, identifier });
    this.resourceType = resourceType;
    this.identifier = identifier;
  }
}
