import { PrismaUserRepository } from './user.repository.js';
import { User } from '@home-pulse-watcher/core';

const mockPrismaClient = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

describe('PrismaUserRepository', () => {
  let repository: PrismaUserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PrismaUserRepository(mockPrismaClient as never);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const prismaUser = {
        id: 'user-1',
        telegramId: BigInt(123456789),
        username: 'johndoe',
        createdAt: new Date('2024-01-01'),
      };
      mockPrismaClient.user.findUnique.mockResolvedValue(prismaUser);

      const result = await repository.findById('user-1');

      expect(result).toBeInstanceOf(User);
      expect(result?.id).toBe('user-1');
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should return null when not found', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByTelegramId', () => {
    it('should return user when found', async () => {
      const prismaUser = {
        id: 'user-1',
        telegramId: BigInt(123456789),
        username: 'johndoe',
        createdAt: new Date('2024-01-01'),
      };
      mockPrismaClient.user.findUnique.mockResolvedValue(prismaUser);

      const result = await repository.findByTelegramId(BigInt(123456789));

      expect(result).toBeInstanceOf(User);
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { telegramId: BigInt(123456789) },
      });
    });
  });

  describe('create', () => {
    it('should create and return user', async () => {
      const prismaUser = {
        id: 'user-1',
        telegramId: BigInt(123456789),
        username: 'johndoe',
        createdAt: new Date('2024-01-01'),
      };
      mockPrismaClient.user.create.mockResolvedValue(prismaUser);

      const result = await repository.create({
        telegramId: BigInt(123456789),
        username: 'johndoe',
      });

      expect(result).toBeInstanceOf(User);
      expect(mockPrismaClient.user.create).toHaveBeenCalledWith({
        data: {
          telegramId: BigInt(123456789),
          username: 'johndoe',
        },
      });
    });

    it('should handle null username', async () => {
      const prismaUser = {
        id: 'user-1',
        telegramId: BigInt(123456789),
        username: null,
        createdAt: new Date('2024-01-01'),
      };
      mockPrismaClient.user.create.mockResolvedValue(prismaUser);

      await repository.create({ telegramId: BigInt(123456789) });

      expect(mockPrismaClient.user.create).toHaveBeenCalledWith({
        data: {
          telegramId: BigInt(123456789),
          username: null,
        },
      });
    });
  });

  describe('existsByTelegramId', () => {
    it('should return true when user exists', async () => {
      mockPrismaClient.user.count.mockResolvedValue(1);

      const result = await repository.existsByTelegramId(BigInt(123456789));

      expect(result).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      mockPrismaClient.user.count.mockResolvedValue(0);

      const result = await repository.existsByTelegramId(BigInt(123456789));

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      mockPrismaClient.user.delete.mockResolvedValue({});

      await repository.delete('user-1');

      expect(mockPrismaClient.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });
  });
});
