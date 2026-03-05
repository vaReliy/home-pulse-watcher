import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { livrValidatorFactory } from '@home-pulse-watcher/shared';
import { AppModule } from './app/app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  validateEnv();
  livrValidatorFactory.initialize();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);

  const logger = app.get(Logger);
  logger.log(
    `Application is running on: http://${host}:${port}/${globalPrefix}`,
  );
}

bootstrap();
