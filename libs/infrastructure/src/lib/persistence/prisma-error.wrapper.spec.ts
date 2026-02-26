import { Prisma } from '@prisma/client';
import { NotFoundError, DatabaseError, DatabaseErrorCode } from '@home-pulse-watcher/shared';
import { withPrismaError } from './prisma-error.wrapper.js';

describe('withPrismaError', () => {
  it('should pass through successful results', async () => {
    const result = await withPrismaError('User', () =>
      Promise.resolve({ id: '1', name: 'test' }),
    );
    expect(result).toEqual({ id: '1', name: 'test' });
  });

  it('should re-throw non-Prisma errors unchanged', async () => {
    const error = new Error('some random error');
    await expect(
      withPrismaError('User', () => Promise.reject(error)),
    ).rejects.toBe(error);
  });

  describe('PrismaClientKnownRequestError', () => {
    it('should map P2025 to NotFoundError', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '7.0.0' },
      );

      await expect(
        withPrismaError('Device', () => Promise.reject(prismaError)),
      ).rejects.toThrow(NotFoundError);

      try {
        await withPrismaError('Device', () => Promise.reject(prismaError));
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundError);
        expect((e as NotFoundError).resourceType).toBe('Device');
      }
    });

    it('should map P2002 to DatabaseError with UNIQUE_CONSTRAINT', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.0.0' },
      );

      try {
        await withPrismaError('User', () => Promise.reject(prismaError));
      } catch (e) {
        expect(e).toBeInstanceOf(DatabaseError);
        const dbError = e as DatabaseError;
        expect(dbError.code).toBe(DatabaseErrorCode.UNIQUE_CONSTRAINT);
        expect(dbError.httpStatus).toBe(409);
        expect(dbError.message).toBe('User already exists');
        expect(dbError.fields).toEqual(
          expect.objectContaining({ prismaCode: 'P2002' }),
        );
      }
    });

    it('should map P2003 to DatabaseError with FOREIGN_KEY_CONSTRAINT', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: '7.0.0' },
      );

      try {
        await withPrismaError('PowerEvent', () => Promise.reject(prismaError));
      } catch (e) {
        expect(e).toBeInstanceOf(DatabaseError);
        const dbError = e as DatabaseError;
        expect(dbError.code).toBe(DatabaseErrorCode.FOREIGN_KEY_CONSTRAINT);
        expect(dbError.httpStatus).toBe(500);
      }
    });

    it('should map unknown Prisma error codes to QUERY_ERROR', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Some other error',
        { code: 'P2010', clientVersion: '7.0.0' },
      );

      try {
        await withPrismaError('User', () => Promise.reject(prismaError));
      } catch (e) {
        expect(e).toBeInstanceOf(DatabaseError);
        expect((e as DatabaseError).code).toBe(DatabaseErrorCode.QUERY_ERROR);
      }
    });
  });

  it('should map PrismaClientValidationError to QUERY_ERROR', async () => {
    const prismaError = new Prisma.PrismaClientValidationError(
      'Invalid query',
      { clientVersion: '7.0.0' },
    );

    try {
      await withPrismaError('User', () => Promise.reject(prismaError));
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseError);
      const dbError = e as DatabaseError;
      expect(dbError.code).toBe(DatabaseErrorCode.QUERY_ERROR);
      expect(dbError.message).toBe('Invalid query for User');
    }
  });

  it('should map PrismaClientInitializationError to CONNECTION_FAILED', async () => {
    const prismaError = new Prisma.PrismaClientInitializationError(
      'Cannot connect',
      '7.0.0',
    );

    try {
      await withPrismaError('User', () => Promise.reject(prismaError));
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseError);
      const dbError = e as DatabaseError;
      expect(dbError.code).toBe(DatabaseErrorCode.CONNECTION_FAILED);
      expect(dbError.httpStatus).toBe(503);
    }
  });

  it('should map PrismaClientUnknownRequestError to QUERY_ERROR', async () => {
    const prismaError = new Prisma.PrismaClientUnknownRequestError(
      'Unknown error',
      { clientVersion: '7.0.0' },
    );

    try {
      await withPrismaError('Device', () => Promise.reject(prismaError));
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseError);
      const dbError = e as DatabaseError;
      expect(dbError.code).toBe(DatabaseErrorCode.QUERY_ERROR);
      expect(dbError.message).toBe('Database operation failed for Device');
    }
  });
});
