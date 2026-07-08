import type {
  IUserDeviceRepository,
  IUserRepository,
  User,
  UserDevice,
} from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import { ValidationError } from '@home-pulse-watcher/shared';
import { GetDeviceNotificationRecipientsService } from './get-device-notification-recipients.service.js';

describe('GetDeviceNotificationRecipientsService', () => {
  const mockUser1 = {
    id: 'user-1',
    telegramId: BigInt(111111),
    username: 'alice',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date('2026-01-01'),
  } as User;

  const mockUser2 = {
    id: 'user-2',
    telegramId: BigInt(222222),
    username: 'bob',
    locale: 'en',
    timezone: 'Europe/Kyiv',
    createdAt: new Date('2026-01-01'),
  } as User;

  const mockUserDevice1 = {
    userId: 'user-1',
    deviceId: 'device-1',
    customName: null,
    role: DeviceRole.OWNER,
  } as UserDevice;

  const mockUserDevice2 = {
    userId: 'user-2',
    deviceId: 'device-1',
    customName: null,
    role: DeviceRole.VIEWER,
  } as UserDevice;

  const createMockUserDeviceRepository =
    (): jest.Mocked<IUserDeviceRepository> => ({
      findByUserAndDevice: jest.fn(),
      findByUserId: jest.fn(),
      findByDeviceId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      countByDeviceId: jest.fn(),
    });

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

  it('should return recipients with chatId derived from telegramId', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const userRepo = createMockUserRepository();
    userDeviceRepo.findByDeviceId.mockResolvedValue([
      mockUserDevice1,
      mockUserDevice2,
    ]);
    userRepo.findByIds.mockResolvedValue([mockUser1, mockUser2]);

    const service = new GetDeviceNotificationRecipientsService(
      userDeviceRepo,
      userRepo,
    );
    const result = await service.run({ deviceId: 'device-1' }, {});

    expect(result.data.recipients).toEqual(
      expect.arrayContaining([
        {
          userId: 'user-1',
          chatId: '111111',
          locale: 'uk',
          timezone: 'Europe/Kyiv',
        },
        {
          userId: 'user-2',
          chatId: '222222',
          locale: 'en',
          timezone: 'Europe/Kyiv',
        },
      ]),
    );
    expect(result.data.recipients).toHaveLength(2);
  });

  it('should call findByDeviceId then findByIds exactly once each (2 queries total)', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const userRepo = createMockUserRepository();
    userDeviceRepo.findByDeviceId.mockResolvedValue([mockUserDevice1]);
    userRepo.findByIds.mockResolvedValue([mockUser1]);

    const service = new GetDeviceNotificationRecipientsService(
      userDeviceRepo,
      userRepo,
    );
    await service.run({ deviceId: 'device-1' }, {});

    expect(userDeviceRepo.findByDeviceId).toHaveBeenCalledTimes(1);
    expect(userDeviceRepo.findByDeviceId).toHaveBeenCalledWith('device-1');
    expect(userRepo.findByIds).toHaveBeenCalledTimes(1);
    expect(userRepo.findByIds).toHaveBeenCalledWith(['user-1']);
  });

  it('should return empty recipients when device has no linked users', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const userRepo = createMockUserRepository();
    userDeviceRepo.findByDeviceId.mockResolvedValue([]);
    userRepo.findByIds.mockResolvedValue([]);

    const service = new GetDeviceNotificationRecipientsService(
      userDeviceRepo,
      userRepo,
    );
    const result = await service.run({ deviceId: 'device-1' }, {});

    expect(result.data.recipients).toEqual([]);
    expect(userRepo.findByIds).toHaveBeenCalledWith([]);
  });

  it('should throw ValidationError when deviceId is missing', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    const userRepo = createMockUserRepository();
    const service = new GetDeviceNotificationRecipientsService(
      userDeviceRepo,
      userRepo,
    );

    await expect(service.run({} as { deviceId: string }, {})).rejects.toThrow(
      ValidationError,
    );
  });
});
