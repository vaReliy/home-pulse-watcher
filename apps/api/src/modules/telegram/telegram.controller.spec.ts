import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Telegraf } from 'telegraf';
import type { TelegramConfig } from './telegram.config';
import type { TelegramContext } from './types/telegram-context.type';
import { TelegramController } from './telegram.controller';

describe('TelegramController', () => {
  const createMockResponse = (): jest.Mocked<Response> => {
    const res = {
      sendStatus: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    } as unknown as jest.Mocked<Response>;
    // Make res.status() chainable → returns the same res so .json() can be called
    (res.status as jest.Mock).mockReturnValue(res);
    return res;
  };

  const createMockRequest = (
    body: unknown = {},
    headers: Record<string, string> = {},
  ): Request => ({ body, headers }) as unknown as Request;

  const createMockBot = (): jest.Mocked<Telegraf<TelegramContext>> =>
    ({
      handleUpdate: jest.fn(),
    }) as unknown as jest.Mocked<Telegraf<TelegramContext>>;

  const secretConfig: TelegramConfig = {
    botToken: 'test-token',
    useWebhook: true,
    webhookSecret: 'my-secret-token',
  };

  describe('handleWebhook', () => {
    it('should respond 200 and delegate update to bot when secret matches', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockResolvedValue(undefined);
      const controller = new TelegramController(bot, secretConfig);

      const body = { update_id: 1, message: { text: '/start' } };
      const req = createMockRequest(body, {
        'x-telegram-bot-api-secret-token': 'my-secret-token',
      });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).toHaveBeenCalledWith(body);
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should respond 200 when bot is null (not configured)', async () => {
      const controller = new TelegramController(null, null);
      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should respond 200 even when bot.handleUpdate throws', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockRejectedValue(new Error('Processing failed'));
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': 'my-secret-token' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should pass request body directly to bot.handleUpdate', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockResolvedValue(undefined);
      const controller = new TelegramController(bot, secretConfig);

      const body = {
        update_id: 42,
        message: {
          message_id: 1,
          chat: { id: 123, type: 'private' },
          text: '/status',
        },
      };
      const req = createMockRequest(body, {
        'x-telegram-bot-api-secret-token': 'my-secret-token',
      });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).toHaveBeenCalledWith(body);
    });
  });

  describe('webhook secret validation', () => {
    it('should respond 200 when valid secret is provided', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockResolvedValue(undefined);
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': 'my-secret-token' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should respond 401 when invalid secret is provided', async () => {
      const bot = createMockBot();
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('should respond 401 when secret header is missing', async () => {
      const bot = createMockBot();
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('should respond 503 when bot is configured but no webhook secret is set', async () => {
      const bot = createMockBot();
      const noSecretConfig: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        // webhookSecret intentionally absent
      };
      const controller = new TelegramController(bot, noSecretConfig);

      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Webhook not configured',
      });
    });

    it('should respond 503 when webhookSecret is empty string', async () => {
      const bot = createMockBot();
      const emptySecretConfig: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookSecret: '',
      };
      const controller = new TelegramController(bot, emptySecretConfig);

      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Webhook not configured',
      });
    });

    it('should respond 401 for request with empty secret header when config has empty webhookSecret', async () => {
      const bot = createMockBot();
      const emptySecretConfig: TelegramConfig = {
        botToken: 'test-token',
        useWebhook: true,
        webhookSecret: '',
      };
      const controller = new TelegramController(bot, emptySecretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': '' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      // Empty string config → treated as unconfigured → 503
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });

  describe('timing-safe secret comparison', () => {
    it('responds 401 when secret header is missing', async () => {
      const bot = createMockBot();
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('responds 401 when secret header has wrong value', async () => {
      const bot = createMockBot();
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('responds 401 when secret has correct content but different length prefix', async () => {
      const bot = createMockBot();
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': 'my-secret-token-extra' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('proceeds when secret header matches', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockResolvedValue(undefined);
      const controller = new TelegramController(bot, secretConfig);

      const req = createMockRequest(
        { update_id: 1 },
        { 'x-telegram-bot-api-secret-token': 'my-secret-token' },
      );
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });
  });
});
