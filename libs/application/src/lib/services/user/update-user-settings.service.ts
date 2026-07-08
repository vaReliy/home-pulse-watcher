import type { IUserRepository, User } from '@home-pulse-watcher/core';
import {
  type LivrRules,
  type ServiceContext,
} from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';

/**
 * Canonical locale choices, mirrored from the Telegram settings UI
 * (`apps/api/src/modules/telegram/telegram.service.ts` `VALID_LOCALES`).
 * Defense-in-depth only — the UI button list stays authoritative for what
 * users can actually pick.
 */
const VALID_LOCALES = ['uk', 'en'];

/**
 * Canonical timezone choices, mirrored from the Telegram settings UI
 * (`apps/api/src/modules/telegram/telegram.service.ts` `VALID_TIMEZONES`).
 * Defense-in-depth only — the UI button list stays authoritative for what
 * users can actually pick.
 */
const VALID_TIMEZONES = [
  'Europe/Kyiv',
  'Europe/London',
  'Europe/Warsaw',
  'US/Eastern',
];

export interface UpdateUserSettingsInput {
  userId: string;
  locale?: string;
  timezone?: string;
}

export interface UpdateUserSettingsOutput {
  user: User;
}

/**
 * Updates a user's locale and/or timezone preference.
 */
export class UpdateUserSettingsService extends BaseService<
  UpdateUserSettingsInput,
  UpdateUserSettingsOutput
> {
  constructor(private readonly userRepository: IUserRepository) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      userId: ['required', 'string'],
      locale: { one_of: VALID_LOCALES },
      timezone: { one_of: VALID_TIMEZONES },
    };
  }

  protected async execute(
    params: UpdateUserSettingsInput,
    _context: ServiceContext,
  ): Promise<UpdateUserSettingsOutput> {
    const user = await this.userRepository.update(params.userId, {
      ...(params.locale !== undefined && { locale: params.locale }),
      ...(params.timezone !== undefined && { timezone: params.timezone }),
    });

    return { user };
  }
}
