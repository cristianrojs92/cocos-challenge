import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

describe('POST /orders/:id/cancel (e2e)', () => {
  let app: INestApplication<App>;
  const cancel = (id: number | string) =>
    request(app.getHttpServer()).post(`/orders/${id}/cancel`);

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  beforeEach(resetDatabase);
  afterAll(async () => app.close());

  it('cancela una NEW y libera la reserva', async () => {
    const { body } = await cancel(5).expect(200);
    expect(body).toMatchObject({
      id: 5,
      status: 'CANCELLED',
      size: 50,
      price: 710,
    });
    const p = await request(app.getHttpServer()).get('/users/1/portfolio');
    expect(p.body.availableCash).toBe(663000); // 627500 + 35500
  });

  it('cancelar dos veces → 409', async () => {
    await cancel(5).expect(200);
    await cancel(5).expect(409);
  });

  it('cancelar una FILLED → 409', async () => {
    await cancel(1).expect(409);
  });

  it('orden inexistente → 404', async () => {
    await cancel(9999).expect(404);
  });

  it('id no numérico → 400', async () => {
    await cancel('abc').expect(400);
    await cancel('99999999999').expect(400);
  });
});
