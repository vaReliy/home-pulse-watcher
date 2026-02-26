import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { BaseError } from '@home-pulse-watcher/shared';

@Catch(BaseError)
export class ServiceExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ServiceExceptionFilter.name);

  catch(exception: BaseError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception.httpStatus ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(
        `${exception.constructor.name}: ${exception.message}`,
        exception.stack,
      );
      response.status(status).json({
        code: exception.code,
        message: 'An unexpected error occurred',
      });
    } else {
      this.logger.warn(
        `${exception.constructor.name}: ${exception.message}`,
        exception.stack,
      );
      response.status(status).json(exception.toJSON());
    }
  }
}
