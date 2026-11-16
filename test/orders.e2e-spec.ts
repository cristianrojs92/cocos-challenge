import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

const SEED_ORDER_COUNT = 11;

describe('POST /orders (e2e)', () => {
  let app: INestApplication<App>;
  const post = (body: object) =>
    request(app.getHttpServer()).post('/orders').send(body);
  const portfolio = async (userId = 1) =>
    (
      await request(app.getHttpServer())
        .get(`/users/${userId}/portfolio`)
        .expect(200)
    ).body;
  const orderCount = async () =>
    Number(
      (await app.get(DataSource).query('SELECT count(*) FROM orders'))[0].count,
    );
  const pamp = (extra: object) => ({ userId: 1, instrumentId: 47, ...extra });

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  beforeEach(resetDatabase);
  afterAll(async () => app.close());

  it('MARKET BUY → FILLED al último close', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'MARKET', size: 10 }),
    ).expect(201);
    expect(body).toMatchObject({
      userId: 1,
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      status: 'FILLED',
      size: 10,
      price: 925.85,
    });
    expect(typeof body.id).toBe('number');
    const p = await portfolio();
    expect(p.availableCash).toBe(618241.5);
    expect(
      p.positions.find((x: { instrumentId: number }) => x.instrumentId === 47)
        .quantity,
    ).toBe(50);
  });

  it('LIMIT BUY → NEW con el precio enviado', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'LIMIT', size: 5, price: 900 }),
    ).expect(201);
    expect(body).toMatchObject({ status: 'NEW', size: 5, price: 900 });
    expect((await portfolio()).availableCash).toBe(623000);
  });

  it('por monto: floor(10000 / 925.85) = 10', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'MARKET', amount: 10000 }),
    ).expect(201);
    expect(body).toMatchObject({ status: 'FILLED', size: 10, price: 925.85 });
  });

  it('por monto en LIMIT usa el precio límite: floor(10000 / 900) = 11', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'LIMIT', amount: 10000, price: 900 }),
    ).expect(201);
    expect(body).toMatchObject({ status: 'NEW', size: 11, price: 900 });
  });

  it('monto que no alcanza para 1 acción → REJECTED size 0', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'MARKET', amount: 100 }),
    ).expect(201);
    expect(body).toMatchObject({ status: 'REJECTED', size: 0 });
  });

  it('BUY por encima del disponible → REJECTED y persistida', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'MARKET', size: 1000 }),
    ).expect(201);
    expect(body.status).toBe('REJECTED');
    expect(await orderCount()).toBe(SEED_ORDER_COUNT + 1);
    const p = await portfolio();
    expect(p.cashBalance).toBe(753000);
    expect(p.availableCash).toBe(627500);
  });

  it('la reserva de LIMIT cuenta: 700 @ 900 = 630000 > 627500 → REJECTED', async () => {
    const { body } = await post(
      pamp({ side: 'BUY', type: 'LIMIT', size: 700, price: 900 }),
    ).expect(201);
    expect(body.status).toBe('REJECTED');
  });

  it('SELL de más → REJECTED; SELL exacto → FILLED', async () => {
    expect(
      (await post(pamp({ side: 'SELL', type: 'MARKET', size: 41 })).expect(201))
        .body.status,
    ).toBe('REJECTED');
    expect(
      (await post(pamp({ side: 'SELL', type: 'MARKET', size: 40 })).expect(201))
        .body.status,
    ).toBe('FILLED');
  });

  it('SELL LIMIT NEW reserva acciones', async () => {
    expect(
      (
        await post(
          pamp({ side: 'SELL', type: 'LIMIT', size: 30, price: 1000 }),
        ).expect(201)
      ).body.status,
    ).toBe('NEW');
    expect(
      (await post(pamp({ side: 'SELL', type: 'MARKET', size: 20 })).expect(201))
        .body.status,
    ).toBe('REJECTED');
  });

  it('posición sobrevendida (31): SELL 1 → REJECTED', async () => {
    const { body } = await post({
      userId: 1,
      instrumentId: 31,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    }).expect(201);
    expect(body.status).toBe('REJECTED');
  });

  it('MARKET sin precio (instrumento 3) → REJECTED, price null', async () => {
    const { body } = await post({
      userId: 1,
      instrumentId: 3,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(201);
    expect(body).toMatchObject({ status: 'REJECTED', price: null });
  });

  it('concurrencia: 10 MARKET BUY de 100 PAMP en paralelo → solo 6 entran en el disponible', async () => {
    // 100 × 925.85 = 92585 por orden; floor(627500 / 92585) = 6.
    const body = pamp({ side: 'BUY', type: 'MARKET', size: 100 });
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => post(body)),
    );
    const statuses = responses.map((r) => r.body.status);
    expect(statuses.filter((s) => s === 'FILLED')).toHaveLength(6);
    expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(4);
    expect((await portfolio()).availableCash).toBe(71990);
  });

  it.each([
    ['LIMIT sin price', { type: 'LIMIT', size: 1 }],
    ['MARKET con price', { size: 1, price: 900 }],
    ['size y amount juntos', { size: 1, amount: 1000 }],
    ['ni size ni amount', {}],
    ['size decimal', { size: 1.5 }],
    ['size fuera de INT', { size: 2147483648 }],
    ['price con 3 decimales', { type: 'LIMIT', size: 1, price: 900.123 }],
    ['price ≥ 1e8', { type: 'LIMIT', size: 1, price: 100000000 }],
    ['amount con 3 decimales', { amount: 1000.001 }],
    ['side CASH_IN', { side: 'CASH_IN', size: 1 }],
    ['type desconocido', { type: 'STOP', size: 1 }],
    ['instrumento MONEDA', { instrumentId: 66, size: 1 }],
    ['campo extra status', { size: 1, status: 'FILLED' }],
    ['userId como texto', { userId: 'abc', size: 1 }],
    ['userId fuera de INT', { userId: 3000000000, size: 1 }],
    ['instrumentId fuera de INT', { instrumentId: 3000000000, size: 1 }],
    ['price null en LIMIT', { type: 'LIMIT', size: 1, price: null }],
    ['size null sin amount', { size: null }],
    ['amount null con size', { size: 1, amount: null }],
    ['price en notación exponencial', { type: 'LIMIT', size: 1, price: 1e-7 }],
    ['amount en notación exponencial', { amount: 1e-7 }],
    [
      'size calculado fuera de INT',
      { type: 'LIMIT', price: 0.01, amount: 99999999.99 },
    ],
  ])('400: %s', async (_name, override) => {
    await post({
      userId: 1,
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      ...override,
    }).expect(400);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT);
  });

  it('instrumento inexistente → 404', async () => {
    await post({
      userId: 1,
      instrumentId: 9999,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(404);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT);
  });

  it('usuario inexistente → 404', async () => {
    await post({
      userId: 9999,
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(404);
    expect(await orderCount()).toBe(SEED_ORDER_COUNT);
  });
});
