import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motivo de rechazo de las órdenes (README, "Motivo de rechazo"):
 * el código de OrderRejectReason, solo en las órdenes REJECTED. Las órdenes del
 * seed quedan en NULL. Sin CHECK, como status: el enum se valida en el código.
 */
export class AddOrderRejectReason1763200000000 implements MigrationInterface {
  name = 'AddOrderRejectReason1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(32)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE orders DROP COLUMN IF EXISTS reject_reason',
    );
  }
}
