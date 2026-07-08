import type { IUserRepository, User } from '@home-pulse-watcher/core';
import { ListUsersService } from './list-users.service.js';

describe('ListUsersService', () => {
  const mockUsers: User[] = [
    {
      id: 'user-1',
      telegramId: BigInt('111111111'),
      username: 'alice',
      createdAt: new Date('2026-01-01'),
    } as User,
    {
      id: 'user-2',
      telegramId: BigInt('222222222'),
      username: 'bob',
      createdAt: new Date('2026-01-02'),
    } as User,
    {
      id: 'user-3',
      telegramId: BigInt('333333333'),
      username: null,
      createdAt: new Date('2026-01-03'),
    } as User,
  ];

  const createMockRepository = (): jest.Mocked<IUserRepository> => ({
    findById: jest.fn(),
    findByTelegramId: jest.fn(),
    findByIds: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByTelegramId: jest.fn(),
  });

  describe('listing all users', () => {
    it('should return all users when no filter provided', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findAll.mockResolvedValue(mockUsers);

      const service = new ListUsersService(mockRepo);
      const result = await service.run({});

      expect(result.data.users).toEqual(mockUsers);
      expect(result.data.total).toBe(3);
      expect(mockRepo.findAll).toHaveBeenCalled();
    });

    it('should return empty list when no users exist', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findAll.mockResolvedValue([]);

      const service = new ListUsersService(mockRepo);
      const result = await service.run({});

      expect(result.data.users).toEqual([]);
      expect(result.data.total).toBe(0);
    });
  });

  describe('filtering by username', () => {
    it('should filter users by username (case-insensitive)', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findAll.mockResolvedValue(mockUsers);

      const service = new ListUsersService(mockRepo);
      const result = await service.run({ username: 'Alice' });

      expect(result.data.users).toHaveLength(1);
      expect(result.data.users[0].username).toBe('alice');
      expect(result.data.total).toBe(1);
    });

    it('should support partial username match', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findAll.mockResolvedValue(mockUsers);

      const service = new ListUsersService(mockRepo);
      const result = await service.run({ username: 'ob' });

      expect(result.data.users).toHaveLength(1);
      expect(result.data.users[0].username).toBe('bob');
    });

    it('should exclude users with null username when filtering', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findAll.mockResolvedValue(mockUsers);

      const service = new ListUsersService(mockRepo);
      const result = await service.run({ username: 'user' });

      expect(result.data.users).toHaveLength(0);
    });

    it('should return empty list when no username matches', async () => {
      const mockRepo = createMockRepository();
      mockRepo.findAll.mockResolvedValue(mockUsers);

      const service = new ListUsersService(mockRepo);
      const result = await service.run({ username: 'nonexistent' });

      expect(result.data.users).toEqual([]);
      expect(result.data.total).toBe(0);
    });
  });
});
