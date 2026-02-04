import { Module } from '@nestjs/common';
import { DeviceStatusController } from '../../controllers/device-status/device-status.controller';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ServicesModule } from '../services/services.module';

/**
 * Module for device power status reporting functionality.
 */
@Module({
  imports: [RepositoriesModule, ServicesModule],
  controllers: [DeviceStatusController],
})
export class DeviceStatusModule {}
