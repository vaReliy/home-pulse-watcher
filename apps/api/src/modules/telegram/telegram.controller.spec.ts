import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Telegraf } from 'telegraf';
import type { TelegramContext } from './types/telegram-context.type';
import { TelegramController } from './telegram.controller';

describe('TelegramController', () => {
  const createMockResponse = (): jest.Mocked<Response> =>
    ({
      sendStatus: jest.fn(),
    }) as unknown as jest.Mocked<Response>;

  const createMockRequest = (body: unknown = {}): Request =>
    ({ body }) as unknown as Request;

  const createMockBot = (): jest.Mocked<Telegraf<TelegramContext>> =>
    ({
      handleUpdate: jest.fn(),
    }) as unknown as jest.Mocked<Telegraf<TelegramContext>>;

  describe('handleWebhook', () => {
    it('should respond 200 and delegate update to bot', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockResolvedValue(undefined);
      const controller = new TelegramController(bot);

      const body = { update_id: 1, message: { text: '/start' } };
      const req = createMockRequest(body);
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).toHaveBeenCalledWith(body);
      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should respond 200 when bot is null (not configured)', async () => {
      const controller = new TelegramController(null);
      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should respond 200 even when bot.handleUpdate throws', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockRejectedValue(new Error('Processing failed'));
      const controller = new TelegramController(bot);

      const req = createMockRequest({ update_id: 1 });
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should pass request body directly to bot.handleUpdate', async () => {
      const bot = createMockBot();
      bot.handleUpdate.mockResolvedValue(undefined);
      const controller = new TelegramController(bot);

      const body = {
        update_id: 42,
        message: {
          message_id: 1,
          chat: { id: 123, type: 'private' },
          text: '/status',
        },
      };
      const req = createMockRequest(body);
      const res = createMockResponse();

      await controller.handleWebhook(req, res);

      expect(bot.handleUpdate).toHaveBeenCalledWith(body);
    });
  });
});
