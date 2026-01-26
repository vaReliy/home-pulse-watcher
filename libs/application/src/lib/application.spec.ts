import { BaseService } from './base-service.js';
import {
  ValidationError,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';

// Test implementation of BaseService
class TestService extends BaseService<{ name: string }, { greeting: string }> {
  protected validationRules(): LivrRules {
    return {
      name: ['required', 'string', { min_length: 2 }],
    };
  }

  protected async execute(
    params: { name: string },
    _context: ServiceContext
  ): Promise<{ greeting: string }> {
    return { greeting: `Hello, ${params.name}!` };
  }
}

// Service with no validation
class NoValidationService extends BaseService<
  Record<string, never>,
  { result: string }
> {
  protected validationRules(): LivrRules {
    return {};
  }

  protected async execute(): Promise<{ result: string }> {
    return { result: 'done' };
  }
}

describe('BaseService', () => {
  describe('run', () => {
    it('should validate input and return wrapped response', async () => {
      const service = new TestService();
      const result = await service.run({ name: 'World' });

      expect(result).toEqual({
        data: { greeting: 'Hello, World!' },
      });
    });

    it('should throw ValidationError for invalid input', async () => {
      const service = new TestService();

      await expect(service.run({ name: '' })).rejects.toThrow(ValidationError);
      await expect(service.run({} as { name: string })).rejects.toThrow(
        ValidationError
      );
    });

    it('should pass context to execute', async () => {
      const service = new TestService();
      const context: ServiceContext = { userId: '123', requestId: 'req-1' };

      // Use spy to verify context is passed
      const executeSpy = jest.spyOn(service as never, 'execute');

      await service.run({ name: 'Test' }, context);

      expect(executeSpy).toHaveBeenCalledWith({ name: 'Test' }, context);
    });

    it('should skip validation when no rules defined', async () => {
      const service = new NoValidationService();
      const result = await service.run({});

      expect(result).toEqual({ data: { result: 'done' } });
    });
  });
});
