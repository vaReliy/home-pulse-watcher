import pino from 'pino';
import { Writable } from 'node:stream';
import { REDACTED_HEADER_PATHS } from './app.module';

/**
 * Regression test for the HTTP-request-log auth-header leak: pino-http's
 * default req serializer logs the full req.headers object at `info` level
 * on every request. This exercises the exact `redact` config wired into
 * `LoggerModule.forRoot({ pinoHttp: { redact: ... } })` in app.module.ts
 * against real-looking secret values and asserts none of them survive
 * serialization.
 */
describe('pinoHttp redact config (app.module.ts)', () => {
  const captureLogLine = (
    headers: Record<string, string>,
  ): Record<string, unknown> => {
    let captured = '';
    const sink = new Writable({
      write(chunk: Buffer, _enc, callback) {
        captured += chunk.toString();
        callback();
      },
    });

    const logger = pino(
      {
        redact: {
          paths: REDACTED_HEADER_PATHS,
          censor: '[Redacted]',
        },
      },
      sink,
    );

    logger.info({ req: { headers } }, 'request completed');

    return JSON.parse(captured) as Record<string, unknown>;
  };

  it('redacts the Telegram webhook secret token', () => {
    const line = captureLogLine({
      'x-telegram-bot-api-secret-token': 'super-secret-telegram-token',
    });

    const raw = JSON.stringify(line);
    expect(raw).not.toContain('super-secret-telegram-token');
    expect(
      (line['req'] as { headers: Record<string, unknown> }).headers[
        'x-telegram-bot-api-secret-token'
      ],
    ).toBe('[Redacted]');
  });

  it('redacts device HMAC auth headers (x-signature, x-device-mac, x-timestamp)', () => {
    const line = captureLogLine({
      'x-signature': 'a'.repeat(64),
      'x-device-mac': 'AA:BB:CC:DD:EE:FF',
      'x-timestamp': '1699999999',
    });

    const raw = JSON.stringify(line);
    expect(raw).not.toContain('a'.repeat(64));
    expect(raw).not.toContain('AA:BB:CC:DD:EE:FF');
    expect(raw).not.toContain('1699999999');

    const redactedHeaders = (
      line['req'] as { headers: Record<string, unknown> }
    ).headers;
    expect(redactedHeaders['x-signature']).toBe('[Redacted]');
    expect(redactedHeaders['x-device-mac']).toBe('[Redacted]');
    expect(redactedHeaders['x-timestamp']).toBe('[Redacted]');
  });

  it('redacts the admin bearer token (authorization header)', () => {
    const line = captureLogLine({
      authorization: 'Bearer super-secret-admin-token',
    });

    const raw = JSON.stringify(line);
    expect(raw).not.toContain('super-secret-admin-token');
    expect(
      (line['req'] as { headers: Record<string, unknown> }).headers[
        'authorization'
      ],
    ).toBe('[Redacted]');
  });

  it('leaves non-secret headers untouched', () => {
    const line = captureLogLine({
      'content-type': 'application/json',
      'user-agent': 'esp32-device/1.0',
    });

    const redactedHeaders = (
      line['req'] as { headers: Record<string, unknown> }
    ).headers;
    expect(redactedHeaders['content-type']).toBe('application/json');
    expect(redactedHeaders['user-agent']).toBe('esp32-device/1.0');
  });
});
