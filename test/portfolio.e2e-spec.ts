import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

describe('GET /users/:userId/portfolio (e2e)', () => {
  let app: INestApplication<App>;
  const get = (userId: number | string) =>
    request(app.getHttpServer()).get(`/users/${userId}/portfolio`);

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  beforeEach(resetDatabase);
  afterAll(async () => app.close());

  it('portfolio del usuario 1', async () => {
    const { body } = await get(1).expect(200);
    expect(body).toMatchObject({
      userId: 1,
      totalValue: 904784,
      cashBalance: 753000,
      reservedCash: 125500,
      availableCash: 627500,
    });
    expect(body.positions).toEqual([
      {
        instrumentId: 54,
        ticker: 'METR',
        name: 'MetroGAS S.A.',
        quantity: 500,
        availableQuantity: 500,
        averageCost: 250,
        lastPrice: 229.5,
        marketValue: 114750,
        totalReturnPercent: -8.2,
        dailyReturnPercent: -1.08,
      },
      {
        instrumentId: 47,
        ticker: 'PAMP',
        name: 'Pampa Holding S.A.',
        quantity: 40,
        availableQuantity: 40,
        averageCost: 930,
        lastPrice: 925.85,
        marketValue: 37034,
        totalReturnPercent: -0.45,
        dailyReturnPercent: 0.44,
      },
    ]);
  });

  it('no lista la posición sobrevendida (31)', async () => {
    const { body } = await get(1).expect(200);
    expect(
      body.positions.map((p: { instrumentId: number }) => p.instrumentId),
    ).not.toContain(31);
  });

  it('todos los montos son number', async () => {
    const { body } = await get(1).expect(200);
    for (const key of [
      'totalValue',
      'cashBalance',
      'reservedCash',
      'availableCash',
    ]) {
      expect(typeof body[key]).toBe('number');
    }
    for (const p of body.positions) {
      for (const key of [
        'quantity',
        'availableQuantity',
        'averageCost',
        'lastPrice',
        'marketValue',
        'totalReturnPercent',
        'dailyReturnPercent',
      ]) {
        expect(typeof p[key]).toBe('number');
      }
    }
  });

  it('usuario sin órdenes → todo 0 y positions []', async () => {
    const { body } = await get(2).expect(200);
    expect(body).toEqual({
      userId: 2,
      totalValue: 0,
      cashBalance: 0,
      reservedCash: 0,
      availableCash: 0,
      positions: [],
    });
  });

  it('usuario inexistente → 404', async () => {
    await get(9999).expect(404);
  });

  it('userId no numérico → 400', async () => {
    await get('abc').expect(400);
    await get('99999999999').expect(400);
    await get(0).expect(400);
  });

  it('posición sin precio → nulls y no suma al total', async () => {
    await app.get(DataSource).query(
      `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
       VALUES (3, 2, 10, 100, 'MARKET', 'BUY', 'FILLED', now())`,
    );
    const { body } = await get(2).expect(200);
    expect(body.cashBalance).toBe(-1000);
    expect(body.totalValue).toBe(-1000);
    expect(body.positions).toEqual([
      expect.objectContaining({
        instrumentId: 3,
        quantity: 10,
        averageCost: 100,
        lastPrice: null,
        marketValue: null,
        totalReturnPercent: null,
        dailyReturnPercent: null,
      }),
    ]);
  });
});
