import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices sobre el esquema provisto (database.sql solo tiene PKs).
 * IF NOT EXISTS para que sea idempotente también sobre la base de Neon.
 */
export class AddIndexes1763000000000 implements MigrationInterface {
  name = 'AddIndexes1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Saldos y posiciones: todas las órdenes de un usuario, filtradas por estado.
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_orders_userid_status ON orders (userid, status)',
    );
    // Órdenes por instrumento (FK sin índice).
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_orders_instrumentid ON orders (instrumentid)',
    );
    // Último precio: DISTINCT ON (instrumentid) ... ORDER BY instrumentid, date DESC.
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_marketdata_instrumentid_date ON marketdata (instrumentid, date DESC)',
    );
    // Búsqueda: ILIKE '%q%' sobre ticker o nombre. Un btree no sirve para
    // comodines al inicio; los índices trigram (pg_trgm) sí.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_instruments_ticker_trgm ON instruments USING gin (ticker gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_instruments_name_trgm ON instruments USING gin (name gin_trgm_ops)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_instruments_name_trgm');
    await queryRunner.query('DROP INDEX IF EXISTS idx_instruments_ticker_trgm');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_marketdata_instrumentid_date',
    );
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_instrumentid');
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_userid_status');
  }
}
