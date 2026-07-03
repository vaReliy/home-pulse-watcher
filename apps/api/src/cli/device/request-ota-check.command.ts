import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { RequestOtaForceCheckService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface RequestOtaCheckOptions {
  mac?: string;
  deviceId?: string;
}

@Command({
  name: 'device:request-ota-check',
  description:
    'Request an immediate OTA check on a device, bypassing its 6h poll interval',
})
export class RequestOtaCheckCommand extends CommandRunner {
  private readonly logger = new Logger(RequestOtaCheckCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.REQUEST_OTA_FORCE_CHECK)
    private readonly requestOtaForceCheckService: RequestOtaForceCheckService,
  ) {
    super();
  }

  async run(_inputs: string[], options: RequestOtaCheckOptions): Promise<void> {
    try {
      if (!options.mac && !options.deviceId) {
        throw new Error(
          'Either --mac or --device-id is required to identify the device',
        );
      }

      const result = await this.requestOtaForceCheckService.run({
        macAddress: options.mac,
        id: options.deviceId,
      });

      const { device } = result.data;

      console.log('\n=== OTA Force-Check Requested ===');
      console.log(`ID:          ${device.id}`);
      console.log(`MAC Address: ${device.macAddress}`);
      console.log(
        'The device will check for updates on its next status report.\n',
      );
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
