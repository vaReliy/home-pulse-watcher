import { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  AuthenticationError,
  AuthenticationErrorCode,
} from '@home-pulse-watcher/shared';
import { AdminTokenGuard } from './admin-token.guard.js';

describe('AdminTokenGuard', () => {
  const VALID_TOKEN = 'super-secret-admin-token';

  const createMockRequest = (
    headers: Record<string, string | undefined> = {},
  ): Request => ({ headers }) as unknown as Request;

  const createMockContext = (request: Request): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  afterEach(() => {
    delete process.env['ADMIN_UPLOAD_TOKEN'];
  });

  it('throws MISSING_CREDENTIALS when Authorization header is absent', () => {
    process.env['ADMIN_UPLOAD_TOKEN'] = VALID_TOKEN;
    const guard = new AdminTokenGuard();
    const context = createMockContext(createMockRequest());

    expect(() => guard.canActivate(context)).toThrow(AuthenticationError);
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        code: AuthenticationErrorCode.MISSING_CREDENTIALS,
      }),
    );
  });

  it('throws MISSING_CREDENTIALS when Authorization header is malformed (no Bearer prefix)', () => {
    process.env['ADMIN_UPLOAD_TOKEN'] = VALID_TOKEN;
    const guard = new AdminTokenGuard();
    const context = createMockContext(
      createMockRequest({ authorization: VALID_TOKEN }),
    );

    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        code: AuthenticationErrorCode.MISSING_CREDENTIALS,
      }),
    );
  });

  it('throws INVALID_CREDENTIALS when the bearer token does not match', () => {
    process.env['ADMIN_UPLOAD_TOKEN'] = VALID_TOKEN;
    const guard = new AdminTokenGuard();
    const context = createMockContext(
      createMockRequest({ authorization: 'Bearer wrong-token' }),
    );

    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        code: AuthenticationErrorCode.INVALID_CREDENTIALS,
      }),
    );
  });

  it('throws INVALID_CREDENTIALS when the bearer token differs only in length', () => {
    process.env['ADMIN_UPLOAD_TOKEN'] = VALID_TOKEN;
    const guard = new AdminTokenGuard();
    const context = createMockContext(
      createMockRequest({ authorization: `Bearer ${VALID_TOKEN}-extra` }),
    );

    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        code: AuthenticationErrorCode.INVALID_CREDENTIALS,
      }),
    );
  });

  it('returns true when the bearer token matches ADMIN_UPLOAD_TOKEN', () => {
    process.env['ADMIN_UPLOAD_TOKEN'] = VALID_TOKEN;
    const guard = new AdminTokenGuard();
    const context = createMockContext(
      createMockRequest({ authorization: `Bearer ${VALID_TOKEN}` }),
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('fails closed (throws, does not grant access) when ADMIN_UPLOAD_TOKEN is unset', () => {
    delete process.env['ADMIN_UPLOAD_TOKEN'];
    const guard = new AdminTokenGuard();
    const context = createMockContext(
      createMockRequest({ authorization: 'Bearer anything' }),
    );

    expect(() => guard.canActivate(context)).toThrow(
      'ADMIN_UPLOAD_TOKEN not configured',
    );
  });
});
