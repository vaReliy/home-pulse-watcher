import type { User } from '../entities/user.entity.js';

/**
 * Repository interface for User entity operations.
 * Implemented by infrastructure layer adapters.
 */
export interface IUserRepository {
  /**
   * Find user by internal ID.
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find user by Telegram ID.
   */
  findByTelegramId(telegramId: bigint): Promise<User | null>;

  /**
   * Find multiple users by internal ID in a single query.
   * Returns only found rows — order is NOT guaranteed to match `ids`.
   * Callers must build an id→entity Map, never zip by index.
   * Empty `ids` short-circuits to `[]` without querying.
   */
  findByIds(ids: string[]): Promise<User[]>;

  /**
   * Create a new user.
   */
  create(data: {
    telegramId: bigint;
    username?: string | null;
    locale?: string;
    timezone?: string;
  }): Promise<User>;

  /**
   * Update user data.
   */
  update(
    id: string,
    data: { username?: string | null; locale?: string; timezone?: string },
  ): Promise<User>;

  /**
   * Delete user by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Find all users.
   */
  findAll(): Promise<User[]>;

  /**
   * Check if user exists by Telegram ID.
   */
  existsByTelegramId(telegramId: bigint): Promise<boolean>;
}
