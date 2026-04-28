import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { livrValidatorFactory } from '@home-pulse-watcher/shared';
import { AppModule } from './app/app.module';
import { validateEnv } from './config/env.validation.js';

// Log unhandled promise rejections (e.g. transient GCS network errors) but do NOT
// exit — Nest's exception filters handle in-flight requests; these rejections are
// typically transient and must not take down the process.
process.on('unhandledRejection', (reason) => {
  console.error(
    JSON.stringify({
      severity: 'ERROR',
      msg: 'unhandledRejection',
      reason: String(reason),
    }),
  );
});

// Uncaught synchronous exceptions are always fatal.
process.on('uncaughtException', (err) => {
  console.error(
    JSON.stringify({
      severity: 'CRITICAL',
      msg: 'uncaughtException',
      err: err.message,
      stack: err.stack,
    }),
  );
  process.exit(1);
});

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

bootstrap().catch((err) => {
  console.error(
    JSON.stringify({
      severity: 'CRITICAL',
      msg: 'bootstrap failed',
      err: String(err),
    }),
  );
  process.exit(1);
});
