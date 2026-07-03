import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from '../modules/prisma/prisma.module.js';
import { RepositoriesModule } from '../modules/repositories/repositories.module.js';
import { ServicesModule } from '../modules/services/services.module.js';
import { DeviceStatusModule } from '../modules/device-status/device-status.module.js';
import { TelegramModule } from '../modules/telegram/telegram.module.js';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { ServiceExceptionFilter } from '../filters/service-exception.filter.js';
import { BigIntSerializerInterceptor } from '../interceptors/bigint-serializer.interceptor.js';
import { HealthModule } from '../modules/health/health.module.js';
import { StorageModule } from '../modules/storage/storage.module.js';
import { OtaModule } from '../modules/ota/ota.module.js';
import { AdminModule } from '../modules/admin/admin.module.js';

const isProduction = process.env['NODE_ENV'] === 'production';

@Module({
  imports: [
    // In-memory store is fine for single-instance MVP; replace with @nest-lab/throttler-storage-redis before horizontal scaling.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 60,
      },
    ]),
    LoggerModule.forRoot({
      pinoHttp: {
        ...(isProduction
          ? {
              messageKey: 'message',
              formatters: {
                level(label: string) {
                  const severityMap: Record<string, string> = {
                    trace: 'DEBUG',
                    debug: 'DEBUG',
                    info: 'INFO',
                    warn: 'WARNING',
                    error: 'ERROR',
                    fatal: 'CRITICAL',
                  };
                  return { severity: severityMap[label] ?? 'DEFAULT' };
                },
              },
            }
          : {
              transport: {
                target: 'pino-pretty',
                options: { colorize: true, singleLine: true },
              },
            }),
      },
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    HealthModule,
    RepositoriesModule,
    ServicesModule,
    DeviceStatusModule,
    TelegramModule,
    StorageModule,
    OtaModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ServiceExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BigIntSerializerInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
