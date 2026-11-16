import { INestApplication } from '@nestjs/common';
import Decimal from 'decimal.js';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Instrument } from '../src/instruments/instrument.entity';
import { Order } from '../src/orders/order.entity';
import { CASH_INSTRUMENT_TYPE } from '../src/orders/order.enums';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
  });
  beforeEach(resetDatabase);
  afterAll(async () => app.close());

  it('carga el seed', async () => {
    const ds = app.get(DataSource);
    expect(await ds.getRepository(Instrument).count()).toBe(66);
    const ars = await ds
      .getRepository(Instrument)
      .findOneByOrFail({ type: CASH_INSTRUMENT_TYPE });
    expect(ars.ticker).toBe('ARS');
    const order = await ds.getRepository(Order).findOneByOrFail({ id: 2 });
    expect(order.price).toBeInstanceOf(Decimal);
    expect(order.price!.toString()).toBe('930');
  });

  it('crea índices trigram para la búsqueda por ticker y nombre', async () => {
    const rows: { indexname: string }[] = await app
      .get(DataSource)
      .query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'instruments' AND indexdef LIKE '%gin_trgm_ops%'`,
      );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'idx_instruments_name_trgm',
      'idx_instruments_ticker_trgm',
    ]);
  });

  it('sirve swagger', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        '/orders',
        '/orders/{id}/cancel',
        '/users/{userId}/portfolio',
        '/instruments/search',
      ]),
    );
  });

  it('documenta rejectReason como enum nullable, con null entre los valores', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(
      body.components.schemas.OrderResponse.properties.rejectReason,
    ).toMatchObject({
      enum: [
        'NO_MARKET_PRICE',
        'AMOUNT_TOO_SMALL',
        'INSUFFICIENT_FUNDS',
        'INSUFFICIENT_SHARES',
        null,
      ],
      nullable: true,
    });
  });

  it('documenta los enteros como integer y cuándo price es null', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const { schemas } = body.components;
    const typeOf = (schema: string, prop: string) =>
      schemas[schema].properties[prop].type;
    for (const [schema, props] of [
      ['PortfolioResponse', ['userId']],
      ['PositionResponse', ['instrumentId', 'quantity', 'availableQuantity']],
      ['OrderResponse', ['id', 'userId', 'instrumentId', 'size']],
      ['InstrumentSearchResult', ['id']],
    ] as const) {
      for (const prop of props) expect(typeOf(schema, prop)).toBe('integer');
    }
    expect(typeOf('PortfolioResponse', 'totalValue')).toBe('number');
    expect(schemas.OrderResponse.properties.price.description).toContain(
      'NO_MARKET_PRICE',
    );
  });

  it('documenta el esquema de cada respuesta', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const schemaOf = (path: string, method: string, status: string) =>
      JSON.stringify(
        body.paths[path][method].responses[status].content?.['application/json']
          ?.schema,
      );
    expect(schemaOf('/users/{userId}/portfolio', 'get', '200')).toContain(
      '#/components/schemas/PortfolioResponse',
    );
    expect(schemaOf('/instruments/search', 'get', '200')).toContain(
      '#/components/schemas/InstrumentSearchPage',
    );
    expect(schemaOf('/orders', 'post', '201')).toContain(
      '#/components/schemas/OrderResponse',
    );
    expect(schemaOf('/orders/{id}/cancel', 'post', '200')).toContain(
      '#/components/schemas/OrderResponse',
    );
    expect(
      Object.keys(body.components.schemas.PositionResponse.properties),
    ).toEqual(
      expect.arrayContaining([
        'quantity',
        'availableQuantity',
        'totalReturnPercent',
        'dailyReturnPercent',
      ]),
    );
  });
});
