import LIVR from 'livr';
import {
  macAddressRule,
  hmacFormatRule,
  powerStatusRule,
  telegramIdRule,
  semverVersionRule,
} from './custom-rules/index.js';

/** LIVR validation rules schema type */
export type LivrRules = Record<string, unknown>;

/** LIVR validation errors format */
export type LivrErrors = Record<string, string>;

/**
 * Configured LIVR validator with custom rules and auto-trim enabled.
 * Singleton pattern ensures rules are registered once.
 */
class LivrValidatorFactory {
  private static instance: LivrValidatorFactory;
  private initialized = false;

  static getInstance(): LivrValidatorFactory {
    if (!LivrValidatorFactory.instance) {
      LivrValidatorFactory.instance = new LivrValidatorFactory();
    }
    return LivrValidatorFactory.instance;
  }

  /**
   * Registers all custom validation rules.
   * Called once during application bootstrap.
   */
  initialize(): void {
    if (this.initialized) return;

    // Register custom rules globally (camelCase naming convention)
    LIVR.Validator.registerDefaultRules({
      macAddress: macAddressRule(),
      hmacFormat: hmacFormatRule(),
      powerStatus: powerStatusRule(),
      telegramId: telegramIdRule(),
      semverVersion: semverVersionRule(),
    });

    // Enable auto-trim for all string inputs
    LIVR.Validator.defaultAutoTrim(true);

    this.initialized = true;
  }

  /**
   * Creates a new LIVR validator instance with the given rules.
   * Automatically calls prepare() for immediate use.
   */
  createValidator<T = unknown>(rules: LivrRules): LIVR.Validator<T> {
    if (!this.initialized) {
      this.initialize();
    }

    const validator = new LIVR.Validator<T>(rules);
    validator.prepare();
    return validator;
  }
}

// Export singleton accessor
export const livrValidatorFactory = LivrValidatorFactory.getInstance();

/**
 * Convenience function to create a prepared validator.
 */
export function createValidator<T = unknown>(
  rules: LivrRules,
): LIVR.Validator<T> {
  return livrValidatorFactory.createValidator<T>(rules);
}
