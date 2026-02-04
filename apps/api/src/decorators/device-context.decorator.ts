import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Parameter decorator to extract the verified device ID from the request.
 * The device ID is set by HmacAuthGuard after successful authentication.
 *
 * @example
 * @Post('status')
 * @UseGuards(HmacAuthGuard)
 * reportStatus(@DeviceId() deviceId: string) {
 *   // deviceId is guaranteed to be valid here
 * }
 */
export const DeviceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { deviceId?: string }>();
    const deviceId = request.deviceId;

    if (!deviceId) {
      throw new Error(
        'DeviceId decorator used without HmacAuthGuard. Ensure the guard is applied.',
      );
    }

    return deviceId;
  },
);
