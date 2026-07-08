import type { IUserRepository, User } from '@home-pulse-watcher/core';
import { ValidationError } from '@home-pulse-watcher/shared';
import { UpdateUserSettingsService } from './update-user-settings.service.js';

describe('UpdateUserSettingsService', () => {
  const mockUser = {
    id: 'user-1',
    telegramId: BigInt(111111),
    username: 'alice',
    locale: 'en',
    timezone: 'Europe/London',
    createdAt: new Date('2026-01-01'),
  } as User;

  const createMockUserRepository = (): jest.Mocked<IUserRepository> => ({
    findById: jest.fn(),
    findByTelegramId: jest.fn(),
    findByIds: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByTelegramId: jest.fn(),
  });

  it('should update locale only', async () => {
    const userRepo = createMockUserRepository();
    userRepo.update.mockResolvedValue(mockUser);

    const service = new UpdateUserSettingsService(userRepo);
    const result = await service.run({ userId: 'user-1', locale: 'en' }, {});

    expect(userRepo.update).toHaveBeenCalledWith('user-1', { locale: 'en' });
    expect(result.data.user).toBe(mockUser);
  });

  it('should update timezone only', async () => {
    const userRepo = createMockUserRepository();
    userRepo.update.mockResolvedValue(mockUser);

    const service = new UpdateUserSettingsService(userRepo);
    await service.run({ userId: 'user-1', timezone: 'Europe/London' }, {});

    expect(userRepo.update).toHaveBeenCalledWith('user-1', {
      timezone: 'Europe/London',
    });
  });

  it('should update both locale and timezone', async () => {
    const userRepo = createMockUserRepository();
    userRepo.update.mockResolvedValue(mockUser);

    const service = new UpdateUserSettingsService(userRepo);
    await service.run(
      { userId: 'user-1', locale: 'uk', timezone: 'Europe/Kyiv' },
      {},
    );

    expect(userRepo.update).toHaveBeenCalledWith('user-1', {
      locale: 'uk',
      timezone: 'Europe/Kyiv',
    });
  });

  it('should reject an unsupported locale', async () => {
    const userRepo = createMockUserRepository();
    const service = new UpdateUserSettingsService(userRepo);

    await expect(
      service.run({ userId: 'user-1', locale: 'fr' }, {}),
    ).rejects.toThrow(ValidationError);
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('should reject an unsupported timezone', async () => {
    const userRepo = createMockUserRepository();
    const service = new UpdateUserSettingsService(userRepo);

    await expect(
      service.run({ userId: 'user-1', timezone: 'Mars/Olympus' }, {}),
    ).rejects.toThrow(ValidationError);
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('should reject a missing userId', async () => {
    const userRepo = createMockUserRepository();
    const service = new UpdateUserSettingsService(userRepo);

    await expect(service.run({} as { userId: string }, {})).rejects.toThrow(
      ValidationError,
    );
  });
});
