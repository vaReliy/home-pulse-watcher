import type { Context } from 'telegraf';
import type { User } from '@home-pulse-watcher/core';

/**
 * Extended Telegraf context with authenticated user.
 * The user field is populated by authentication middleware for protected commands.
 */
export interface TelegramContext extends Context {
  /** Populated by user auth middleware for protected commands */
  user?: User;
}
