import type { IUserRepository, User } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { CreateUserService } from './create-user.service.js';

describe('CreateUserService', () => {
  const mockUser: User = {
    id: 'user-123',
    telegramId: BigInt('123456789'),
    username: 'testuser',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date('2026-01-01'),
  } as User;

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

  describe('successful creation', () => {
    it('should create user with valid telegramId', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByTelegramId.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockUser);

      const service = new CreateUserService(mockRepo);
      const result = await service.run({ telegramId: '123456789' });

      expect(result.data).toEqual(mockUser);
      expect(mockRepo.create).toHaveBeenCalledWith({
        telegramId: BigInt('123456789'),
        username: null,
      });
    });

    it('should create user with username', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByTelegramId.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockUser);

      const service = new CreateUserService(mockRepo);
      await service.run({ telegramId: '123456789', username: 'johndoe' });

      expect(mockRepo.create).toHaveBeenCalledWith({
        telegramId: BigInt('123456789'),
        username: 'johndoe',
      });
    });

    it('should create user with locale and timezone', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByTelegramId.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockUser);

      const service = new CreateUserService(mockRepo);
      await service.run({
        telegramId: '123456789',
        locale: 'en',
        timezone: 'America/New_York',
      });

      expect(mockRepo.create).toHaveBeenCalledWith({
        telegramId: BigInt('123456789'),
        username: null,
        locale: 'en',
        timezone: 'America/New_York',
      });
    });

    it('should handle optional username as undefined', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByTelegramId.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockUser);

      const service = new CreateUserService(mockRepo);
      await service.run({ telegramId: '123456789' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: null }),
      );
    });

    it('should convert telegramId string to BigInt', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByTelegramId.mockResolvedValue(false);
      mockRepo.create.mockResolvedValue(mockUser);

      const service = new CreateUserService(mockRepo);
      await service.run({ telegramId: '9007199254740993' }); // > MAX_SAFE_INTEGER

      expect(mockRepo.existsByTelegramId).toHaveBeenCalledWith(
        BigInt('9007199254740993'),
      );
    });
  });

  describe('error handling', () => {
    it('should throw DomainError for duplicate telegramId', async () => {
      const mockRepo = createMockRepository();
      mockRepo.existsByTelegramId.mockResolvedValue(true);

      const service = new CreateUserService(mockRepo);

      await expect(service.run({ telegramId: '123456789' })).rejects.toThrow(
        DomainError,
      );

      await expect(
        service.run({ telegramId: '123456789' }),
      ).rejects.toMatchObject({
        code: DomainErrorCode.USER_ALREADY_EXISTS,
      });
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing telegramId', async () => {
      const mockRepo = createMockRepository();
      const service = new CreateUserService(mockRepo);

      await expect(service.run({} as { telegramId: string })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError for empty telegramId', async () => {
      const mockRepo = createMockRepository();
      const service = new CreateUserService(mockRepo);

      await expect(service.run({ telegramId: '' })).rejects.toThrow(
        ValidationError,
      );
    });
  });
});
