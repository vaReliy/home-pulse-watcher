import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { UnlinkDeviceFromUserService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface UnlinkDeviceFromUserOptions {
  telegramId?: string;
  userId?: string;
  mac?: string;
  deviceId?: string;
}

@Command({
  name: 'device:unlink',
  description: 'Unlink an ESP32 device from a user account',
})
export class UnlinkDeviceFromUserCommand extends CommandRunner {
  private readonly logger = new Logger(UnlinkDeviceFromUserCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.UNLINK_DEVICE_FROM_USER)
    private readonly unlinkDeviceFromUserService: UnlinkDeviceFromUserService,
  ) {
    super();
  }

  async run(
    _inputs: string[],
    options: UnlinkDeviceFromUserOptions,
  ): Promise<void> {
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

      const result = await this.unlinkDeviceFromUserService.run({
        telegramId: options.telegramId,
        userId: options.userId,
        mac: options.mac,
        deviceId: options.deviceId,
      });

      const { user, device } = result.data;

      console.log('\n=== Device Unlinked Successfully ===');
      console.log(`Device:      ${device.label ?? device.macAddress}`);
      console.log(`MAC Address: ${device.macAddress}`);
      console.log(
        `User:        ${user.username ?? user.telegramId.toString()}`,
      );
      console.log(`User ID:     ${user.id}\n`);
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
}
