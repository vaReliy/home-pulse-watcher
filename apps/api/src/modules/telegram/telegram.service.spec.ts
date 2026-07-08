import type { Telegraf } from 'telegraf';
import type {
  UpdateUserSettingsService,
  GetUserByTelegramIdService,
} from '@home-pulse-watcher/application';
import type { User } from '@home-pulse-watcher/core';
import type { TelegramConfig } from './telegram.config';
import type { TelegramContext } from './types/telegram-context.type';
import { TelegramService } from './telegram.service';
import { TranslationService } from './i18n/index';
import type { StartHandler } from './handlers/start.handler';
import type { StatusHandler } from './handlers/status.handler';
import type { DevicesHandler } from './handlers/devices.handler';
import type { HelpHandler } from './handlers/help.handler';
import type { HistoryHandler } from './handlers/history.handler';
import type { SettingsHandler } from './handlers/settings.handler';

type HearsCallback = (ctx: TelegramContext) => Promise<void>;
type ActionCallback = (ctx: TelegramContext) => Promise<void>;

describe('TelegramService', () => {
  const createMockBot = (): jest.Mocked<Telegraf<TelegramContext>> =>
    ({
      command: jest.fn(),
      hears: jest.fn(),
      action: jest.fn(),
      on: jest.fn(),
      catch: jest.fn(),
      launch: jest.fn(),
      stop: jest.fn(),
      telegram: {
        setWebhook: jest.fn().mockResolvedValue(true),
        getWebhookInfo: jest
          .fn()
          .mockResolvedValue({ url: '', pending_update_count: 0 }),
      },
    }) as unknown as jest.Mocked<Telegraf<TelegramContext>>;

  const createMockDeps = () => ({
    updateUserSettingsService: {
      run: jest.fn(),
    } as unknown as UpdateUserSettingsService,
    getUserByTelegramId: {
      run: jest.fn(),
    } as unknown as jest.Mocked<GetUserByTelegramIdService>,
    startHandler: {} as StartHandler,
    statusHandler: { handle: jest.fn() } as unknown as StatusHandler,
    devicesHandler: { handle: jest.fn() } as unknown as DevicesHandler,
    helpHandler: { handle: jest.fn() } as unknown as HelpHandler,
    historyHandler: { handle: jest.fn() } as unknown as HistoryHandler,
    settingsHandler: { handle: jest.fn() } as unknown as SettingsHandler,
  });

  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(12345),
    username: 'testuser',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date(),
  } as User;

  const createMockCtx = (): TelegramContext =>
    ({
      from: { id: 12345 },
      reply: jest.fn(),
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
    }) as unknown as TelegramContext;

  const createService = (
    bot: Telegraf<TelegramContext> | null,
    config: TelegramConfig | null,
  ): TelegramService => {
    const deps = createMockDeps();
    return new TelegramService(
      bot,
      config,
      deps.updateUserSettingsService,
      deps.getUserByTelegramId,
      deps.startHandler,
      deps.statusHandler,
      deps.devicesHandler,
      deps.helpHandler,
      deps.historyHandler,
      deps.settingsHandler,
      new TranslationService(),
    );
  };

  const createServiceWithDeps = (
    bot: Telegraf<TelegramContext>,
    config: TelegramConfig,
  ): {
    service: TelegramService;
    deps: ReturnType<typeof createMockDeps>;
  } => {
    const deps = createMockDeps();
    const service = new TelegramService(
      bot,
      config,
      deps.updateUserSettingsService,
      deps.getUserByTelegramId,
      deps.startHandler,
      deps.statusHandler,
      deps.devicesHandler,
      deps.helpHandler,
      deps.historyHandler,
      deps.settingsHandler,
      new TranslationService(),
    );
    return { service, deps };
  };

  const defaultConfig: TelegramConfig = {
    botToken: 'test-token',
    useWebhook: true,
    webhookDomain: 'https://example.com',
  };

  describe('onModuleInit', () => {
    it('should skip initialization when bot is null', async () => {
      const service = createService(null, null);
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('should register /start command and hears handlers', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookDomain: 'https://example.com',
      };
      const service = createService(bot, config);

      await service.onModuleInit();

      // Only /start slash command
      expect(bot.command).toHaveBeenCalledTimes(1);
      expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function));

      // 4 hears: status, devices, settings, help
      expect(bot.hears).toHaveBeenCalledTimes(4);

      // 6 actions: check_status, view_history, settings:language, settings:timezone, /^lang:/, /^tz:/
      expect(bot.action).toHaveBeenCalledTimes(6);

      // 1 catch-all text handler
      expect(bot.on).toHaveBeenCalledWith('text', expect.any(Function));
    });

    it('should set webhook in webhook mode', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookDomain: 'https://example.com',
      };
      const service = createService(bot, config);

      await service.onModuleInit();

      expect(bot.telegram.setWebhook).toHaveBeenCalledWith(
        'https://example.com/api/telegram/webhook',
        {},
      );
      expect(bot.launch).not.toHaveBeenCalled();
    });

    it('should pass webhook secret to setWebhook when configured', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookDomain: 'https://example.com',
        webhookSecret: 'my-secret',
      };
      const service = createService(bot, config);

      await service.onModuleInit();

      expect(bot.telegram.setWebhook).toHaveBeenCalledWith(
        'https://example.com/api/telegram/webhook',
        { secret_token: 'my-secret' },
      );
    });

    it('should start polling in development mode', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: false,
      };
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      const service = createService(bot, config);
      await service.onModuleInit();

      expect(bot.launch).toHaveBeenCalled();
      expect(bot.telegram.setWebhook).not.toHaveBeenCalled();

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should block polling in production mode', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: false,
      };
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      const service = createService(bot, config);
      await service.onModuleInit();

      expect(bot.launch).not.toHaveBeenCalled();
      expect(bot.telegram.setWebhook).not.toHaveBeenCalled();

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('webhook retry', () => {
    it('should retry on transient setWebhook failure', async () => {
      jest.useFakeTimers();
      const bot = createMockBot();
      (bot.telegram.setWebhook as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true);

      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookDomain: 'https://example.com',
      };
      const service = createService(bot, config);

      const initPromise = service.onModuleInit();
      // Advance past the retry delay (1000ms for first retry)
      await jest.advanceTimersByTimeAsync(1000);
      await initPromise;

      expect(bot.telegram.setWebhook).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('should give up after max retries', async () => {
      jest.useFakeTimers();
      const bot = createMockBot();
      (bot.telegram.setWebhook as jest.Mock).mockRejectedValue(
        new Error('Persistent failure'),
      );

      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookDomain: 'https://example.com',
      };
      const service = createService(bot, config);

      const initPromise = service.onModuleInit();
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await initPromise;

      expect(bot.telegram.setWebhook).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });
  });

  describe('onModuleDestroy', () => {
    it('should call bot.stop() in polling mode', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: false,
      };
      const service = createService(bot, config);

      await service.onModuleDestroy();

      expect(bot.stop).toHaveBeenCalledWith('SIGTERM');
    });

    it('should NOT call bot.stop() in webhook mode', async () => {
      const bot = createMockBot();
      const config: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookDomain: 'https://example.com',
      };
      const service = createService(bot, config);

      await service.onModuleDestroy();

      expect(bot.stop).not.toHaveBeenCalled();
    });

    it('should do nothing when bot is null', async () => {
      const service = createService(null, null);
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('help button (help-handler locale attach)', () => {
    it('attaches user to ctx when found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: mockUser,
      });

      await service.onModuleInit();

      // 4th hears() call registers help button (status, devices, settings, help)
      const helpCallback = (bot.hears as jest.Mock).mock
        .calls[3][1] as HearsCallback;
      const ctx = createMockCtx();
      await helpCallback(ctx);

      expect(deps.getUserByTelegramId.run).toHaveBeenCalledWith({
        telegramId: '12345',
      });
      expect(ctx.user).toEqual(mockUser);
      expect(deps.helpHandler.handle).toHaveBeenCalledWith(ctx);
    });

    it('proceeds without attaching user when not found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: null,
      });

      await service.onModuleInit();

      const helpCallback = (bot.hears as jest.Mock).mock
        .calls[3][1] as HearsCallback;
      const ctx = createMockCtx();
      await helpCallback(ctx);

      expect(ctx.user).toBeUndefined();
      expect(deps.helpHandler.handle).toHaveBeenCalledWith(ctx);
    });
  });

  describe('catch-all text handler', () => {
    it('replies UNKNOWN_COMMAND when user found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: mockUser,
      });

      await service.onModuleInit();

      const textCallback = (bot.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'text',
      )[1] as HearsCallback;
      const ctx = createMockCtx();
      await textCallback(ctx);

      const msgs = new TranslationService().getMessages(mockUser.locale);
      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.UNKNOWN_COMMAND,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('ignores unregistered users silently', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: null,
      });

      await service.onModuleInit();

      const textCallback = (bot.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'text',
      )[1] as HearsCallback;
      const ctx = createMockCtx();
      await textCallback(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('withAuth (status button)', () => {
    it('replies NOT_REGISTERED and does not call handler when user not found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: null,
      });

      await service.onModuleInit();

      // 1st hears() call registers status button
      const statusCallback = (bot.hears as jest.Mock).mock
        .calls[0][1] as HearsCallback;
      const ctx = createMockCtx();
      await statusCallback(ctx);

      const msgs = new TranslationService().getMessages();
      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.NOT_REGISTERED,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
      expect(deps.statusHandler.handle).not.toHaveBeenCalled();
    });

    it('attaches user and calls handler when user found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: mockUser,
      });

      await service.onModuleInit();

      const statusCallback = (bot.hears as jest.Mock).mock
        .calls[0][1] as HearsCallback;
      const ctx = createMockCtx();
      await statusCallback(ctx);

      expect(ctx.user).toEqual(mockUser);
      expect(deps.statusHandler.handle).toHaveBeenCalledWith(ctx);
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('resolveUser (settings:language action)', () => {
    it('silently no-ops when user not found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: null,
      });

      await service.onModuleInit();

      const languageActionCallback = (bot.action as jest.Mock).mock.calls.find(
        (call) => call[0] === 'settings:language',
      )[1] as ActionCallback;
      const ctx = createMockCtx();
      await languageActionCallback(ctx);

      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });

    it('resolves user and shows language keyboard when found', async () => {
      const bot = createMockBot();
      const { service, deps } = createServiceWithDeps(bot, defaultConfig);
      (deps.getUserByTelegramId.run as jest.Mock).mockResolvedValue({
        data: mockUser,
      });

      await service.onModuleInit();

      const languageActionCallback = (bot.action as jest.Mock).mock.calls.find(
        (call) => call[0] === 'settings:language',
      )[1] as ActionCallback;
      const ctx = createMockCtx();
      await languageActionCallback(ctx);

      const msgs = new TranslationService().getMessages(mockUser.locale);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        msgs.SETTINGS_LANGUAGE_HEADER,
        expect.any(Object),
      );
    });
  });
});
