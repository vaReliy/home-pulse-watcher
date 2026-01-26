import type LIVR from 'livr';
import {
  ValidationError,
  createValidator,
  type LivrRules,
  type ServiceContext,
  type ServiceResponse,
} from '@home-pulse-watcher/shared';

/**
 * Abstract base class for all Chista-style application services.
 *
 * Chista Principles:
 * 1. One service = one atomic business action
 * 2. Validation-First: LIVR validation before any logic
 * 3. Transport Agnostic: No Req/Res objects
 * 4. Standardized Output: Return { data: T } or throw errors
 *
 * @template TInput - Type of input parameters (before validation)
 * @template TOutput - Type of the data returned in ServiceResponse
 */
export abstract class BaseService<TInput, TOutput> {
  private validator: LIVR.Validator<TInput> | null = null;

  /**
   * Define LIVR validation rules for input parameters.
   * Return an empty object {} if no validation is needed.
   *
   * @example
   * validationRules(): LivrRules {
   *   return {
   *     macAddress: ['required', 'macAddress'],
   *     status: ['required', 'integer', { minNumber: 0 }, { maxNumber: 1 }],
   *   };
   * }
   */
  protected abstract validationRules(): LivrRules;

  /**
   * Execute the business logic after validation passes.
   * This is where the core service operation is implemented.
   *
   * @param params - Validated and potentially transformed input parameters
   * @param context - Service context with authenticated user/device info
   * @returns Promise resolving to the operation result
   * @throws DomainError for business rule violations
   * @throws NotFoundError when resources don't exist
   */
  protected abstract execute(
    params: TInput,
    context: ServiceContext
  ): Promise<TOutput>;

  /**
   * Public entry point for running the service.
   * Orchestrates: validation -> execution -> response wrapping.
   *
   * @param params - Raw input parameters (will be validated)
   * @param context - Service context (optional, defaults to empty)
   * @returns Promise resolving to ServiceResponse<TOutput>
   * @throws ValidationError if input validation fails
   * @throws DomainError if business rules are violated
   * @throws NotFoundError if required resources don't exist
   */
  async run(
    params: TInput,
    context: ServiceContext = {}
  ): Promise<ServiceResponse<TOutput>> {
    // Step 1: Validate input
    const validatedParams = this.validate(params);

    // Step 2: Execute business logic
    const result = await this.execute(validatedParams, context);

    // Step 3: Wrap in standard response
    return { data: result };
  }

  /**
   * Validates input parameters using LIVR.
   * Creates and caches the validator on first use.
   *
   * @param params - Raw input to validate
   * @returns Validated (and potentially transformed) parameters
   * @throws ValidationError if validation fails
   */
  private validate(params: TInput): TInput {
    const rules = this.validationRules();

    // Skip validation if no rules defined
    if (Object.keys(rules).length === 0) {
      return params;
    }

    // Lazy-initialize validator (cache for reuse)
    if (!this.validator) {
      this.validator = createValidator<TInput>(rules);
    }

    const validatedData = this.validator.validate(params);

    if (validatedData === false) {
      const errors = this.validator.getErrors();
      throw new ValidationError(errors as Record<string, string>);
    }

    return validatedData;
  }
}
