import type { User as PrismaUser } from '@prisma/client';
import { User } from '@home-pulse-watcher/core';

/**
 * Maps Prisma User model to Domain User entity.
 */
export function mapPrismaUserToEntity(prismaUser: PrismaUser): User {
  return new User({
    id: prismaUser.id,
    telegramId: prismaUser.telegramId,
    username: prismaUser.username,
    locale: prismaUser.locale,
    timezone: prismaUser.timezone,
    createdAt: prismaUser.createdAt,
  });
}
