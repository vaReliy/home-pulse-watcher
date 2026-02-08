import { Module } from '@nestjs/common';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { RegisterDeviceCommand } from './device/register-device.command';
import { ListDevicesCommand } from './device/list-devices.command';
import { LinkDeviceToUserCommand } from './device/link-device-to-user.command';
import { UnlinkDeviceFromUserCommand } from './device/unlink-device-from-user.command';
import { UpdateDeviceCommand } from './device/update-device.command';
import { DeleteDeviceCommand } from './device/delete-device.command';
import { RotateDeviceSecretCommand } from './device/rotate-device-secret.command';
import { CreateUserCommand } from './user/create-user.command';
import { ListUsersCommand } from './user/list-users.command';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    RepositoriesModule,
    ServicesModule,
  ],
  providers: [
    RegisterDeviceCommand,
    ListDevicesCommand,
    LinkDeviceToUserCommand,
    UnlinkDeviceFromUserCommand,
    UpdateDeviceCommand,
    DeleteDeviceCommand,
    RotateDeviceSecretCommand,
    CreateUserCommand,
    ListUsersCommand,
  ],
})
export class CliModule {}
