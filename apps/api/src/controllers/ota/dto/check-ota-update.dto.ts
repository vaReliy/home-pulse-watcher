import type { LivrRules } from '@home-pulse-watcher/shared';

/**
 * LIVR validation rules for the OTA update check request body.
 * Applied at the controller boundary before the service is invoked.
 */
export const checkOtaUpdateRules: LivrRules = {
  boardType: ['required', { one_of: ['esp32c3', 'esp32c6'] }],
  currentVersion: ['required', 'string', { max_length: 20 }],
  channel: ['required', { one_of: ['ALPHA', 'BETA', 'STABLE'] }],
};

/** Request body for OTA update check. */
export class CheckOtaUpdateDto {
  boardType!: string;
  currentVersion!: string;
  channel!: string;
}
