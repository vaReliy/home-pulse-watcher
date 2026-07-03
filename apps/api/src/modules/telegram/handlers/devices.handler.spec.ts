import type {
  IDeviceRepository,
  IUserDeviceRepository,
  User,
  Device,
} from '@home-pulse-watcher/core';
import { PowerStatus, DeviceRole, UserDevice } from '@home-pulse-watcher/core';
import { DevicesHandler } from './devices.handler.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

describe('DevicesHandler', () => {
  const translationService = new TranslationService();

  const buildUser = (locale: 'uk' | 'en'): User =>
    ({
      id: 'user-1',
      telegramId: BigInt(12345),
      username: 'testuser',
      locale,
      timezone: 'Europe/Kyiv',
      createdAt: new Date(),
    }) as User;

  const buildDevice = (firmwareVersion: string | null): Device =>
    ({
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'secret',
      label: 'Kitchen',
      lastStatus: PowerStatus.ON,
      lastSeenAt: new Date(),
      firmwareVersion,
      isOnline: () => true,
    }) as Device;

  const mockUserDevice = new UserDevice({
    userId: 'user-1',
    deviceId: 'device-1',
    role: DeviceRole.OWNER,
    customName: null,
  });

  const createMockDeviceRepo = (): jest.Mocked<IDeviceRepository> => ({
    findById: jest.fn(),
    findByMacAddress: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    existsByMacAddress: jest.fn(),
    consumeOtaForceCheckRequest: jest.fn(),
    requestOtaForceCheck: jest.fn(),
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

  const createMockContext = (user?: User): TelegramContext =>
    ({
      user: user ?? null,
      reply: jest.fn(),
      from: { id: 12345 },
    }) as unknown as TelegramContext;

  it('should reply NOT_REGISTERED when no user', async () => {
    const handler = new DevicesHandler(
      createMockDeviceRepo(),
      createMockUserDeviceRepo(),
      translationService,
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    const msgs = translationService.getMessages();
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.NOT_REGISTERED,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  it('should reply NO_DEVICES when user has no devices', async () => {
    const userDeviceRepo = createMockUserDeviceRepo();
    userDeviceRepo.findByUserId.mockResolvedValue([]);

    const handler = new DevicesHandler(
      createMockDeviceRepo(),
      userDeviceRepo,
      translationService,
    );

    const ctx = createMockContext(buildUser('uk'));
    await handler.handle(ctx);

    const msgs = translationService.getMessages('uk');
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.NO_DEVICES,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  describe.each(['uk', 'en'] as const)('locale: %s', (locale) => {
    const msgs = translationService.getMessages(locale);

    it('renders escaped firmware version when set', async () => {
      const deviceRepo = createMockDeviceRepo();
      const userDeviceRepo = createMockUserDeviceRepo();

      userDeviceRepo.findByUserId.mockResolvedValue([mockUserDevice]);
      deviceRepo.findById.mockResolvedValue(buildDevice('1.2.3-beta'));

      const handler = new DevicesHandler(
        deviceRepo,
        userDeviceRepo,
        translationService,
      );

      const ctx = createMockContext(buildUser(locale));
      await handler.handle(ctx);

      const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
      expect(message).toContain(msgs.FIRMWARE_LABEL);
      // '.' and '-' must be MarkdownV2-escaped
      expect(message).toContain('1\\.2\\.3\\-beta');
      expect(message).not.toContain('1.2.3-beta');
      expect(message).not.toContain(msgs.FIRMWARE_VERSION_UNKNOWN);
    });

    it('falls back to unknown firmware label when firmwareVersion is null', async () => {
      const deviceRepo = createMockDeviceRepo();
      const userDeviceRepo = createMockUserDeviceRepo();

      userDeviceRepo.findByUserId.mockResolvedValue([mockUserDevice]);
      deviceRepo.findById.mockResolvedValue(buildDevice(null));

      const handler = new DevicesHandler(
        deviceRepo,
        userDeviceRepo,
        translationService,
      );

      const ctx = createMockContext(buildUser(locale));
      await handler.handle(ctx);

      const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
      expect(message).toContain(msgs.FIRMWARE_LABEL);
      expect(message).toContain(msgs.FIRMWARE_VERSION_UNKNOWN);
      expect(message).not.toContain('null');
    });
  });

  it('should reply ERROR_GENERIC on unexpected error', async () => {
    const userDeviceRepo = createMockUserDeviceRepo();
    userDeviceRepo.findByUserId.mockRejectedValue(new Error('DB error'));

    const handler = new DevicesHandler(
      createMockDeviceRepo(),
      userDeviceRepo,
      translationService,
    );

    const ctx = createMockContext(buildUser('uk'));
    await handler.handle(ctx);

    const msgs = translationService.getMessages('uk');
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.ERROR_GENERIC,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });
});
