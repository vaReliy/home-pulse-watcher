import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { serviceProviders } from './service.providers';
import { SERVICE_TOKENS } from './service.tokens';

@Module({
  imports: [RepositoriesModule],
  providers: serviceProviders,
  exports: [...Object.values(SERVICE_TOKENS)],
})
export class ServicesModule {}

export { SERVICE_TOKENS };
