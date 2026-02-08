import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { LinkDeviceToUserService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface LinkDeviceToUserOptions {
  telegramId?: string;
  userId?: string;
  mac?: string;
  deviceId?: string;
  role?: string;
}

@Command({
  name: 'device:link',
  description: 'Link an ESP32 device to a user account',
})
export class LinkDeviceToUserCommand extends CommandRunner {
  private readonly logger = new Logger(LinkDeviceToUserCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.LINK_DEVICE_TO_USER)
    private readonly linkDeviceToUserService: LinkDeviceToUserService,
  ) {
    super();
  }

  async run(_inputs: string[], options: LinkDeviceToUserOptions): Promise<void> {
    try {
      if (!options.telegramId && !options.userId) {
        throw new Error(
          'Either --telegram-id or --user-id is required to identify the user',
        );
      }

      if (!options.mac && !options.deviceId) {
        throw new Error(
          'Either --mac or --device-id is required to identify the device',
        );
      }

      const result = await this.linkDeviceToUserService.run({
        telegramId: options.telegramId,
        userId: options.userId,
        mac: options.mac,
        deviceId: options.deviceId,
        role: options.role,
      });

      const { userDevice, user, device } = result.data;

      console.log('\n=== Device Linked Successfully ===');
      console.log(`Device:      ${device.label ?? device.macAddress}`);
      console.log(`MAC Address: ${device.macAddress}`);
      console.log(`User:        ${user.username ?? user.telegramId.toString()}`);
      console.log(`User ID:     ${user.id}`);
      console.log(`Role:        ${userDevice.role}\n`);
    } catch (error) {
      if (error instanceof BaseError) {
        this.logger.error(`${error.code}: ${error.message}`);
      } else if (error instanceof Error) {
        this.logger.error(error.message);
      }
      process.exit(1);
    }
  }

  @Option({
    flags: '-t, --telegram-id <telegramId>',
    description: "User's Telegram ID",
  })
  parseTelegramId(val: string): string {
    return val;
  }

  @Option({
    flags: '-u, --user-id <userId>',
    description: "User's UUID (alternative to --telegram-id)",
  })
  parseUserId(val: string): string {
    return val;
  }

  @Option({
    flags: '-m, --mac <mac>',
    description: 'Device MAC address (format: AA:BB:CC:DD:EE:FF)',
  })
  parseMac(val: string): string {
    return val.toUpperCase();
  }

  @Option({
    flags: '-d, --device-id <deviceId>',
    description: 'Device UUID (alternative to --mac)',
  })
  parseDeviceId(val: string): string {
    return val;
  }

  @Option({
    flags: '-r, --role <role>',
    description: 'User role: OWNER, EDITOR, VIEWER (default: VIEWER)',
  })
  parseRole(val: string): string {
    const role = val.toUpperCase();
    const validRoles = ['OWNER', 'EDITOR', 'VIEWER'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role "${val}". Must be one of: ${validRoles.join(', ')}`);
    }
    return role;
  }
}
