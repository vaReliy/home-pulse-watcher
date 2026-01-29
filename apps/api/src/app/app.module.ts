import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { ServiceExceptionFilter } from '../filters/service-exception.filter';
import { BigIntSerializerInterceptor } from '../interceptors/bigint-serializer.interceptor';

@Module({
  imports: [PrismaModule, RepositoriesModule, ServicesModule],
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
