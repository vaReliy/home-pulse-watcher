import type {
  IDeviceRepository,
  IUserDeviceRepository,
  IPowerEventRepository,
  User,
  Device,
  PowerEvent,
} from '@home-pulse-watcher/core';
import { PowerStatus, DeviceRole, UserDevice } from '@home-pulse-watcher/core';
import { HistoryHandler } from './history.handler.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { MESSAGES } from '../constants/messages.constants.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

describe('HistoryHandler', () => {
  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(12345),
    firstName: 'Test',
    lastName: null,
    username: 'testuser',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const mockDevice: Device = {
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'secret',
    label: 'Kitchen',
    lastStatus: PowerStatus.ON,
    lastSeenAt: new Date(),
    isOnline: () => true,
  } as Device;

  const mockUserDevice = new UserDevice({
    userId: 'user-1',
    deviceId: 'device-1',
    role: DeviceRole.OWNER,
    customName: null,
  });

  const mockEvents: PowerEvent[] = [
    {
      id: 'ev-1',
      deviceId: 'device-1',
      status: PowerStatus.OFF,
      timestamp: new Date('2026-02-10T08:00:00Z'),
      duration: 3600,
      formatDuration: () => '1h',
    } as PowerEvent,
    {
      id: 'ev-2',
      deviceId: 'device-1',
      status: PowerStatus.ON,
      timestamp: new Date('2026-02-10T09:00:00Z'),
      duration: null,
      formatDuration: () => null,
    } as PowerEvent,
  ];

  const createMockDeviceRepo = (): jest.Mocked<IDeviceRepository> => ({
    findById: jest.fn(),
    findByMacAddress: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
  });

  const createMockUserDeviceRepo = (): jest.Mocked<IUserDeviceRepository> => ({
    findByUserId: jest.fn(),
    findByDeviceId: jest.fn(),
    findByUserAndDevice: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
    countByDeviceId: jest.fn(),
  });

  const createMockPowerEventRepo = (): jest.Mocked<IPowerEventRepository> => ({
    findById: jest.fn(),
    findMany: jest.fn(),
    findLatestByDeviceId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByDeviceId: jest.fn(),
    count: jest.fn(),
  });

  const createMockContext = (user?: User): TelegramContext =>
    ({
      user: user ?? null,
      reply: jest.fn(),
      from: { id: 12345 },
    }) as unknown as TelegramContext;

  it('should reply NOT_REGISTERED when no user', async () => {
    const handler = new HistoryHandler(
      createMockDeviceRepo(),
      createMockUserDeviceRepo(),
      createMockPowerEventRepo(),
      new MessageFormatter(),
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(MESSAGES.NOT_REGISTERED, {
      parse_mode: 'HTML',
    });
  });

  it('should reply NO_DEVICES when user has no devices', async () => {
    const userDeviceRepo = createMockUserDeviceRepo();
    userDeviceRepo.findByUserId.mockResolvedValue([]);

    const handler = new HistoryHandler(
      createMockDeviceRepo(),
      userDeviceRepo,
      createMockPowerEventRepo(),
      new MessageFormatter(),
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(MESSAGES.NO_DEVICES, {
      parse_mode: 'HTML',
    });
  });

  it('should display history for user devices', async () => {
    const deviceRepo = createMockDeviceRepo();
    const userDeviceRepo = createMockUserDeviceRepo();
    const powerEventRepo = createMockPowerEventRepo();

    userDeviceRepo.findByUserId.mockResolvedValue([mockUserDevice]);
    deviceRepo.findById.mockResolvedValue(mockDevice);
    powerEventRepo.findMany.mockResolvedValue(mockEvents);

    const handler = new HistoryHandler(
      deviceRepo,
      userDeviceRepo,
      powerEventRepo,
      new MessageFormatter(),
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    expect(powerEventRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'device-1',
        orderBy: 'asc',
      }),
    );

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('Outage History');
    expect(message).toContain('Kitchen');
  });

  it('should show NO_HISTORY when no events this month', async () => {
    const deviceRepo = createMockDeviceRepo();
    const userDeviceRepo = createMockUserDeviceRepo();
    const powerEventRepo = createMockPowerEventRepo();

    userDeviceRepo.findByUserId.mockResolvedValue([mockUserDevice]);
    deviceRepo.findById.mockResolvedValue(mockDevice);
    powerEventRepo.findMany.mockResolvedValue([]);

    const handler = new HistoryHandler(
      deviceRepo,
      userDeviceRepo,
      powerEventRepo,
      new MessageFormatter(),
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    expect(message).toBe(MESSAGES.NO_HISTORY);
  });

  it('should use customName over device label', async () => {
    const deviceRepo = createMockDeviceRepo();
    const userDeviceRepo = createMockUserDeviceRepo();
    const powerEventRepo = createMockPowerEventRepo();

    const udWithCustomName = new UserDevice({
      userId: 'user-1',
      deviceId: 'device-1',
      role: DeviceRole.OWNER,
      customName: 'My Sensor',
    });
    userDeviceRepo.findByUserId.mockResolvedValue([udWithCustomName]);
    deviceRepo.findById.mockResolvedValue(mockDevice);
    powerEventRepo.findMany.mockResolvedValue(mockEvents);

    const handler = new HistoryHandler(
      deviceRepo,
      userDeviceRepo,
      powerEventRepo,
      new MessageFormatter(),
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('My Sensor');
    expect(message).not.toContain('Kitchen');
  });

  it('should reply ERROR_GENERIC on unexpected error', async () => {
    const userDeviceRepo = createMockUserDeviceRepo();
    userDeviceRepo.findByUserId.mockRejectedValue(new Error('DB error'));

    const handler = new HistoryHandler(
      createMockDeviceRepo(),
      userDeviceRepo,
      createMockPowerEventRepo(),
      new MessageFormatter(),
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(MESSAGES.ERROR_GENERIC);
  });
});
