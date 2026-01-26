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
   * Create a new user.
   */
  create(data: { telegramId: bigint; username?: string | null }): Promise<User>;

  /**
   * Update user data.
   */
  update(id: string, data: { username?: string | null }): Promise<User>;

  /**
   * Delete user by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Check if user exists by Telegram ID.
   */
  existsByTelegramId(telegramId: bigint): Promise<boolean>;
}
