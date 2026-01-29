import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { BigIntSerializerInterceptor } from './bigint-serializer.interceptor';

describe('BigIntSerializerInterceptor', () => {
  let interceptor: BigIntSerializerInterceptor;
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    interceptor = new BigIntSerializerInterceptor();
    mockExecutionContext = {} as ExecutionContext;
  });

  const createCallHandler = (data: unknown): CallHandler => ({
    handle: () => of(data),
  });

  describe('bigint conversion', () => {
    it('should convert bigint to string', (done) => {
      const handler = createCallHandler({ id: BigInt('123456789') });

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ id: '123456789' });
          done();
        },
      });
    });

    it('should handle large bigint values', (done) => {
      const largeNumber = BigInt('9007199254740993'); // > MAX_SAFE_INTEGER
      const handler = createCallHandler({ telegramId: largeNumber });

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ telegramId: '9007199254740993' });
          done();
        },
      });
    });
  });

  describe('nested objects', () => {
    it('should handle nested objects with bigint', (done) => {
      const data = {
        user: {
          id: 'user-1',
          telegramId: BigInt('123'),
          profile: {
            score: BigInt('999'),
          },
        },
      };
      const handler = createCallHandler(data);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({
            user: {
              id: 'user-1',
              telegramId: '123',
              profile: {
                score: '999',
              },
            },
          });
          done();
        },
      });
    });
  });

  describe('arrays', () => {
    it('should handle arrays with bigint', (done) => {
      const data = {
        ids: [BigInt('1'), BigInt('2'), BigInt('3')],
      };
      const handler = createCallHandler(data);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ ids: ['1', '2', '3'] });
          done();
        },
      });
    });

    it('should handle arrays of objects with bigint', (done) => {
      const data = [
        { id: BigInt('1'), name: 'Alice' },
        { id: BigInt('2'), name: 'Bob' },
      ];
      const handler = createCallHandler(data);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual([
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' },
          ]);
          done();
        },
      });
    });
  });

  describe('Date preservation', () => {
    it('should preserve Date objects', (done) => {
      const date = new Date('2026-01-01');
      const data = { createdAt: date };
      const handler = createCallHandler(data);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect((result as { createdAt: Date }).createdAt).toBe(date);
          expect(
            (result as { createdAt: Date }).createdAt instanceof Date,
          ).toBe(true);
          done();
        },
      });
    });
  });

  describe('null and undefined handling', () => {
    it('should handle null values', (done) => {
      const handler = createCallHandler(null);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toBeNull();
          done();
        },
      });
    });

    it('should handle undefined values', (done) => {
      const handler = createCallHandler(undefined);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toBeUndefined();
          done();
        },
      });
    });

    it('should handle objects with null properties', (done) => {
      const data = { id: BigInt('1'), name: null };
      const handler = createCallHandler(data);

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ id: '1', name: null });
          done();
        },
      });
    });
  });

  describe('primitive values', () => {
    it('should preserve string values', (done) => {
      const handler = createCallHandler({ name: 'test' });

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ name: 'test' });
          done();
        },
      });
    });

    it('should preserve number values', (done) => {
      const handler = createCallHandler({ count: 42 });

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ count: 42 });
          done();
        },
      });
    });

    it('should preserve boolean values', (done) => {
      const handler = createCallHandler({ active: true });

      interceptor.intercept(mockExecutionContext, handler).subscribe({
        next: (result) => {
          expect(result).toEqual({ active: true });
          done();
        },
      });
    });
  });
});
