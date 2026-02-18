import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IDeviceRepository,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import { REPOSITORY_TOKENS } from '../../repositories/repository.tokens.js';
import { MessageFormatter } from '../formatters/message.formatter.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

/**
 * Handles /devices command - lists user's linked devices.
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
    private readonly messageFormatter: MessageFormatter,
    private readonly translationService: TranslationService,
  ) {}

  async handle(ctx: TelegramContext): Promise<void> {
    const user = ctx.user;
    if (!user) {
      const msgs = this.translationService.getMessages();
      await ctx.reply(msgs.NOT_REGISTERED, { parse_mode: 'HTML' });
      return;
    }

    const msgs = this.translationService.getMessages(user.locale);

    try {
      const userDevices = await this.userDeviceRepository.findByUserId(user.id);

      if (userDevices.length === 0) {
        await ctx.reply(msgs.NO_DEVICES, { parse_mode: 'HTML' });
        return;
      }

      // Build device list message
      const lines = [`<b>${msgs.YOUR_DEVICES_HEADER}</b>\n`];

      for (const ud of userDevices) {
        const device = await this.deviceRepository.findById(ud.deviceId);
        if (device) {
          const rawLabel = ud.customName ?? device.label ?? device.macAddress;
          const label = this.messageFormatter.escapeHtml(rawLabel);
          const mac = this.messageFormatter.escapeHtml(device.macAddress);
          const online = device.isOnline() ? '🟢' : '🔴';
          lines.push(`${online} <b>${label}</b>`);
          lines.push(`   ${msgs.MAC_LABEL} <code>${mac}</code>`);
          lines.push(`   ${msgs.ROLE_LABEL} ${ud.role}\n`);
        }
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Failed to list devices', error);
      await ctx.reply(msgs.ERROR_GENERIC);
    }
  }
}
