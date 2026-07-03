import * as crypto from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AuthenticationError,
  AuthenticationErrorCode,
} from '@home-pulse-watcher/shared';

const BEARER_PREFIX = 'Bearer ';

/**
 * Guards the admin firmware-upload routes with a single static bearer token
 * (`ADMIN_UPLOAD_TOKEN`). Sufficient given exactly one admin user — do not
 * extend this into session/JWT auth without a matching requirement.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly logger = new Logger(AdminTokenGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedToken = process.env['ADMIN_UPLOAD_TOKEN'];

    if (!expectedToken) {
      // Server misconfiguration (required admin env var missing), not a client
      // error. Keep the specific reason server-side; return a generic 503 so the
      // client-facing body never leaks the env var name or a stack trace.
      this.logger.error(
        'ADMIN_UPLOAD_TOKEN not configured — rejecting admin upload request (server misconfiguration)',
      );
      throw new ServiceUnavailableException(
        'Admin firmware upload is temporarily unavailable',
      );
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      this.logger.warn(
        'MISSING_CREDENTIALS: missing or malformed Authorization header',
      );
      throw new AuthenticationError(
        'Missing bearer token',
        AuthenticationErrorCode.MISSING_CREDENTIALS,
      );
    }

    const providedToken = authHeader.slice(BEARER_PREFIX.length);
    const providedBuffer = Buffer.from(providedToken);
    const expectedBuffer = Buffer.from(expectedToken);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      this.logger.warn('INVALID_CREDENTIALS: admin token mismatch');
      throw new AuthenticationError(
        'Invalid bearer token',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }

    return true;
  }
}
