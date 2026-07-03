import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import type {
  UploadFirmwareService,
  UploadFirmwareOutput,
  ListFirmwareReleasesService,
  ListFirmwareReleasesOutput,
} from '@home-pulse-watcher/application';
import { ValidationError } from '@home-pulse-watcher/shared';
import { AdminTokenGuard } from '../../guards/admin-token.guard.js';
import { SERVICE_TOKENS } from '../../modules/services/service.tokens.js';
import { renderAdminFirmwarePage } from './admin-firmware.template.js';
import { UploadFirmwareFormDto } from './dto/upload-firmware-form.dto.js';

/** 4 MB — comfortably above current ESP32-C3/C6 firmware image sizes. */
const MAX_FIRMWARE_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Bolted-on admin route for browser-based firmware upload (alternative to the
 * `firmware:upload` CLI). Single-admin scale — auth is a static bearer token
 * (`ADMIN_UPLOAD_TOKEN`), not session/JWT. Reuses Unit C's `UploadFirmwareService`
 * and `ListFirmwareReleasesService` — no duplicated upload logic.
 *
 * The GET page itself carries no data and is unauthenticated; the admin pastes
 * the bearer token into the page, which is then sent on the `/releases` and
 * upload calls made from client-side JS.
 */
@Controller('admin/firmware')
export class AdminFirmwareController {
  constructor(
    @Inject(SERVICE_TOKENS.UPLOAD_FIRMWARE)
    private readonly uploadFirmwareService: UploadFirmwareService,
    @Inject(SERVICE_TOKENS.LIST_FIRMWARE_RELEASES)
    private readonly listFirmwareReleasesService: ListFirmwareReleasesService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getForm(): string {
    return renderAdminFirmwarePage();
  }

  @UseGuards(AdminTokenGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('releases')
  async listReleases(): Promise<ListFirmwareReleasesOutput> {
    const { data } = await this.listFirmwareReleasesService.run();
    return data;
  }

  @UseGuards(AdminTokenGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FIRMWARE_UPLOAD_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFirmwareFormDto,
  ): Promise<UploadFirmwareOutput> {
    if (!file) {
      throw new ValidationError({ file: 'required' });
    }

    const { data } = await this.uploadFirmwareService.run({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      version: body.version,
      board: body.board,
      channel: body.channel,
      critical: body.critical === 'true',
    });

    return data;
  }
}
