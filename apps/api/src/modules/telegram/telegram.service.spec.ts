import type { Telegraf } from 'telegraf';
import type { IUserRepository } from '@home-pulse-watcher/core';
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
    userRepository: {} as IUserRepository,
    startHandler: {} as StartHandler,
    statusHandler: {} as StatusHandler,
    devicesHandler: {} as DevicesHandler,
    helpHandler: {} as HelpHandler,
    historyHandler: {} as HistoryHandler,
    settingsHandler: {} as SettingsHandler,
  });

  const createService = (
    bot: Telegraf<TelegramContext> | null,
    config: TelegramConfig | null,
  ): TelegramService => {
    const deps = createMockDeps();
    return new TelegramService(
      bot,
      config,
      deps.userRepository,
      deps.startHandler,
      deps.statusHandler,
      deps.devicesHandler,
      deps.helpHandler,
      deps.historyHandler,
      deps.settingsHandler,
      new TranslationService(),
    );
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
});
