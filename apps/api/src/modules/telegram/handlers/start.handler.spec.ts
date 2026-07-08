import type {
  CreateUserService,
  GetUserByTelegramIdService,
} from '@home-pulse-watcher/application';
import type { User } from '@home-pulse-watcher/core';
import { DomainError, DomainErrorCode } from '@home-pulse-watcher/shared';
import { StartHandler } from './start.handler.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

describe('StartHandler', () => {
  const translationService = new TranslationService();

  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(12345),
    username: 'testuser',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date(),
  } as User;

  const createMockCreateUserService = (): jest.Mocked<
    Pick<CreateUserService, 'run'>
  > => ({
    run: jest.fn(),
  });

  const createMockGetUserByTelegramId = (): jest.Mocked<
    Pick<GetUserByTelegramIdService, 'run'>
  > => ({
    run: jest.fn(),
  });

  const createMockContext = (): TelegramContext =>
    ({
      from: { id: 12345, username: 'testuser' },
      reply: jest.fn(),
    }) as unknown as TelegramContext;

  it('calls CreateUserService.run when telegramId not registered', async () => {
    const createUserService = createMockCreateUserService();
    const getUserByTelegramId = createMockGetUserByTelegramId();
    getUserByTelegramId.run.mockResolvedValue({ data: null });
    createUserService.run.mockResolvedValue({ data: mockUser });

    const handler = new StartHandler(
      createUserService as unknown as CreateUserService,
      getUserByTelegramId as unknown as GetUserByTelegramIdService,
      translationService,
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    expect(getUserByTelegramId.run).toHaveBeenCalledWith({
      telegramId: '12345',
    });
    expect(createUserService.run).toHaveBeenCalledWith({
      telegramId: '12345',
      username: 'testuser',
    });

    const msgs = translationService.getMessages();
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.WELCOME,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  it('replies ALREADY_REGISTERED and does NOT call CreateUserService when already registered', async () => {
    const createUserService = createMockCreateUserService();
    const getUserByTelegramId = createMockGetUserByTelegramId();
    getUserByTelegramId.run.mockResolvedValue({ data: mockUser });

    const handler = new StartHandler(
      createUserService as unknown as CreateUserService,
      getUserByTelegramId as unknown as GetUserByTelegramIdService,
      translationService,
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    expect(createUserService.run).not.toHaveBeenCalled();

    const msgs = translationService.getMessages(mockUser.locale);
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.ALREADY_REGISTERED,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  it('replies ERROR_GENERIC when telegramId missing from ctx', async () => {
    const createUserService = createMockCreateUserService();
    const getUserByTelegramId = createMockGetUserByTelegramId();

    const handler = new StartHandler(
      createUserService as unknown as CreateUserService,
      getUserByTelegramId as unknown as GetUserByTelegramIdService,
      translationService,
    );

    const ctx = {
      from: undefined,
      reply: jest.fn(),
    } as unknown as TelegramContext;
    await handler.handle(ctx);

    expect(getUserByTelegramId.run).not.toHaveBeenCalled();
    const msgs = translationService.getMessages();
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.ERROR_GENERIC,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  it('replies ALREADY_REGISTERED when CreateUserService throws USER_ALREADY_EXISTS race', async () => {
    const createUserService = createMockCreateUserService();
    const getUserByTelegramId = createMockGetUserByTelegramId();
    getUserByTelegramId.run.mockResolvedValue({ data: null });
    createUserService.run.mockRejectedValue(
      new DomainError(
        DomainErrorCode.USER_ALREADY_EXISTS,
        'User already exists',
      ),
    );

    const handler = new StartHandler(
      createUserService as unknown as CreateUserService,
      getUserByTelegramId as unknown as GetUserByTelegramIdService,
      translationService,
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    const msgs = translationService.getMessages();
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.ALREADY_REGISTERED,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });

  it('replies ERROR_GENERIC on unexpected error from CreateUserService', async () => {
    const createUserService = createMockCreateUserService();
    const getUserByTelegramId = createMockGetUserByTelegramId();
    getUserByTelegramId.run.mockResolvedValue({ data: null });
    createUserService.run.mockRejectedValue(new Error('DB error'));

    const handler = new StartHandler(
      createUserService as unknown as CreateUserService,
      getUserByTelegramId as unknown as GetUserByTelegramIdService,
      translationService,
    );

    const ctx = createMockContext();
    await handler.handle(ctx);

    const msgs = translationService.getMessages();
    expect(ctx.reply).toHaveBeenCalledWith(
      msgs.ERROR_GENERIC,
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    );
  });
});
