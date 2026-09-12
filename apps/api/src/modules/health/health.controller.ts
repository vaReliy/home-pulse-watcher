import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @SkipThrottle()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected' };
    } catch {
      throw new HttpException(
        { status: 'error', db: 'disconnected' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
