import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { TranslationService } from '../i18n/index.js';
import {
  escapeMarkdownV2,
  boldMd,
  codeMd,
} from '../formatters/escape-markdown.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles devices display — lists user's linked devices.
 * Requires authenticated user.
 */
@Injectable()
export class DevicesHandler {
  private readonly logger = new Logger(DevicesHandler.name);

  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
    @Inject(REPOSITORY_TOKENS.USER_DEVICE)
    private readonly userDeviceRepository: IUserDeviceRepository,
    private readonly translationService: TranslationService,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const user = ctx.user;
    if (!user) {
      const msgs = this.translationService.getMessages();
      await ctx.reply(msgs.NOT_REGISTERED, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
      return;
    }

    const msgs = this.translationService.getMessages(user.locale);

    try {
      const userDevices = await this.userDeviceRepository.findByUserId(user.id);

      if (userDevices.length === 0) {
        await ctx.reply(msgs.NO_DEVICES, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(msgs),
        });
        return;
      }

      // Build device list message
      const lines = [`${boldMd(escapeMarkdownV2(msgs.YOUR_DEVICES_HEADER))}\n`];

      for (const ud of userDevices) {
        const device = await this.deviceRepository.findById(ud.deviceId);
        if (device) {
          const rawLabel = ud.customName ?? device.label ?? device.macAddress;
          const label = escapeMarkdownV2(rawLabel);
          const online = device.isOnline() ? '🟢' : '🔴';
          lines.push(`${online} ${boldMd(label)}`);
          lines.push(`   ${msgs.MAC_LABEL} ${codeMd(device.macAddress)}`);
          lines.push(`   ${msgs.ROLE_LABEL} ${escapeMarkdownV2(ud.role)}`);
          const firmwareVersion =
            device.firmwareVersion ?? msgs.FIRMWARE_VERSION_UNKNOWN;
          lines.push(
            `   ${msgs.FIRMWARE_LABEL} ${escapeMarkdownV2(firmwareVersion)}\n`,
          );
        }
      }

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    } catch (error) {
      this.logger.error(
        'Failed to list devices',
        error instanceof Error ? error.stack : String(error),
      );
      await ctx.reply(msgs.ERROR_GENERIC, {
        parse_mode: 'MarkdownV2',
        ...buildMainMenuKeyboard(msgs),
      });
    }
  }
}
