import {
  Controller,
  Post,
  Body,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { ProcessPowerStatusService } from '@home-pulse-watcher/application';
import { HmacAuthGuard } from '../../guards/hmac-auth.guard';
import { DeviceId } from '../../decorators/device-context.decorator';
import { SERVICE_TOKENS } from '../../modules/services/service.tokens';
import { ReportStatusDto } from './dto/report-status.dto';

/**
 * Controller for device power status reporting.
 * Protected by HMAC authentication.
 */
@Controller('device')
@UseGuards(HmacAuthGuard)
export class DeviceStatusController {
  constructor(
    @Inject(SERVICE_TOKENS.PROCESS_POWER_STATUS)
    private readonly processPowerStatusService: ProcessPowerStatusService,
  ) {}

  /**
   * Report power status from an ESP32 device.
   *
   * Headers:
   * - X-Device-Mac: Device MAC address
   * - X-Timestamp: Unix timestamp (seconds)
   * - X-Signature: HMAC-SHA256 signature
   *
   * @param dto - Power status (0 = OFF, 1 = ON)
   * @param deviceId - Verified device ID from guard
   */
  @Post('status')
  @HttpCode(HttpStatus.OK)
  async reportStatus(
    @Body() dto: ReportStatusDto,
    @DeviceId() deviceId: string,
  ) {
    const result = await this.processPowerStatusService.run(
      {
        status: dto.status,
        voltage: dto.voltage ?? null,
        firmwareVersion: dto.firmwareVersion ?? null,
      },
      { deviceId },
    );

    return {
      success: true,
      eventId: result.data.event.id,
      timestamp: result.data.event.timestamp.toISOString(),
      isStatusChange: result.data.isStatusChange,
      debounced: result.data.debounced,
    };
  }
}
