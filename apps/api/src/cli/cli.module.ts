import { Module } from '@nestjs/common';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { RegisterDeviceCommand } from './device/register-device.command';
import { ListDevicesCommand } from './device/list-devices.command';
import { LinkDeviceToUserCommand } from './device/link-device-to-user.command';
import { CreateUserCommand } from './user/create-user.command';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    RepositoriesModule,
    ServicesModule,
  ],
  providers: [RegisterDeviceCommand, ListDevicesCommand, LinkDeviceToUserCommand, CreateUserCommand],
})
export class CliModule {}
