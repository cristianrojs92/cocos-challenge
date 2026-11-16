import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

const KEY = '3b9e1f4a-6c2d-4e8b-a1f0-9d7c5b3a2e10';

describe('rejectReason de las órdenes REJECTED (e2e)', () => {
  let app: INestApplication<App>;
  const post = (body: object, key?: string) => {
    const req = request(app.getHttpServer()).post('/orders');
    if (key !== undefined) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const order = (instrumentId: number, extra: object) => ({
    userId: 1,
    instrumentId,
    ...extra,
  });
  const reasonOf = async (body: object) =>
    (await post(body).expect(201)).body as {
      id: number;
      status: string;
      rejectReason: string | null;
    };

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  beforeEach(resetDatabase);
  afterAll(async () => app.close());

  it('MARKET sin precio → NO_MARKET_PRICE', async () => {
    const body = await reasonOf(
      order(3, { side: 'BUY', type: 'MARKET', size: 1 }),
    );
    expect(body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'NO_MARKET_PRICE',
    });
  });

  it('MARKET por monto sin precio → NO_MARKET_PRICE (precio antes que tamaño)', async () => {
    const body = await reasonOf(
      order(3, { side: 'BUY', type: 'MARKET', amount: 1000 }),
    );
    expect(body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'NO_MARKET_PRICE',
    });
  });

  it('monto que no alcanza para 1 acción → AMOUNT_TOO_SMALL', async () => {
    const body = await reasonOf(
      order(47, { side: 'BUY', type: 'MARKET', amount: 1 }),
    );
    expect(body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'AMOUNT_TOO_SMALL',
    });
  });

  it('LIMIT por monto menor al precio límite → AMOUNT_TOO_SMALL', async () => {
    const body = await reasonOf(
      order(47, { side: 'BUY', type: 'LIMIT', price: 1000, amount: 500 }),
    );
    expect(body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'AMOUNT_TOO_SMALL',
    });
  });

  it('BUY por encima del disponible → INSUFFICIENT_FUNDS', async () => {
    const body = await reasonOf(
      order(47, { side: 'BUY', type: 'LIMIT', price: 900, size: 700 }),
    );
    expect(body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'INSUFFICIENT_FUNDS',
    });
  });

  it('SELL sobre la posición sobrevendida → INSUFFICIENT_SHARES', async () => {
    const body = await reasonOf(
      order(31, { side: 'SELL', type: 'MARKET', size: 1 }),
    );
    expect(body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'INSUFFICIENT_SHARES',
    });
  });

  it('FILLED, NEW y CANCELLED → rejectReason null', async () => {
    const filled = await reasonOf(
      order(47, { side: 'BUY', type: 'MARKET', size: 1 }),
    );
    const limit = await reasonOf(
      order(47, { side: 'BUY', type: 'LIMIT', price: 900, size: 1 }),
    );
    const { body: cancelled } = await request(app.getHttpServer())
      .post(`/orders/${limit.id}/cancel`)
      .expect(200);

    expect(filled.status).toBe('FILLED');
    expect(limit.status).toBe('NEW');
    expect(cancelled.status).toBe('CANCELLED');
    for (const body of [filled, limit, cancelled]) {
      expect(body).toHaveProperty('rejectReason', null);
    }
  });

  it('el reintento idempotente conserva el motivo', async () => {
    const pedido = order(3, { side: 'BUY', type: 'MARKET', size: 1 });
    const first = await post(pedido, KEY).expect(201);
    const retry = await post(pedido, KEY).expect(201);

    expect(first.body.rejectReason).toBe('NO_MARKET_PRICE');
    expect(retry.body).toMatchObject({
      id: first.body.id,
      rejectReason: 'NO_MARKET_PRICE',
    });
    expect(retry.headers['idempotent-replayed']).toBe('true');
  });

  it('el motivo queda guardado en la tabla', async () => {
    const body = await reasonOf(
      order(47, { side: 'BUY', type: 'LIMIT', price: 900, size: 700 }),
    );
    const [row] = await app
      .get(DataSource)
      .query('SELECT reject_reason FROM orders WHERE id = $1', [body.id]);
    expect(row.reject_reason).toBe('INSUFFICIENT_FUNDS');
  });

  it('las órdenes REJECTED del seed quedan sin motivo', async () => {
    const [{ count }] = await app
      .get(DataSource)
      .query(
        "SELECT count(*) FROM orders WHERE status = 'REJECTED' AND reject_reason IS NOT NULL",
      );
    expect(Number(count)).toBe(0);
  });
});
