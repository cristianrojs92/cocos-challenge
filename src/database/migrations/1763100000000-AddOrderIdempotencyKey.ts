import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotencia de POST /orders (README, "Idempotencia de POST /orders"):
 * la clave que mandó el cliente y el hash del pedido que la usó. Las órdenes
 * del seed quedan en NULL. La clave es única por usuario.
 */
export class AddOrderIdempotencyKey1763100000000 implements MigrationInterface {
  name = 'AddOrderIdempotencyKey1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64), ADD COLUMN IF NOT EXISTS request_hash CHAR(64)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_userid_idempotency_key ON orders (userid, idempotency_key) WHERE idempotency_key IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_orders_userid_idempotency_key',
    );
    await queryRunner.query(
      'ALTER TABLE orders DROP COLUMN IF EXISTS request_hash, DROP COLUMN IF EXISTS idempotency_key',
    );
  }
}
