/**
 * Context passed to services from the Interface layer.
 * Contains verified/authenticated information from guards/middleware.
 */
export interface ServiceContext {
  /** Verified device ID from HMAC authentication */
  deviceId?: string;

  /** Authenticated user ID from session/token */
  userId?: string;

  /** User's Telegram ID */
  telegramId?: bigint;

  /** Request correlation ID for tracing */
  requestId?: string;

  /** Client IP address */
  ipAddress?: string;
}

/**
 * Standard service response wrapper.
 * All services return data in this format.
 */
export interface ServiceResponse<T> {
  data: T;
}
