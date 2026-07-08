import type {
  GetPowerHistoryService,
  GetPowerHistoryOutput,
  GetUserDevicesOverviewService,
  GetUserDevicesOverviewOutput,
} from '@home-pulse-watcher/application';
import type { User, Device, PowerEvent } from '@home-pulse-watcher/core';
import { PowerStatus, DeviceRole } from '@home-pulse-watcher/core';
import { HistoryHandler } from './history.handler.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

describe('HistoryHandler', () => {
  const translationService = new TranslationService();
  const messageFormatter = new MessageFormatter(translationService);

  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(12345),
    username: 'testuser',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date(),
  } as User;

  const mockDevice: Device = {
    id: 'device-1',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    encryptedSecret: 'secret',
    label: 'Kitchen',
    lastStatus: PowerStatus.ON,
    lastSeenAt: new Date(),
    firmwareVersion: null,
    isOnline: () => true,
  } as Device;

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

  const createMockOverviewService = (): jest.Mocked<
    Pick<GetUserDevicesOverviewService, 'run'>
  > => ({
    run: jest.fn(),
  });

  const createMockPowerHistoryService = (): jest.Mocked<
    Pick<GetPowerHistoryService, 'run'>
  > => ({
    run: jest.fn(),
  });

  const mockOverview = (
    service: jest.Mocked<Pick<GetUserDevicesOverviewService, 'run'>>,
    output: GetUserDevicesOverviewOutput,
  ): void => {
    service.run.mockResolvedValue({ data: output });
  };

  const mockHistory = (
    service: jest.Mocked<Pick<GetPowerHistoryService, 'run'>>,
    events: PowerEvent[],
  ): void => {
    const output: GetPowerHistoryOutput = {
      events,
      total: events.length,
      limit: 100,
      offset: 0,
    };
    service.run.mockResolvedValue({ data: output });
  };

  const createMockContext = (user?: User): TelegramContext =>
    ({
      user: user ?? null,
      reply: jest.fn(),
      from: { id: 12345 },
    }) as unknown as TelegramContext;

  it('should reply NOT_REGISTERED when no user', async () => {
    const handler = new HistoryHandler(
      createMockOverviewService() as unknown as GetUserDevicesOverviewService,
      createMockPowerHistoryService() as unknown as GetPowerHistoryService,
      messageFormatter,
      translationService,
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    const msgs = translationService.getMessages();
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.NOT_REGISTERED,
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_markup: expect.objectContaining({ keyboard: expect.any(Array) }),
      }),
    );
  });

  it('should reply NO_DEVICES when user has no devices', async () => {
    const overviewService = createMockOverviewService();
    mockOverview(overviewService, { devices: [], total: 0 });

    const handler = new HistoryHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
      createMockPowerHistoryService() as unknown as GetPowerHistoryService,
      messageFormatter,
      translationService,
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const msgs = translationService.getMessages('uk');
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.NO_DEVICES,
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_markup: expect.objectContaining({ keyboard: expect.any(Array) }),
      }),
    );
  });

  it('should display history for user devices in Ukrainian', async () => {
    const overviewService = createMockOverviewService();
    const powerHistoryService = createMockPowerHistoryService();

    mockOverview(overviewService, {
      devices: [
        { device: mockDevice, customName: null, role: DeviceRole.OWNER },
      ],
      total: 1,
    });
    mockHistory(powerHistoryService, mockEvents);

    const handler = new HistoryHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
      powerHistoryService as unknown as GetPowerHistoryService,
      messageFormatter,
      translationService,
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    expect(powerHistoryService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'device-1',
        orderBy: 'asc',
      }),
    );

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('Історія відключень');
    expect(message).toContain('Kitchen');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  it('should show NO_HISTORY when no events this month', async () => {
    const overviewService = createMockOverviewService();
    const powerHistoryService = createMockPowerHistoryService();

    mockOverview(overviewService, {
      devices: [
        { device: mockDevice, customName: null, role: DeviceRole.OWNER },
      ],
      total: 1,
    });
    mockHistory(powerHistoryService, []);

    const handler = new HistoryHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
      powerHistoryService as unknown as GetPowerHistoryService,
      messageFormatter,
      translationService,
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    const msgs = translationService.getMessages('uk');
    expect(message).toBe(msgs.NO_HISTORY);
  });

  it('should use customName over device label', async () => {
    const overviewService = createMockOverviewService();
    const powerHistoryService = createMockPowerHistoryService();

    mockOverview(overviewService, {
      devices: [
        {
          device: mockDevice,
          customName: 'My Sensor',
          role: DeviceRole.OWNER,
        },
      ],
      total: 1,
    });
    mockHistory(powerHistoryService, mockEvents);

    const handler = new HistoryHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
      powerHistoryService as unknown as GetPowerHistoryService,
      messageFormatter,
      translationService,
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('My Sensor');
    expect(message).not.toContain('Kitchen');
  });

  it('should reply ERROR_GENERIC on unexpected error', async () => {
    const overviewService = createMockOverviewService();
    overviewService.run.mockRejectedValue(new Error('DB error'));

    const handler = new HistoryHandler(
      overviewService as unknown as GetUserDevicesOverviewService,
      createMockPowerHistoryService() as unknown as GetPowerHistoryService,
      messageFormatter,
      translationService,
    );

    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const msgs = translationService.getMessages('uk');
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.ERROR_GENERIC,
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_markup: expect.objectContaining({ keyboard: expect.any(Array) }),
      }),
    );
  });
});
