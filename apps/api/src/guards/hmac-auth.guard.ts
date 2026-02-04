import * as crypto from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { IDeviceRepository } from '@home-pulse-watcher/core';
import {
  AuthenticationError,
  AuthenticationErrorCode,
  decryptDeviceSecret,
} from '@home-pulse-watcher/shared';
import { REPOSITORY_TOKENS } from '../modules/repositories/repository.tokens';

/** Timestamp tolerance in seconds (5 minutes) */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Guard that verifies HMAC signatures from ESP32 devices.
 *
 * Expected headers:
 * - X-Device-Mac: Device MAC address (AA:BB:CC:DD:EE:FF)
 * - X-Timestamp: Unix timestamp in seconds
 * - X-Signature: HMAC-SHA256 signature (64-char hex)
 *
 * Signature is computed as: HMAC-SHA256(secret, MAC:TIMESTAMP:STATUS)
 */
@Injectable()
export class HmacAuthGuard implements CanActivate {
  constructor(
    @Inject(REPOSITORY_TOKENS.DEVICE)
    private readonly deviceRepository: IDeviceRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Extract headers
    const mac = request.headers['x-device-mac'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const signature = request.headers['x-signature'] as string | undefined;

    if (!mac || !timestamp || !signature) {
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

    if (Math.abs(now - timestampNum) > TIMESTAMP_TOLERANCE_SECONDS) {
      throw new AuthenticationError(
        'Request timestamp expired or too far in the future',
        AuthenticationErrorCode.EXPIRED_TIMESTAMP,
      );
    }

    // 3. Find device by MAC
    const normalizedMac = mac.toUpperCase();
    const device = await this.deviceRepository.findByMacAddress(normalizedMac);

    if (!device) {
      throw new AuthenticationError(
        'Device not found',
        AuthenticationErrorCode.DEVICE_NOT_FOUND,
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
    const body = request.body as { status?: number };
    const status = body?.status ?? '';
    const payload = `${normalizedMac}:${timestamp}:${status}`;

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
      throw new AuthenticationError(
        'Invalid signature',
        AuthenticationErrorCode.INVALID_SIGNATURE,
      );
    }

    // 7. Attach device ID to request for controller
    (request as Request & { deviceId: string }).deviceId = device.id;

    return true;
  }
}
