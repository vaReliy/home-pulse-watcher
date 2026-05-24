import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { RepositoriesModule } from '../modules/repositories/repositories.module';
import { ServicesModule } from '../modules/services/services.module';
import { StorageModule } from '../modules/storage/storage.module.js';
import { RegisterDeviceCommand } from './device/register-device.command';
import { ListDevicesCommand } from './device/list-devices.command';
import { LinkDeviceToUserCommand } from './device/link-device-to-user.command';
import { UnlinkDeviceFromUserCommand } from './device/unlink-device-from-user.command';
import { UpdateDeviceCommand } from './device/update-device.command';
import { DeleteDeviceCommand } from './device/delete-device.command';
import { RotateDeviceSecretCommand } from './device/rotate-device-secret.command';
import { CreateUserCommand } from './user/create-user.command';
import { ListUsersCommand } from './user/list-users.command';
import { UploadFirmwareCommand } from './firmware/upload-firmware.command';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    // LoggerModule provides nestjs-pino Logger for StorageModule's GcsService factory
    LoggerModule.forRoot({ pinoHttp: { level: 'warn' } }),
    PrismaModule,
    RepositoriesModule,
    ServicesModule,
    StorageModule,
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
    UploadFirmwareCommand,
  ],
})
export class CliModule {}
