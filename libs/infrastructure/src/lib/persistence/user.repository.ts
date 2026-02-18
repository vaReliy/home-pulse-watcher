import type { PrismaClient } from '@prisma/client';
import type { IUserRepository, User } from '@home-pulse-watcher/core';
import { mapPrismaUserToEntity } from '../mappers/user.mapper.js';

/**
 * Prisma implementation of IUserRepository.
 * Plain TypeScript class - no NestJS decorators.
 */
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? mapPrismaUserToEntity(user) : null;
  }

  async findByTelegramId(telegramId: bigint): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });
    return user ? mapPrismaUserToEntity(user) : null;
  }

  async create(data: {
    telegramId: bigint;
    username?: string | null;
    locale?: string;
    timezone?: string;
  }): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        telegramId: data.telegramId,
        username: data.username ?? null,
        ...(data.locale !== undefined && { locale: data.locale }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
      },
    });
    return mapPrismaUserToEntity(user);
  }

  async update(
    id: string,
    data: { username?: string | null; locale?: string; timezone?: string },
  ): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    return mapPrismaUserToEntity(user);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  async findAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(mapPrismaUserToEntity);
  }

  async existsByTelegramId(telegramId: bigint): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { telegramId },
    });
    return count > 0;
  }
}
