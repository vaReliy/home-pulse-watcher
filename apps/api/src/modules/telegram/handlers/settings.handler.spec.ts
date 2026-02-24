import type { User } from '@home-pulse-watcher/core';
import { SettingsHandler } from './settings.handler.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

describe('SettingsHandler', () => {
  const translationService = new TranslationService();

  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(12345),
    username: 'testuser',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date(),
  } as User;

  const createMockContext = (user?: User): TelegramContext =>
    ({
      user: user ?? null,
      reply: jest.fn(),
      from: { id: 12345 },
    }) as unknown as TelegramContext;

  it('should reply NOT_REGISTERED when no user', async () => {
    const handler = new SettingsHandler(translationService);
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

  it('should show settings screen with inline keyboard', async () => {
    const handler = new SettingsHandler(translationService);
    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const msgs = translationService.getMessages('uk');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining(msgs.SETTINGS_HEADER),
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      }),
    );
  });

  it('should display current locale and timezone', async () => {
    const handler = new SettingsHandler(translationService);
    const ctx = createMockContext(mockUser);
    await handler.handle(ctx);

    const message = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('uk');
    expect(message).toContain('Europe/Kyiv');
  });

  it('should use user locale for messages', async () => {
    const enUser = { ...mockUser, locale: 'en' } as User;
    const handler = new SettingsHandler(translationService);
    const ctx = createMockContext(enUser);
    await handler.handle(ctx);

    const msgs = translationService.getMessages('en');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining(msgs.SETTINGS_HEADER),
      expect.any(Object),
    );
  });
});
