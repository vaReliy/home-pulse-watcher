import { mapPrismaUserToEntity } from './user.mapper.js';
import { User } from '@home-pulse-watcher/core';

describe('mapPrismaUserToEntity', () => {
  it('should map Prisma User to Domain User', () => {
    const prismaUser = {
      id: 'user-1',
      telegramId: BigInt(123456789),
      username: 'johndoe',
      locale: 'uk',
      timezone: 'Europe/Kyiv',
      createdAt: new Date('2024-01-01'),
    };

    const result = mapPrismaUserToEntity(prismaUser);

    expect(result).toBeInstanceOf(User);
    expect(result.id).toBe('user-1');
    expect(result.telegramId).toBe(BigInt(123456789));
    expect(result.username).toBe('johndoe');
    expect(result.locale).toBe('uk');
    expect(result.timezone).toBe('Europe/Kyiv');
    expect(result.createdAt).toEqual(new Date('2024-01-01'));
  });

  it('should handle null username', () => {
    const prismaUser = {
      id: 'user-1',
      telegramId: BigInt(123456789),
      username: null,
      locale: 'en',
      timezone: 'America/New_York',
      createdAt: new Date('2024-01-01'),
    };

    const result = mapPrismaUserToEntity(prismaUser);

    expect(result.username).toBeNull();
    expect(result.locale).toBe('en');
    expect(result.timezone).toBe('America/New_York');
  });
});
