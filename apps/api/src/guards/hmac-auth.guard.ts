import * as crypto from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { IDeviceRepository } from '@home-pulse-watcher/core';
import {
  AuthenticationError,
  AuthenticationErrorCode,
  decryptDeviceSecret,
} from '@home-pulse-watcher/shared';
import { REPOSITORY_TOKENS } from '../modules/repositories/repository.tokens.js';
import {
  HMAC_CANONICAL_KEY,
  type CanonicalBuilder,
} from '../decorators/hmac-canonical.decorator.js';

/** Timestamp tolerance in seconds (5 minutes) */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

/** Uppercase MAC address format: AA:BB:CC:DD:EE:FF */
const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/**
 * Guard that verifies HMAC signatures from ESP32 devices.
 *
 * Expected headers:
 * - X-Device-Mac: Device MAC address (AA:BB:CC:DD:EE:FF)
 * - X-Timestamp: Unix timestamp in seconds
 * - X-Signature: HMAC-SHA256 signature (64-char hex)
 *
 * Signature is computed as: HMAC-SHA256(secret, MAC:TIMESTAMP:<route-specific-body>)
 * where the body portion is defined per-route via the {@link HmacCanonical} decorator.
 * Every route protected by this guard MUST declare `@HmacCanonical(...)` — omitting it
 * causes the guard to throw an error at request time to prevent silent signature weakening.
 */
@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly logger = new Logger(HmacAuthGuard.name);

  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Extract headers
    const mac = request.headers['x-device-mac'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const signature = request.headers['x-signature'] as string | undefined;

    if (!mac || !timestamp || !signature) {
      const missing = [
        !mac && 'X-Device-Mac',
        !timestamp && 'X-Timestamp',
        !signature && 'X-Signature',
      ]
        .filter(Boolean)
        .join(', ');
      this.logger.warn(`MISSING_CREDENTIALS: missing headers: ${missing}`);
      throw new AuthenticationError(
        'Missing required authentication headers (X-Device-Mac, X-Timestamp, X-Signature)',
        AuthenticationErrorCode.MISSING_CREDENTIALS,
      );
    }

    // 2. Validate timestamp (replay attack prevention)
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (isNaN(timestampNum)) {
      throw new AuthenticationError(
        'Invalid timestamp format',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }

    const timestampDiff = Math.abs(now - timestampNum);
    if (timestampDiff > TIMESTAMP_TOLERANCE_SECONDS) {
      this.logger.warn(
        `EXPIRED_TIMESTAMP: mac=${mac} diff=${timestampDiff}s (tolerance=${TIMESTAMP_TOLERANCE_SECONDS}s) device=${timestampNum} server=${now}`,
      );
      throw new AuthenticationError(
        'Request timestamp expired or too far in the future',
        AuthenticationErrorCode.EXPIRED_TIMESTAMP,
      );
    }

    // 3. Find device by MAC
    const normalizedMac = mac.toUpperCase();

    if (!MAC_RE.test(normalizedMac)) {
      this.logger.warn(`INVALID_MAC_FORMAT: mac=${normalizedMac}`);
      throw new AuthenticationError(
        'Invalid MAC address format',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }

    const device = await this.deviceRepository.findByMacAddress(normalizedMac);

    if (!device) {
      this.logger.warn(`DEVICE_NOT_FOUND: mac=${normalizedMac}`);
      throw new AuthenticationError(
        'Device not found',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }

    // 4. Decrypt device secret
    const encryptionKey = process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
    if (!encryptionKey) {
      throw new Error('DEVICE_SECRET_ENCRYPTION_KEY not configured');
    }

    let deviceSecret: string;
    try {
      deviceSecret = decryptDeviceSecret(device.encryptedSecret, encryptionKey);
    } catch {
      throw new AuthenticationError(
        'Failed to decrypt device secret',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }

    // 5. Compute expected signature
    const body = request.body as Record<string, unknown>;
    const builder = this.reflector.get<CanonicalBuilder | undefined>(
      HMAC_CANONICAL_KEY,
      context.getHandler(),
    );
    if (!builder) {
      throw new Error(
        'Route missing @HmacCanonical decorator — HMAC body canonical undefined',
      );
    }
    let bodyPart: string;
    try {
      bodyPart = builder(body);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Canonical builder error';
      this.logger.warn(
        `CANONICAL_BUILD_FAILED: mac=${normalizedMac} reason=${msg}`,
      );
      throw new AuthenticationError(
        'Invalid signature',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }
    const payload = `${normalizedMac}:${timestamp}:${bodyPart}`;

    const expectedSignature = crypto
      .createHmac('sha256', deviceSecret)
      .update(payload)
      .digest('hex');

    // 6. Timing-safe comparison
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      this.logger.warn(`INVALID_SIGNATURE: mac=${normalizedMac}`);
      throw new AuthenticationError(
        'Invalid signature',
        AuthenticationErrorCode.INVALID_CREDENTIALS,
      );
    }

    // 7. Attach device ID to request for controller
    (request as Request & { deviceId: string }).deviceId = device.id;

    return true;
  }
}
