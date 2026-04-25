import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { RotateDeviceSecretService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface RotateDeviceSecretOptions {
  mac?: string;
  deviceId?: string;
}

@Command({
  name: 'device:rotate-secret',
  description: 'Generate a new HMAC secret for a device',
})
export class RotateDeviceSecretCommand extends CommandRunner {
  private readonly logger = new Logger(RotateDeviceSecretCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.ROTATE_DEVICE_SECRET)
    private readonly rotateDeviceSecretService: RotateDeviceSecretService,
  ) {
    super();
  }

  async run(
    _inputs: string[],
    options: RotateDeviceSecretOptions,
  ): Promise<void> {
    try {
      if (!options.mac && !options.deviceId) {
        throw new Error(
          'Either --mac or --device-id is required to identify the device',
        );
      }

      const deviceSecretEncryptionKey =
        process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
      if (!deviceSecretEncryptionKey) {
        throw new Error(
          'DEVICE_SECRET_ENCRYPTION_KEY environment variable is required',
        );
      }

      const result = await this.rotateDeviceSecretService.run(
        {
          macAddress: options.mac,
          id: options.deviceId,
        },
        {
          config: { deviceSecretEncryptionKey },
        },
      );

      const { device, secret } = result.data;

      console.log('\n=== Device Secret Rotated Successfully ===');
      console.log(`ID:          ${device.id}`);
      console.log(`MAC Address: ${device.macAddress}`);
      console.log(`Label:       ${device.label ?? '(none)'}`);
      console.log('\n=== IMPORTANT: Save this secret ===');
      console.log(`Secret:      ${secret}`);
      console.log('\nThis secret will NOT be shown again!');
      console.log('Update secrets.h on the ESP32 and re-flash the firmware.\n');
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
