import type { IUserRepository, User } from '@home-pulse-watcher/core';
import { ValidationError } from '@home-pulse-watcher/shared';
import { GetUserByTelegramIdService } from './get-user-by-telegram-id.service.js';

describe('GetUserByTelegramIdService', () => {
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

  it('should return user when found', async () => {
    const mockRepo = createMockRepository();
    mockRepo.findByTelegramId.mockResolvedValue(mockUser);

    const service = new GetUserByTelegramIdService(mockRepo);
    const result = await service.run({ telegramId: '123456789' });

    expect(result.data).toEqual(mockUser);
    expect(mockRepo.findByTelegramId).toHaveBeenCalledWith(BigInt('123456789'));
  });

  it('should return null when not found', async () => {
    const mockRepo = createMockRepository();
    mockRepo.findByTelegramId.mockResolvedValue(null);

    const service = new GetUserByTelegramIdService(mockRepo);
    const result = await service.run({ telegramId: '123456789' });

    expect(result.data).toBeNull();
  });

  it('should convert telegramId string to BigInt', async () => {
    const mockRepo = createMockRepository();
    mockRepo.findByTelegramId.mockResolvedValue(null);

    const service = new GetUserByTelegramIdService(mockRepo);
    await service.run({ telegramId: '9007199254740993' }); // > MAX_SAFE_INTEGER

    expect(mockRepo.findByTelegramId).toHaveBeenCalledWith(
      BigInt('9007199254740993'),
    );
  });

  describe('validation', () => {
    it('should throw ValidationError for missing telegramId', async () => {
      const mockRepo = createMockRepository();
      const service = new GetUserByTelegramIdService(mockRepo);

      await expect(service.run({} as { telegramId: string })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError for empty telegramId', async () => {
      const mockRepo = createMockRepository();
      const service = new GetUserByTelegramIdService(mockRepo);

      await expect(service.run({ telegramId: '' })).rejects.toThrow(
        ValidationError,
      );
    });
  });
});
