import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli/cli.module';
import { Logger } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CLI');

  try {
    await CommandFactory.run(CliModule, {
      logger: ['error', 'warn', 'log'],
      errorHandler: (err) => {
        logger.error(err.message, err.stack);
        process.exit(1);
      },
    });
  } catch (error) {
    logger.error('CLI execution failed', error);
    process.exit(1);
  }
}

bootstrap();
