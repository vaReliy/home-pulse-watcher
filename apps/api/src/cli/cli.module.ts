import { Module } from '@nestjs/common';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { RegisterDeviceCommand } from './device/register-device.command';
import { ListDevicesCommand } from './device/list-devices.command';
import { CreateUserCommand } from './user/create-user.command';

@Module({
  imports: [PrismaModule, RepositoriesModule, ServicesModule],
  providers: [RegisterDeviceCommand, ListDevicesCommand, CreateUserCommand],
})
export class CliModule {}
