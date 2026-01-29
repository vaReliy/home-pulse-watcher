import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

let prismaClient: PrismaClient | null = null;
let pgPool: Pool | null = null;

/**
 * Get or create a singleton PrismaClient instance.
 * In production, lifecycle should be managed by the application entry point.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    pgPool = new Pool({ connectionString });
    const adapter = new PrismaPg(pgPool);

    prismaClient = new PrismaClient({
      adapter,
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }
  return prismaClient;
}

/**
 * Disconnect and clear the singleton PrismaClient.
 * Should be called during application shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

/**
 * Reset the singleton for testing purposes.
 * Allows injecting a mock PrismaClient.
 */
export function resetPrismaClient(client: PrismaClient | null = null): void {
  prismaClient = client;
}
