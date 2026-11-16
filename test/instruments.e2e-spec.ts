import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

/** Activos del seed (sin MONEDA) cuyo ticker o nombre contiene "a". */
const TOTAL_WITH_A = 59;

describe('GET /instruments/search (e2e)', () => {
  let app: INestApplication<App>;
  const search = (query: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get('/instruments/search').query(query);
  const tickersOf = (body: { items: { ticker: string }[] }) =>
    body.items.map((instrument) => instrument.ticker);

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it('busca por ticker sin distinguir mayúsculas', async () => {
    const res = await search({ q: 'pamp' }).expect(200);
    expect(res.body.items[0]).toEqual({
      id: 47,
      ticker: 'PAMP',
      name: 'Pampa Holding S.A.',
      type: 'ACCIONES',
      lastPrice: 925.85,
    });
  });

  it('busca por nombre parcial', async () => {
    const res = await search({ q: 'holding' }).expect(200);
    expect(tickersOf(res.body)).toEqual(
      expect.arrayContaining(['PAMP', 'HAVA']),
    );
  });

  it('excluye MONEDA', async () => {
    const res = await search({ q: 'ars' }).expect(200);
    const ids = res.body.items.map(
      (instrument: { id: number }) => instrument.id,
    );
    expect(ids).not.toContain(66);
  });

  it('sin precio → lastPrice null', async () => {
    const res = await search({ q: 'PGR' }).expect(200);
    expect(res.body.items).toContainEqual(
      expect.objectContaining({ id: 3, lastPrice: null }),
    );
  });

  it('trata % y _ literalmente', async () => {
    for (const q of ['%', '_']) {
      const res = await search({ q }).expect(200);
      expect(res.body).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
    }
  });

  it('q vacío o ausente → 400', async () => {
    await search({ q: '' }).expect(400);
    await search({ q: '   ' }).expect(400);
    await search().expect(400);
  });

  it('por defecto: primera página de 20, ordenada por ticker, con el total', async () => {
    const res = await search({ q: 'a' }).expect(200);
    expect(res.body).toMatchObject({
      total: TOTAL_WITH_A,
      limit: 20,
      offset: 0,
    });
    expect(res.body.items).toHaveLength(20);
    const tickers = tickersOf(res.body);
    expect(tickers).toEqual([...tickers].sort());
  });

  it('recorre todas las páginas sin repetir ni saltear resultados', async () => {
    const pages = await Promise.all(
      [0, 20, 40].map((offset) =>
        search({ q: 'a', limit: 20, offset }).expect(200),
      ),
    );
    expect(pages.map((page) => page.body.items.length)).toEqual([20, 20, 19]);
    expect(pages.every((page) => page.body.total === TOTAL_WITH_A)).toBe(true);

    const all = pages.flatMap((page) => tickersOf(page.body));
    expect(new Set(all).size).toBe(TOTAL_WITH_A);
    expect(all).toEqual([...all].sort());
  });

  it('respeta limit y offset', async () => {
    const full = await search({ q: 'a', limit: 10 }).expect(200);
    const page = await search({ q: 'a', limit: 3, offset: 2 }).expect(200);
    expect(page.body).toMatchObject({
      limit: 3,
      offset: 2,
      total: TOTAL_WITH_A,
    });
    expect(tickersOf(page.body)).toEqual(tickersOf(full.body).slice(2, 5));
  });

  it('offset más allá del total → items vacío con el total', async () => {
    const res = await search({ q: 'a', offset: 100 }).expect(200);
    expect(res.body).toEqual({
      items: [],
      total: TOTAL_WITH_A,
      limit: 20,
      offset: 100,
    });
  });

  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: 'abc' },
    { offset: -1 },
    { offset: 1.5 },
    { offset: 'abc' },
  ])('paginación inválida %o → 400', async (pagination) => {
    await search({ q: 'a', ...pagination }).expect(400);
  });
});
