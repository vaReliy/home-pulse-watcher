import { Module } from '@nestjs/common';
import { storageProvider } from './storage.providers.js';
import { STORAGE_TOKENS } from './storage.tokens.js';

@Module({
  providers: [storageProvider],
  exports: [STORAGE_TOKENS.FIRMWARE_STORAGE],
})
export class StorageModule {}
