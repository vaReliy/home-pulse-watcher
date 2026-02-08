import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { DeleteDeviceService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface DeleteDeviceOptions {
  mac?: string;
  deviceId?: string;
}

@Command({
  name: 'device:delete',
  description: 'Delete a device and all its associations',
})
export class DeleteDeviceCommand extends CommandRunner {
  private readonly logger = new Logger(DeleteDeviceCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.DELETE_DEVICE)
    private readonly deleteDeviceService: DeleteDeviceService,
  ) {
    super();
  }

  async run(_inputs: string[], options: DeleteDeviceOptions): Promise<void> {
    try {
      if (!options.mac && !options.deviceId) {
        throw new Error(
          'Either --mac or --device-id is required to identify the device',
        );
      }

      const result = await this.deleteDeviceService.run({
        macAddress: options.mac,
        id: options.deviceId,
      });

      const { device, deletedLinksCount, deletedEventsCount } = result.data;

      console.log('\n=== Device Deleted Successfully ===');
      console.log(`ID:              ${device.id}`);
      console.log(`MAC Address:     ${device.macAddress}`);
      console.log(`Label:           ${device.label ?? '(none)'}`);
      console.log(`User links:      ${deletedLinksCount} removed`);
      console.log(`Power events:    ${deletedEventsCount} removed\n`);
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
