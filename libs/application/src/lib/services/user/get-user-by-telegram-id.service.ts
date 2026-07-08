import type { IUserRepository, User } from '@home-pulse-watcher/core';
import {
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface GetUserByTelegramIdInput {
  telegramId: string;
}

/**
 * Looks up a user by their Telegram ID. Returns `null` if not found —
 * callers are responsible for their own not-found branching (this service
 * does not throw a domain error on miss).
 */
export class GetUserByTelegramIdService extends BaseService<
  GetUserByTelegramIdInput,
  User | null
> {
  constructor(private readonly userRepository: IUserRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      telegramId: ['required', 'string', 'telegramId'],
    };
  }

  protected async execute(
    params: GetUserByTelegramIdInput,
    _context: ServiceContext,
  ): Promise<User | null> {
    const telegramId = BigInt(params.telegramId);
    return this.userRepository.findByTelegramId(telegramId);
  }
}
