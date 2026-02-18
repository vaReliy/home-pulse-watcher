import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IUserRepository } from '@home-pulse-watcher/core';
import type { CreateUserService } from '@home-pulse-watcher/application';
import { DomainError, DomainErrorCode } from '@home-pulse-watcher/shared';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

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
    @Inject(REPOSITORY_TOKENS.USER)
    private readonly userRepository: IUserRepository,
    private readonly translationService: TranslationService,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const telegramId = ctx.from?.id;
    const username = ctx.from?.username;
    const msgs = this.translationService.getMessages();

    if (!telegramId) {
      await ctx.reply(msgs.ERROR_GENERIC);
      return;
    }

    try {
      // Check if already registered
      const existing = await this.userRepository.findByTelegramId(
        BigInt(telegramId),
      );
      if (existing) {
        const existingMsgs = this.translationService.getMessages(
          existing.locale,
        );
        await ctx.reply(existingMsgs.ALREADY_REGISTERED, {
          parse_mode: 'HTML',
        });
        return;
      }

      // Create new user
      await this.createUserService.run({
        telegramId: telegramId.toString(),
        username: username ?? undefined,
      });

      await ctx.reply(msgs.WELCOME, { parse_mode: 'HTML' });
      this.logger.log(`New user registered: ${telegramId}`);
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === DomainErrorCode.USER_ALREADY_EXISTS
      ) {
        await ctx.reply(msgs.ALREADY_REGISTERED, { parse_mode: 'HTML' });
        return;
      }

      this.logger.error('Failed to register user', error);
      await ctx.reply(msgs.ERROR_GENERIC);
    }
  }
}
