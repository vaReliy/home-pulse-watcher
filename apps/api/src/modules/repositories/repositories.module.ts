import { Module } from '@nestjs/common';
import { repositoryProviders } from './repository.providers';
import { REPOSITORY_TOKENS } from './repository.tokens';

@Module({
  providers: repositoryProviders,
  exports: [...Object.values(REPOSITORY_TOKENS)],
})
export class RepositoriesModule {}

export { REPOSITORY_TOKENS };
