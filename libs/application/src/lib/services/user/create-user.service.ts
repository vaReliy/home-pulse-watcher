import type { IUserRepository, User } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface CreateUserInput {
  telegramId: string;
  username?: string;
}

export class CreateUserService extends BaseService<CreateUserInput, User> {
  constructor(private readonly userRepository: IUserRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      telegramId: ['required', 'string', 'telegramId'],
      username: { max_length: 100 },
    };
  }

  protected async execute(
    params: CreateUserInput,
    _context: ServiceContext,
  ): Promise<User> {
    const telegramId = BigInt(params.telegramId);

    const existing = await this.userRepository.existsByTelegramId(telegramId);
    if (existing) {
      throw new DomainError(
        DomainErrorCode.USER_ALREADY_EXISTS,
        `User with Telegram ID ${params.telegramId} already exists`,
      );
    }

    return this.userRepository.create({
      telegramId,
      username: params.username ?? null,
    });
  }
}
