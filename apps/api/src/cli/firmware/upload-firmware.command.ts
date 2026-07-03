import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Inject, Logger } from '@nestjs/common';
import {
  Command,
  CommandRunner,
  InquirerService,
  Option,
  Question,
  QuestionSet,
} from 'nest-commander';
import type { UploadFirmwareService } from '@home-pulse-watcher/application';
import {
  BoardType as BoardTypeConst,
  ReleaseChannel as ReleaseChannelConst,
} from '@home-pulse-watcher/core';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

/** Default directory searched when --file is a bare filename without path separators. */
const DEFAULT_FIRMWARE_DIR = './tmp/firmware';

const UPLOAD_FIRMWARE_QUESTION_SET = 'upload-firmware-questions';

interface UploadFirmwareOptions {
  file: string;
  version?: string;
  board?: string;
  channel?: string;
  critical?: boolean;
}

@QuestionSet({ name: UPLOAD_FIRMWARE_QUESTION_SET })
export class UploadFirmwareQuestions {
  @Question({
    type: 'input',
    name: 'version',
    message: 'Firmware version (semver, e.g. 0.2.0 or 0.2.0-beta.1):',
  })
  parseVersion(val: string): string {
    return val;
  }

  @Question({
    type: 'list',
    name: 'board',
    message: 'Board type:',
    choices: Object.values(BoardTypeConst),
  })
  parseBoard(val: string): string {
    return val;
  }

  @Question({
    type: 'list',
    name: 'channel',
    message: 'Release channel:',
    choices: Object.values(ReleaseChannelConst),
  })
  parseChannel(val: string): string {
    return val.toUpperCase();
  }
}

@Command({
  name: 'firmware:upload',
  description:
    'Upload a firmware binary to GCS and register it as a FirmwareRelease',
})
export class UploadFirmwareCommand extends CommandRunner {
  private readonly logger = new Logger(UploadFirmwareCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.UPLOAD_FIRMWARE)
    private readonly uploadFirmwareService: UploadFirmwareService,
    private readonly inquirer: InquirerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: UploadFirmwareOptions): Promise<void> {
    try {
      const answers = await this.inquirer.ask<Required<UploadFirmwareOptions>>(
        UPLOAD_FIRMWARE_QUESTION_SET,
        options,
      );

      const filePath = this.resolveFilePath(options.file);
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileName = basename(filePath);
      const fileBuffer = readFileSync(filePath);

      console.log(
        `Uploading ${fileName} (${fileBuffer.length} bytes) — v=${answers.version} board=${answers.board} channel=${answers.channel}`,
      );

      const { data } = await this.uploadFirmwareService.run({
        fileBuffer,
        fileName,
        version: answers.version,
        board: answers.board,
        channel: answers.channel,
        critical: options.critical,
      });
      const { release } = data;

      console.log('\n=== Firmware Release Created ===');
      console.log(`ID:         ${release.id}`);
      console.log(`Version:    ${release.version}`);
      console.log(`Board:      ${release.boardType}`);
      console.log(`Channel:    ${release.channel}`);
      console.log(`Critical:   ${release.isCritical ? 'YES' : 'no'}`);
      console.log(`Checksum:   ${release.checksum}`);
      console.log(`GCS Path:   ${release.gcsPath}`);
      console.log(
        '\nDevices on this channel will discover this release on their next OTA check.\n',
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

  private resolveFilePath(file: string): string {
    if (file.includes('/') || file.includes('\\')) {
      return file;
    }
    return join(DEFAULT_FIRMWARE_DIR, file);
  }

  @Option({
    flags: '-f, --file <file>',
    description:
      'Path to firmware binary, or bare filename (searched in ./tmp/firmware/)',
    required: true,
  })
  parseFile(val: string): string {
    return val;
  }

  @Option({
    flags: '-v, --version <version>',
    description:
      'Semantic version (e.g. 0.2.0 or 0.2.0-beta.1) — prompted if omitted',
  })
  parseVersion(val: string): string {
    return val;
  }

  @Option({
    flags: '-b, --board <board>',
    description: 'Board type: esp32c3 or esp32c6 — prompted if omitted',
  })
  parseBoard(val: string): string {
    return val;
  }

  @Option({
    flags: '-c, --channel <channel>',
    description:
      'Release channel: ALPHA, BETA, or STABLE — prompted if omitted',
  })
  parseChannel(val: string): string {
    return val.toUpperCase();
  }

  @Option({
    flags: '--critical',
    description: 'Mark as critical — all devices on the channel must update',
  })
  parseCritical(_val: string): boolean {
    return true;
  }
}
