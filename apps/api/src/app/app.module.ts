import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { DeviceStatusModule } from '../modules/device-status/device-status.module';
import { TelegramModule } from '../modules/telegram/telegram.module';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { ServiceExceptionFilter } from '../filters/service-exception.filter';
import { BigIntSerializerInterceptor } from '../interceptors/bigint-serializer.interceptor';
import { HealthModule } from '../modules/health/health.module';

const isProduction = process.env['NODE_ENV'] === 'production';

@Module({
  imports: [
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
  ],
})
export class AppModule {}
