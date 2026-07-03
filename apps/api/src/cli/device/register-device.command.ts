import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { RegisterDeviceService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { DeviceType } from '@home-pulse-watcher/core';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface RegisterDeviceOptions {
  mac: string;
  label?: string;
  deviceType?: DeviceType;
}

@Command({
  name: 'device:register',
  description: 'Register a new ESP32 device for power monitoring',
})
export class RegisterDeviceCommand extends CommandRunner {
  private readonly logger = new Logger(RegisterDeviceCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.REGISTER_DEVICE)
    private readonly registerDeviceService: RegisterDeviceService,
  ) {
    super();
  }

  async run(_inputs: string[], options: RegisterDeviceOptions): Promise<void> {
    try {
      const deviceSecretEncryptionKey =
        process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
      if (!deviceSecretEncryptionKey) {
        throw new Error(
          'DEVICE_SECRET_ENCRYPTION_KEY environment variable is required',
        );
      }

      const result = await this.registerDeviceService.run(
        {
          macAddress: options.mac,
          label: options.label,
          deviceType: options.deviceType,
        },
        {
          config: { deviceSecretEncryptionKey },
        },
      );

      const { device, secret } = result.data;

      console.log('\n=== Device Registered Successfully ===');
      console.log(`ID:          ${device.id}`);
      console.log(`MAC Address: ${device.macAddress}`);
      console.log(`Label:       ${device.label ?? '(none)'}`);
      console.log('\n=== IMPORTANT: Save this secret ===');
      console.log(`Secret:      ${secret}`);
      console.log('\nThis secret will NOT be shown again!');
      console.log('Configure your ESP32 with this secret for HMAC signing.\n');
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
    required: true,
  })
  parseMac(val: string): string {
    return val.toUpperCase();
  }

  @Option({
    flags: '-l, --label <label>',
    description: 'Human-readable device label',
  })
  parseLabel(val: string): string {
    return val;
  }

  @Option({
    flags: '-t, --device-type <deviceType>',
    description:
      'Hardware category: UPS or MAINS (default: MAINS). Write-once at provisioning.',
  })
  parseDeviceType(val: string): DeviceType {
    return val.toUpperCase() as DeviceType;
  }
}
