import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { OtaController } from '../../controllers/ota/ota.controller.js';

@Module({
  imports: [RepositoriesModule, ServicesModule, StorageModule],
  controllers: [OtaController],
})
export class OtaModule {}
