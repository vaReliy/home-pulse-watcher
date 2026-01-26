import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;

/**
 * Get or create a singleton PrismaClient instance.
 * In production, lifecycle should be managed by the application entry point.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
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
}

/**
 * Reset the singleton for testing purposes.
 * Allows injecting a mock PrismaClient.
 */
export function resetPrismaClient(client: PrismaClient | null = null): void {
  prismaClient = client;
}
