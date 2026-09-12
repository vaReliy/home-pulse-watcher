import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CreateUserService,
  GetUserByTelegramIdService,
} from '@home-pulse-watcher/application';
import { DomainError, DomainErrorCode } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TranslationService } from '../i18n/index.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/** Number of trailing characters of a Telegram user ID kept when logging. */
const MASKED_TELEGRAM_ID_VISIBLE_CHARS = 4;

/**
 * Truncates a Telegram numeric user ID for log output, keeping only the last
 * {@link MASKED_TELEGRAM_ID_VISIBLE_CHARS} characters. A Telegram ID is a
 * stable per-user identifier (PII) and must never be logged in full — see
 * docs/KNOWLEDGE_INBOX.md "Debug-log PII redaction".
 */
function maskTelegramId(telegramId: string): string {
  if (telegramId.length <= MASKED_TELEGRAM_ID_VISIBLE_CHARS) {
    return '***';
  }
  return `...${telegramId.slice(-MASKED_TELEGRAM_ID_VISIBLE_CHARS)}`;
}

/**
 * Handles /start command - user registration.
 * This command works for unregistered users.
 */
@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    @Inject(SERVICE_TOKENS.CREATE_USER)
    private readonly createUserService: CreateUserService,
    @Inject(SERVICE_TOKENS.GET_USER_BY_TELEGRAM_ID)
    private readonly getUserByTelegramId: GetUserByTelegramIdService,
    private readonly translationService: TranslationService,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const telegramId = ctx.from?.id;
    const username = ctx.from?.username;
    const msgs = this.translationService.getMessages();

    if (!telegramId) {
      await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      // Check if already registered
      const { data: existing } = await this.getUserByTelegramId.run({
        telegramId: telegramId.toString(),
      });
      if (existing) {
        const existingMsgs = this.translationService.getMessages(
          existing.locale,
        );
        await ctx.reply(existingMsgs.ALREADY_REGISTERED, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(existingMsgs),
        });
        return;
      }

      // Create new user
      await this.createUserService.run({
        telegramId: telegramId.toString(),
        username: username ?? undefined,
      });

      await ctx.reply(msgs.WELCOME, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
      this.logger.log(
        `New user registered: ${maskTelegramId(telegramId.toString())}`,
      );
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === DomainErrorCode.USER_ALREADY_EXISTS
      ) {
        await ctx.reply(msgs.ALREADY_REGISTERED, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(msgs),
        });
        return;
      }

      this.logger.error(
        'Failed to register user',
        error instanceof Error ? error.stack : String(error),
      );
      await ctx.reply(msgs.ERROR_GENERIC, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    }
  }
}
