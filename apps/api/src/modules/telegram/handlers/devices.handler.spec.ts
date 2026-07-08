import type {
  GetUserDevicesOverviewService,
  GetUserDevicesOverviewOutput,
} from '@home-pulse-watcher/application';
import type { User, Device } from '@home-pulse-watcher/core';
import { PowerStatus, DeviceRole } from '@home-pulse-watcher/core';
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

  const createMockOverviewService = (): jest.Mocked<
    Pick<GetUserDevicesOverviewService, 'run'>
  > => ({
    run: jest.fn(),
  });

  const mockRun = (
    service: jest.Mocked<Pick<GetUserDevicesOverviewService, 'run'>>,
    output: GetUserDevicesOverviewOutput,
  ): void => {
    service.run.mockResolvedValue({ data: output });
  };

  const createMockContext = (user?: User): TelegramContext =>
    ({
      user: user ?? null,
      reply: jest.fn(),
      from: { id: 12345 },
    }) as unknown as TelegramContext;

  it('should reply NOT_REGISTERED when no user', async () => {
    const overviewService = createMockOverviewService();
    const handler = new DevicesHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
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
    const overviewService = createMockOverviewService();
    mockRun(overviewService, { devices: [], total: 0 });

    const handler = new DevicesHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
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
      const overviewService = createMockOverviewService();
      mockRun(overviewService, {
        devices: [
          {
            device: buildDevice('1.2.3-beta'),
            customName: null,
            role: DeviceRole.OWNER,
          },
        ],
        total: 1,
      });

      const handler = new DevicesHandler(
        overviewService as unknown as GetUserDevicesOverviewService,
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
      const overviewService = createMockOverviewService();
      mockRun(overviewService, {
        devices: [
          {
            device: buildDevice(null),
            customName: null,
            role: DeviceRole.OWNER,
          },
        ],
        total: 1,
      });

      const handler = new DevicesHandler(
        overviewService as unknown as GetUserDevicesOverviewService,
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
    const overviewService = createMockOverviewService();
    overviewService.run.mockRejectedValue(new Error('DB error'));

    const handler = new DevicesHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
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
