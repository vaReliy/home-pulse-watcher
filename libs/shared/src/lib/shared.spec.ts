import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from './errors/index.js';
import {
  createValidator,
  hmacFormatRule,
  macAddressRule,
  telegramIdRule,
} from './validation/index.js';

describe('Errors', () => {
  describe('ValidationError', () => {
    it('should create with validation errors', () => {
      const errors = { email: 'REQUIRED', name: 'TOO_SHORT' };
      const error = new ValidationError(errors);

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.httpStatus).toBe(400);
      expect(error.validationErrors).toEqual(errors);
      expect(error.message).toBe('Validation failed');
    });

    it('should serialize to JSON correctly', () => {
      const errors = { email: 'REQUIRED' };
      const error = new ValidationError(errors);

      expect(error.toJSON()).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: { email: 'REQUIRED' },
      });
    });
  });

  describe('DomainError', () => {
    it('should map conflict codes to 409', () => {
      const error = new DomainError(
        DomainErrorCode.DEVICE_ALREADY_REGISTERED,
        'Device exists',
      );

      expect(error.httpStatus).toBe(409);
    });

    it('should map forbidden codes to 403', () => {
      const error = new DomainError(
        DomainErrorCode.UNAUTHORIZED_ACTION,
        'Not allowed',
      );

      expect(error.httpStatus).toBe(403);
    });

    it('should map other codes to 422', () => {
      const error = new DomainError(
        DomainErrorCode.INVALID_HMAC_SIGNATURE,
        'Invalid signature',
      );

      expect(error.httpStatus).toBe(422);
    });
  });

  describe('NotFoundError', () => {
    it('should create with resource type and identifier', () => {
      const error = new NotFoundError('Device', 'AA:BB:CC:DD:EE:FF');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.httpStatus).toBe(404);
      expect(error.resourceType).toBe('Device');
      expect(error.identifier).toBe('AA:BB:CC:DD:EE:FF');
      expect(error.message).toBe('Device not found: AA:BB:CC:DD:EE:FF');
    });
  });
});

describe('Validation', () => {
  describe('macAddressRule', () => {
    const rule = macAddressRule()();

    it('should accept valid MAC with colons', () => {
      expect(rule('AA:BB:CC:DD:EE:FF')).toBeUndefined();
    });

    it('should accept valid MAC with dashes', () => {
      expect(rule('AA-BB-CC-DD-EE-FF')).toBeUndefined();
    });

    it('should accept lowercase', () => {
      expect(rule('aa:bb:cc:dd:ee:ff')).toBeUndefined();
    });

    it('should reject invalid format', () => {
      expect(rule('invalid')).toBe('INVALID_MAC_ADDRESS');
      expect(rule('AA:BB:CC')).toBe('INVALID_MAC_ADDRESS');
    });

    it('should allow empty for optional fields', () => {
      expect(rule('')).toBeUndefined();
      expect(rule(null)).toBeUndefined();
      expect(rule(undefined)).toBeUndefined();
    });
  });

  describe('hmacFormatRule', () => {
    const rule = hmacFormatRule()();
    const validHmac = 'a'.repeat(64);

    it('should accept valid 64-char hex', () => {
      expect(rule(validHmac)).toBeUndefined();
    });

    it('should reject short strings', () => {
      expect(rule('a'.repeat(63))).toBe('INVALID_HMAC_FORMAT');
    });

    it('should reject non-hex characters', () => {
      expect(rule('g'.repeat(64))).toBe('INVALID_HMAC_FORMAT');
    });
  });

  describe('telegramIdRule', () => {
    const rule = telegramIdRule()();

    it('should accept valid numeric strings', () => {
      expect(rule('123456789')).toBeUndefined();
      expect(rule('0')).toBeUndefined();
      expect(rule('9999999999999999')).toBeUndefined();
    });

    it('should reject non-numeric strings', () => {
      expect(rule('user003')).toBe('INVALID_TELEGRAM_ID');
      expect(rule('abc123')).toBe('INVALID_TELEGRAM_ID');
      expect(rule('12.34')).toBe('INVALID_TELEGRAM_ID');
      expect(rule('-123')).toBe('INVALID_TELEGRAM_ID');
    });

    it('should allow empty for optional fields', () => {
      expect(rule('')).toBeUndefined();
      expect(rule(null)).toBeUndefined();
      expect(rule(undefined)).toBeUndefined();
    });
  });

  describe('createValidator', () => {
    it('should create and validate with LIVR rules', () => {
      const validator = createValidator({
        name: ['required', 'string'],
      });

      expect(validator.validate({ name: 'test' })).toEqual({ name: 'test' });
      expect(validator.validate({})).toBe(false);
      expect(validator.getErrors()).toEqual({ name: 'REQUIRED' });
    });
  });
});
