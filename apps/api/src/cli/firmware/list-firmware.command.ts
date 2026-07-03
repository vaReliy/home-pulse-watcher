import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import type { ListFirmwareReleasesService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

@Command({
  name: 'firmware:list',
  description: 'List current firmware releases per board/channel',
})
export class ListFirmwareCommand extends CommandRunner {
  private readonly logger = new Logger(ListFirmwareCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.LIST_FIRMWARE_RELEASES)
    private readonly listFirmwareReleasesService: ListFirmwareReleasesService,
  ) {
    super();
  }

  async run(): Promise<void> {
    try {
      const { data } = await this.listFirmwareReleasesService.run();
      const { releases } = data;

      if (releases.length === 0) {
        console.log('\nNo firmware releases found.\n');
        return;
      }

      console.log('\nFirmware releases:\n');
      console.log(
        'Board'.padEnd(12) +
          'Channel'.padEnd(10) +
          'Version'.padEnd(20) +
          'Critical'.padEnd(10) +
          'Created',
      );
      console.log('-'.repeat(80));

      for (const release of releases) {
        console.log(
          release.boardType.padEnd(12) +
            release.channel.padEnd(10) +
            release.version.padEnd(20) +
            (release.isCritical ? 'YES' : 'no').padEnd(10) +
            release.createdAt.toISOString(),
        );
      }

      console.log(`\nTotal: ${releases.length} release(s)\n`);
    } catch (error) {
      if (error instanceof BaseError) {
        this.logger.error(`${error.code}: ${error.message}`);
      } else if (error instanceof Error) {
        this.logger.error(error.message);
      }
      process.exit(1);
    }
  }
}
