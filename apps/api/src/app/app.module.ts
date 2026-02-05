import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { DeviceStatusModule } from '../modules/device-status/device-status.module';
import { TelegramModule } from '../modules/telegram/telegram.module';
import { ServiceExceptionFilter } from '../filters/service-exception.filter';
import { BigIntSerializerInterceptor } from '../interceptors/bigint-serializer.interceptor';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
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
      useClass: ServiceExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BigIntSerializerInterceptor,
    },
  ],
})
export class AppModule {}
