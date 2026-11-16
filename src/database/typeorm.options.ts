import { DataSourceOptions } from 'typeorm';
import { Instrument } from '../instruments/instrument.entity';
import { MarketData } from '../market-data/market-data.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { AddIndexes1763000000000 } from './migrations/1763000000000-AddIndexes';
import { AddOrderIdempotencyKey1763100000000 } from './migrations/1763100000000-AddOrderIdempotencyKey';
import { AddOrderRejectReason1763200000000 } from './migrations/1763200000000-AddOrderRejectReason';

export const DEFAULT_DATABASE_URL =
  'postgres://cocos:cocos@localhost:5432/cocos';

export function buildTypeOrmOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [User, Instrument, MarketData, Order],
    // El esquema lo define database.sql; TypeORM nunca lo modifica por su cuenta.
    synchronize: false,
    migrations: [
      AddIndexes1763000000000,
      AddOrderIdempotencyKey1763100000000,
      AddOrderRejectReason1763200000000,
    ],
    migrationsRun: process.env.DB_RUN_MIGRATIONS !== 'false',
  };
}
