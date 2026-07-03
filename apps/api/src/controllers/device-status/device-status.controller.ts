import {
  Controller,
  Post,
  Body,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ProcessPowerStatusService } from '@home-pulse-watcher/application';
import { HmacAuthGuard } from '../../guards/hmac-auth.guard.js';
import { DeviceId } from '../../decorators/device-context.decorator.js';
import { HmacCanonical } from '../../decorators/hmac-canonical.decorator.js';
import { SERVICE_TOKENS } from '../../modules/services/service.tokens.js';
import { ReportStatusDto } from './dto/report-status.dto.js';

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
   *
   * Response includes optional `forceOtaCheck: true` when the sticky
   * `Device.otaForceCheckRequested` flag was set (consumed on read) —
   * old firmware never parses this response body, so adding the field
   * is safe to roll out before the firmware change that consumes it.
   */
  /** 60 req/min/IP — matches normal device polling cadence */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('status')
  @HttpCode(HttpStatus.OK)
  @HmacCanonical((b) => String(b['status'] ?? ''))
  async reportStatus(
    @Body() dto: ReportStatusDto,
    @DeviceId() deviceId: string,
  ) {
    const result = await this.processPowerStatusService.run(
      {
        status: dto.status,
        voltage: dto.voltage ?? null,
        firmwareVersion: dto.firmwareVersion ?? null,
        batteryVoltage: dto.batteryVoltage ?? null,
      },
      { deviceId },
    );

    return {
      success: true,
      eventId: result.data.event.id,
      timestamp: result.data.event.timestamp.toISOString(),
      isStatusChange: result.data.isStatusChange,
      debounced: result.data.debounced,
      ...(result.data.forceOtaCheck && { forceOtaCheck: true }),
    };
  }
}
