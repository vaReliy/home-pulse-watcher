import * as http from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/** Minimal controller to exercise the global ThrottlerGuard. */
@Controller('ping')
class PingController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

interface HttpResponse {
  status: number;
}

function get(server: http.Server, path: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;

    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        res.resume(); // drain response body
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );

    req.on('error', reject);
    req.end();
  });
}

describe('ThrottlerGuard (integration)', () => {
  let app: INestApplication;
  let httpServer: http.Server;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 2 }]),
      ],
      controllers: [PingController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    httpServer = app.getHttpServer() as http.Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows requests within the limit', async () => {
    const first = await get(httpServer, '/ping');
    const second = await get(httpServer, '/ping');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('returns 429 when the limit is exceeded', async () => {
    await get(httpServer, '/ping');
    await get(httpServer, '/ping');
    const third = await get(httpServer, '/ping');

    expect(third.status).toBe(429);
  });
});
