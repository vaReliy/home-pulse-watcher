import type { IUserRepository, User } from '@home-pulse-watcher/core';
import {
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

export interface ListUsersInput {
  username?: string;
}

export interface ListUsersOutput {
  users: User[];
  total: number;
}

/** Lists all registered users, with optional username filter. */
export class ListUsersService extends BaseService<
  ListUsersInput,
  ListUsersOutput
> {
  constructor(private readonly userRepository: IUserRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      username: { max_length: 100 },
    };
  }

  protected async execute(
    params: ListUsersInput,
    _context: ServiceContext,
  ): Promise<ListUsersOutput> {
    let users = await this.userRepository.findAll();

    if (params.username) {
      const filter = params.username.toLowerCase();
      users = users.filter((u) => u.username?.toLowerCase().includes(filter));
    }

    return {
      users,
      total: users.length,
    };
  }
}
