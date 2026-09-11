import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GetUserDevicesOverviewService } from '@home-pulse-watcher/application';
import { DeviceRole } from '@home-pulse-watcher/core';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TranslationService } from '../i18n/index.js';
import {
  escapeMarkdownV2,
  boldMd,
  codeMd,
} from '../formatters/escape-markdown.js';
import {
  buildMainMenuKeyboard,
  buildDeviceManageKeyboard,
} from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles devices display — lists user's linked devices.
 * Requires authenticated user.
 */
@Injectable()
export class DevicesHandler {
  private readonly logger = new Logger(DevicesHandler.name);

  constructor(
    @Inject(SERVICE_TOKENS.GET_USER_DEVICES_OVERVIEW)
    private readonly getUserDevicesOverviewService: GetUserDevicesOverviewService,
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
      const { data } = await this.getUserDevicesOverviewService.run({
        userId: user.id,
      });

      if (data.devices.length === 0) {
        await ctx.reply(msgs.NO_DEVICES, {
          parse_mode: 'MarkdownV2',
          ...buildMainMenuKeyboard(msgs),
        });
        return;
      }

      // Build device list message
      const lines = [`${boldMd(escapeMarkdownV2(msgs.YOUR_DEVICES_HEADER))}\n`];
      const manageableDevices: { id: string; label: string }[] = [];

      for (const { device, customName, role } of data.devices) {
        const rawLabel = customName ?? device.label ?? device.macAddress;
        const label = escapeMarkdownV2(rawLabel);
        const online = device.isOnline() ? '🟢' : '🔴';
        lines.push(`${online} ${boldMd(label)}`);
        lines.push(`   ${msgs.MAC_LABEL} ${codeMd(device.macAddress)}`);
        lines.push(`   ${msgs.ROLE_LABEL} ${escapeMarkdownV2(role)}`);
        const firmwareVersion =
          device.firmwareVersion ?? msgs.FIRMWARE_VERSION_UNKNOWN;
        lines.push(
          `   ${msgs.FIRMWARE_LABEL} ${escapeMarkdownV2(firmwareVersion)}`,
        );
        lines.push(
          `   ${msgs.RELEASE_CHANNEL_LABEL} ${escapeMarkdownV2(device.releaseChannel)}\n`,
        );

        if (role === DeviceRole.EDITOR || role === DeviceRole.OWNER) {
          manageableDevices.push({ id: device.id, label: rawLabel });
        }
      }

      await ctx.reply(
        lines.join('\n'),
        manageableDevices.length > 0
          ? {
              parse_mode: 'MarkdownV2',
              ...buildDeviceManageKeyboard(msgs, manageableDevices),
            }
          : { parse_mode: 'MarkdownV2', ...buildMainMenuKeyboard(msgs) },
      );
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
