import { INestApplication } from '@nestjs/common';
import { Writable } from 'node:stream';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

type LogLine = Record<string, unknown> & {
  level: string;
  msg?: string;
  requestId?: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Logs (e2e)', () => {
  let app: INestApplication<App>;
  let raw: string[] = [];
  const lines = (): LogLine[] =>
    raw
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LogLine);
  const ofRequest = (id: string) => lines().filter((l) => l.requestId === id);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'debug';
    await resetDatabase();
    const logDestination = new Writable({
      write(chunk: Buffer, _enc, done) {
        raw.push(chunk.toString());
        done();
      },
    });
    app = await createTestApp({ logDestination });
  });
  beforeEach(async () => {
    await resetDatabase();
    raw = [];
  });
  afterAll(async () => {
    await app.close();
    process.env.LOG_LEVEL = 'silent';
  });

  describe('X-Request-Id', () => {
    it('genera un X-Request-Id si no viene', async () => {
      const res = await http().get('/users/1/portfolio').expect(200);
      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('reutiliza un X-Request-Id válido', async () => {
      const res = await http()
        .get('/users/1/portfolio')
        .set('X-Request-Id', 'abc-123_XYZ')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('abc-123_XYZ');
    });

    it('reemplaza un X-Request-Id inválido', async () => {
      for (const bad of ['bad id/<script>', 'a'.repeat(65)]) {
        const res = await http()
          .get('/users/1/portfolio')
          .set('X-Request-Id', bad)
          .expect(200);
        expect(res.headers['x-request-id']).toMatch(UUID);
      }
    });

    it('devuelve el id también en errores', async () => {
      const notFound = await http().get('/users/9999/portfolio').expect(404);
      const badRequest = await http().post('/orders').send({}).expect(400);
      expect(notFound.headers['x-request-id']).toMatch(UUID);
      expect(badRequest.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('log de cada request', () => {
    it('loguea cada request con su requestId y nivel', async () => {
      await http()
        .get('/users/1/portfolio')
        .set('X-Request-Id', 'req-ok')
        .expect(200);
      await http()
        .get('/users/9999/portfolio')
        .set('X-Request-Id', 'req-404')
        .expect(404);

      const ok = ofRequest('req-ok').find((l) => l.res);
      expect(ok).toMatchObject({
        level: 'info',
        msg: 'request completed',
        res: { statusCode: 200 },
      });
      expect(typeof ok?.responseTime).toBe('number');
      expect(ofRequest('req-404').find((l) => l.res)).toMatchObject({
        level: 'warn',
        res: { statusCode: 404 },
      });
    });

    it('JSON mal formado: devuelve el id y queda en warn', async () => {
      const res = await http()
        .post('/orders')
        .set('Content-Type', 'application/json')
        .set('X-Request-Id', 'req-bad-json')
        .send('{bad')
        .expect(400);
      expect(res.headers['x-request-id']).toBe('req-bad-json');
      expect(ofRequest('req-bad-json').find((l) => l.res)).toMatchObject({
        level: 'warn',
        res: { statusCode: 400 },
      });
    });

    it('no loguea Swagger', async () => {
      await http().get('/docs-json').expect(200);
      const docs = lines().filter((l) =>
        String((l.req as { url?: string } | undefined)?.url).startsWith(
          '/docs',
        ),
      );
      expect(docs).toHaveLength(0);
    });

    it('no loguea credenciales', async () => {
      await http()
        .get('/users/1/portfolio')
        .set('Authorization', 'Bearer secret')
        .expect(200);
      expect(raw.join('')).not.toContain('secret');
    });
  });

  describe('eventos de negocio', () => {
    const order = (id: string, body: object, key?: string) => {
      const req = http().post('/orders').set('X-Request-Id', id);
      if (key) req.set('Idempotency-Key', key);
      return req.send({ userId: 1, ...body });
    };
    const find = (id: string, msg: string) =>
      ofRequest(id).find((l) => l.msg === msg);

    it('Order created con su resultado', async () => {
      const { body } = await order('r1', {
        instrumentId: 47,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      }).expect(201);
      expect(find('r1', 'Order created')).toMatchObject({
        level: 'info',
        orderId: body.id,
        userId: 1,
        instrumentId: 47,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
        status: 'FILLED',
        rejectReason: null,
      });
    });

    it('Order created REJECTED con motivo', async () => {
      await order('r2', {
        instrumentId: 3,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      }).expect(201);
      expect(find('r2', 'Order created')).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'NO_MARKET_PRICE',
      });
    });

    it('debug del flujo de la orden', async () => {
      await order('r3', {
        instrumentId: 47,
        side: 'BUY',
        type: 'MARKET',
        amount: 10000,
      }).expect(201);
      expect(find('r3', 'Execution price resolved')).toMatchObject({
        level: 'debug',
        instrumentId: 47,
        type: 'MARKET',
        price: '925.85',
      });
      expect(find('r3', 'Order size resolved')).toMatchObject({
        level: 'debug',
        size: 10,
        fromAmount: true,
      });
      expect(find('r3', 'Balance check')).toMatchObject({
        level: 'debug',
        side: 'BUY',
        required: '9258.5',
        available: '627500',
      });
    });

    it('Idempotent replay y conflicto', async () => {
      const KEY = 'log-key-1';
      const buy = { instrumentId: 47, side: 'BUY', type: 'MARKET', size: 1 };
      const { body } = await order('r4a', buy, KEY).expect(201);
      await order('r4', buy, KEY).expect(201);
      await order('r5', { ...buy, size: 2 }, KEY).expect(409);

      expect(find('r4', 'Idempotent replay')).toMatchObject({
        level: 'info',
        orderId: body.id,
        userId: 1,
      });
      expect(find('r4', 'Order created')).toBeUndefined();
      expect(
        find('r5', 'Idempotency key reused with a different request'),
      ).toMatchObject({ level: 'warn', userId: 1 });
    });

    it('cancelación', async () => {
      const { body } = await order('r6', {
        instrumentId: 47,
        side: 'BUY',
        type: 'LIMIT',
        price: 900,
        size: 1,
      }).expect(201);
      await http()
        .post(`/orders/${body.id}/cancel`)
        .set('X-Request-Id', 'r7')
        .expect(200);
      await http()
        .post('/orders/1/cancel')
        .set('X-Request-Id', 'r8')
        .expect(409);

      expect(find('r7', 'Order cancelled')).toMatchObject({
        level: 'info',
        orderId: body.id,
        userId: 1,
      });
      expect(find('r8', 'Order cannot be cancelled')).toMatchObject({
        level: 'warn',
        orderId: 1,
        status: 'FILLED',
      });
    });

    it('portfolio y búsqueda en debug', async () => {
      await http()
        .get('/users/1/portfolio')
        .set('X-Request-Id', 'r9')
        .expect(200);
      await http()
        .get('/instruments/search?q=pamp')
        .set('X-Request-Id', 'r10')
        .expect(200);

      const portfolio = find('r9', 'Portfolio computed');
      expect(portfolio).toMatchObject({ level: 'debug', userId: 1 });
      expect(typeof portfolio?.positions).toBe('number');
      expect(find('r10', 'Instrument search')).toMatchObject({
        level: 'debug',
        query: 'pamp',
        results: 1,
      });
    });

    it('requestId no se mezcla entre requests concurrentes', async () => {
      const ids = ['c0', 'c1', 'c2', 'c3', 'c4'];
      const responses = await Promise.all(
        ids.map((id) =>
          order(id, {
            instrumentId: 47,
            side: 'BUY',
            type: 'MARKET',
            size: 1,
          }).expect(201),
        ),
      );
      ids.forEach((id, i) => {
        expect(find(id, 'Order created')?.orderId).toBe(responses[i].body.id);
      });
    });

    it('nunca loguea el email', async () => {
      await http().get('/users/1/portfolio').expect(200);
      expect(raw.join('')).not.toContain('@test.com');
    });
  });
});
