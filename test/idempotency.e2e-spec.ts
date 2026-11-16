import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

const SEED_ORDER_COUNT = 11;
const KEY = '7d3f0c2e-1b8a-4c55-9e0f-2a6b8c9d1e3f';

describe('POST /orders con Idempotency-Key (e2e)', () => {
  let app: INestApplication<App>;
  const post = (body: object, key?: string) => {
    const req = request(app.getHttpServer()).post('/orders');
    if (key !== undefined) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const orderCount = async () =>
    Number(
      (await app.get(DataSource).query('SELECT count(*) FROM orders'))[0].count,
    );
  const availableCash = async (userId = 1) =>
    (
      await request(app.getHttpServer())
        .get(`/users/${userId}/portfolio`)
        .expect(200)
    ).body.availableCash;
  const pamp = (extra: object) => ({ userId: 1, instrumentId: 47, ...extra });
  const buy10 = pamp({ side: 'BUY', type: 'MARKET', size: 10 });

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  beforeEach(resetDatabase);
  afterAll(async () => app.close());

  it('sin header, dos pedidos iguales crean dos órdenes (como siempre)', async () => {
    await post(buy10).expect(201);
    await post(buy10).expect(201);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 2);
  });

  it('misma clave y mismo pedido → devuelve la orden original sin crear otra', async () => {
    const first = await post(buy10, KEY).expect(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();

    const retry = await post(buy10, KEY).expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);

    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 1);
    // El saldo se descontó una sola vez: 627500 − 10 × 925.85.
    expect(await availableCash()).toBe(618241.5);
  });

  it('el reintento de una orden REJECTED devuelve la misma orden REJECTED', async () => {
    const tooBig = pamp({ side: 'BUY', type: 'MARKET', size: 100000 });
    const first = await post(tooBig, KEY).expect(201);
    expect(first.body.status).toBe('REJECTED');

    const retry = await post(tooBig, KEY).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 1);
  });

  it('el reintento devuelve el estado actual de la orden: LIMIT cancelada → CANCELLED', async () => {
    const limit = pamp({ side: 'BUY', type: 'LIMIT', size: 5, price: 900 });
    const first = await post(limit, KEY).expect(201);
    expect(first.body.status).toBe('NEW');
    await request(app.getHttpServer())
      .post(`/orders/${first.body.id}/cancel`)
      .expect(200);

    const retry = await post(limit, KEY).expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toMatchObject({
      id: first.body.id,
      status: 'CANCELLED',
    });
    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 1);
  });

  it('misma clave con otro pedido → 409 y no persiste nada', async () => {
    await post(buy10, KEY).expect(201);

    await post(pamp({ side: 'SELL', type: 'MARKET', size: 10 }), KEY).expect(
      409,
    );
    await post(pamp({ side: 'BUY', type: 'MARKET', size: 11 }), KEY).expect(
      409,
    );
    await post({ ...buy10, instrumentId: 54 }, KEY).expect(409);

    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 1);
  });

  it('LIMIT: misma clave con otro precio → 409', async () => {
    await post(
      pamp({ side: 'BUY', type: 'LIMIT', size: 5, price: 900 }),
      KEY,
    ).expect(201);
    await post(
      pamp({ side: 'BUY', type: 'LIMIT', size: 5, price: 901 }),
      KEY,
    ).expect(409);
  });

  it('por monto: mismo monto → misma orden; otro monto → 409', async () => {
    const byAmount = pamp({ side: 'BUY', type: 'MARKET', amount: 10000 });
    const first = await post(byAmount, KEY).expect(201);
    const retry = await post(byAmount, KEY).expect(201);
    expect(retry.body.id).toBe(first.body.id);

    // floor(10500 / 925.85) también da 10 acciones, pero es otro pedido.
    await post(
      pamp({ side: 'BUY', type: 'MARKET', amount: 10500 }),
      KEY,
    ).expect(409);
  });

  it('la clave es por usuario: la misma clave en otro usuario crea otra orden', async () => {
    const a = await post(buy10, KEY).expect(201);
    const b = await post({ ...buy10, userId: 2 }, KEY).expect(201);
    expect(b.body.id).not.toBe(a.body.id);
    expect(b.headers['idempotent-replayed']).toBeUndefined();
    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 2);
  });

  it.each([
    ['vacía', ''],
    ['más de 64 caracteres', 'a'.repeat(65)],
    ['caracteres no permitidos', 'clave con espacios'],
  ])('clave %s → 400', async (_caso, key) => {
    await post(buy10, key).expect(400);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT);
  });

  it('concurrencia: 5 pedidos en paralelo con la misma clave crean una sola orden', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(buy10, KEY)),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(
      responses.filter((r) => r.headers['idempotent-replayed'] === 'true'),
    ).toHaveLength(4);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 1);
  });
});
