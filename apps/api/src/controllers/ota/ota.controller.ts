import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CheckOtaUpdateService,
  CheckOtaUpdateOutput,
} from '@home-pulse-watcher/application';
import { HmacAuthGuard } from '../../guards/hmac-auth.guard.js';
import { DeviceId } from '../../decorators/device-context.decorator.js';
import { HmacCanonical } from '../../decorators/hmac-canonical.decorator.js';
import { SERVICE_TOKENS } from '../../modules/services/service.tokens.js';
import { CheckOtaUpdateDto } from './dto/check-ota-update.dto.js';

/**
 * Controller for OTA firmware update discovery.
 * Protected by HMAC authentication.
 *
 * HMAC canonical format: MAC:TS:boardType:currentVersion:channel
 */
@Controller('ota')
export class OtaController {
  constructor(
    @Inject(SERVICE_TOKENS.CHECK_OTA_UPDATE)
    private readonly checkOtaUpdateService: CheckOtaUpdateService,
  ) {}

  /**
   * Check whether a firmware update is available for the requesting device.
   *
   * Headers:
   * - X-Device-Mac: Device MAC address
   * - X-Timestamp: Unix timestamp (seconds)
   * - X-Signature: HMAC-SHA256 signature
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HmacAuthGuard)
  @HmacCanonical(
    (b) => `${b['boardType']}:${b['currentVersion']}:${b['channel']}`,
  )
  async checkForUpdate(
    @Body() body: CheckOtaUpdateDto,
    @DeviceId() deviceId: string,
  ): Promise<CheckOtaUpdateOutput> {
    const result = await this.checkOtaUpdateService.run(
      {
        boardType: body.boardType,
        currentVersion: body.currentVersion,
        channel: body.channel,
      },
      { deviceId },
    );
    return result.data;
  }
}
