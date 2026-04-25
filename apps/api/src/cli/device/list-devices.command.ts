import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { ListDevicesService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface ListDevicesOptions {
  userId?: string;
  telegramId?: string;
}

@Command({
  name: 'device:list',
  description: 'List registered devices',
})
export class ListDevicesCommand extends CommandRunner {
  private readonly logger = new Logger(ListDevicesCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.LIST_DEVICES)
    private readonly listDevicesService: ListDevicesService,
  ) {
    super();
  }

  async run(_inputs: string[], options: ListDevicesOptions): Promise<void> {
    try {
      if (!options.userId && !options.telegramId) {
        console.log('\nError: Either --user-id or --telegram-id is required\n');
        console.log('Usage: device:list --user-id <uuid>');
        console.log('       device:list --telegram-id <telegramId>\n');
        process.exit(1);
      }

      const result = await this.listDevicesService.run({
        userId: options.userId,
        telegramId: options.telegramId,
      });

      const { devices, total } = result.data;

      const userLabel = options.userId ?? `telegramId=${options.telegramId}`;
      console.log(`\nDevices for user ${userLabel}:\n`);

      if (devices.length === 0) {
        console.log('No devices found.\n');
        return;
      }

      console.log(
        'ID'.padEnd(40) +
          'MAC Address'.padEnd(20) +
          'Label'.padEnd(20) +
          'Status',
      );
      console.log('-'.repeat(100));

      for (const device of devices) {
        const status = device.isOnline() ? 'ONLINE' : 'OFFLINE';
        console.log(
          device.id.padEnd(40) +
            device.macAddress.padEnd(20) +
            (device.label ?? '-').padEnd(20) +
            status,
        );
      }

      console.log(`\nTotal: ${total} device(s)\n`);
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
    flags: '-u, --user-id <userId>',
    description: 'Filter devices by user UUID',
  })
  parseUserId(val: string): string {
    return val;
  }

  @Option({
    flags: '-t, --telegram-id <telegramId>',
    description: "User's Telegram ID (alternative to --user-id)",
  })
  parseTelegramId(val: string): string {
    return val;
  }
}
