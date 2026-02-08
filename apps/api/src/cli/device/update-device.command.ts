import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { UpdateDeviceService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface UpdateDeviceOptions {
  mac?: string;
  deviceId?: string;
  label: string;
}

@Command({
  name: 'device:update',
  description: 'Update device information (label)',
})
export class UpdateDeviceCommand extends CommandRunner {
  private readonly logger = new Logger(UpdateDeviceCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.UPDATE_DEVICE)
    private readonly updateDeviceService: UpdateDeviceService,
  ) {
    super();
  }

  async run(_inputs: string[], options: UpdateDeviceOptions): Promise<void> {
    try {
      if (!options.mac && !options.deviceId) {
        throw new Error(
          'Either --mac or --device-id is required to identify the device',
        );
      }

      const result = await this.updateDeviceService.run({
        macAddress: options.mac,
        id: options.deviceId,
        label: options.label,
      });

      const { device } = result.data;

      console.log('\n=== Device Updated Successfully ===');
      console.log(`ID:          ${device.id}`);
      console.log(`MAC Address: ${device.macAddress}`);
      console.log(`Label:       ${device.label ?? '(none)'}\n`);
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

  @Option({
    flags: '-l, --label <label>',
    description: 'New human-readable device label',
    required: true,
  })
  parseLabel(val: string): string {
    return val;
  }
}
