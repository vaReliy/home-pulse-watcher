import { SetMetadata } from '@nestjs/common';

export const HMAC_CANONICAL_KEY = 'hmacCanonical';

/** Function that builds the body-derived part of the HMAC canonical string. */
export type CanonicalBuilder = (body: Record<string, unknown>) => string;

/**
 * Decorator that defines a custom HMAC canonical string builder for a route handler.
 *
 * When applied, HmacAuthGuard will use the provided builder to construct the
 * body-derived portion of the canonical string instead of the default `body.status`.
 *
 * @example
 * \@HmacCanonical((b) => `${b['boardType']}:${b['currentVersion']}:${b['channel']}`)
 * \@Post('check')
 * async checkForUpdate() { ... }
 */
export const HmacCanonical = (builder: CanonicalBuilder): MethodDecorator =>
  SetMetadata(HMAC_CANONICAL_KEY, builder);
