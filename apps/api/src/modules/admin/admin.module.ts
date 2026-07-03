import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AdminFirmwareController } from '../../controllers/admin/admin-firmware.controller.js';

@Module({
  imports: [RepositoriesModule, ServicesModule, StorageModule],
  controllers: [AdminFirmwareController],
})
export class AdminModule {}
