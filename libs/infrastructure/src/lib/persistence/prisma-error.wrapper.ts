import { Prisma } from '@prisma/client';
import { NotFoundError, DatabaseError, DatabaseErrorCode } from '@home-pulse-watcher/shared';

/**
 * Wraps a Prisma operation and translates Prisma-specific errors into domain errors.
 * Keeps Prisma types from leaking outside the infrastructure layer.
 */
export async function withPrismaError<T>(
  entityName: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw handleKnownRequestError(entityName, error);
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      throw new DatabaseError(
        DatabaseErrorCode.QUERY_ERROR,
        `Invalid query for ${entityName}`,
        { prismaMessage: error.message },
      );
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new DatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Database connection failed',
        { prismaMessage: error.message },
      );
    }

    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      throw new DatabaseError(
        DatabaseErrorCode.QUERY_ERROR,
        `Database operation failed for ${entityName}`,
        { prismaMessage: error.message },
      );
    }

    throw error;
  }
}

function handleKnownRequestError(
  entityName: string,
  error: Prisma.PrismaClientKnownRequestError,
): NotFoundError | DatabaseError {
  switch (error.code) {
    case 'P2025':
      return new NotFoundError(entityName, 'unknown');

    case 'P2002':
      return new DatabaseError(
        DatabaseErrorCode.UNIQUE_CONSTRAINT,
        `${entityName} already exists`,
        { prismaCode: error.code, prismaMessage: error.message },
      );

    case 'P2003':
      return new DatabaseError(
        DatabaseErrorCode.FOREIGN_KEY_CONSTRAINT,
        `Related record not found for ${entityName}`,
        { prismaCode: error.code, prismaMessage: error.message },
      );

    default:
      return new DatabaseError(
        DatabaseErrorCode.QUERY_ERROR,
        `Database operation failed for ${entityName}`,
        { prismaCode: error.code, prismaMessage: error.message },
      );
  }
}
