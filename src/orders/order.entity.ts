import Decimal from 'decimal.js';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/decimal';
import {
  OrderRejectReason,
  OrderSide,
  OrderStatus,
  OrderType,
} from './order.enums';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid' })
  instrumentId: number;

  @Column({ name: 'userid' })
  userId: number;

  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'numeric', nullable: true, transformer: decimalTransformer })
  price: Decimal | null;

  @Column({ type: 'varchar' })
  type: OrderType;

  @Column({ type: 'varchar' })
  side: OrderSide;

  @Column({ type: 'varchar' })
  status: OrderStatus;

  @Column({ type: 'timestamp' })
  datetime: Date;

  /** Header Idempotency-Key con el que se creó; null si no vino. */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  idempotencyKey: string | null;

  /** Hash del pedido que usó esa clave (ver orders/idempotency.ts). */
  @Column({ name: 'request_hash', type: 'char', length: 64, nullable: true })
  requestHash: string | null;

  /** Por qué quedó REJECTED; null en cualquier otro estado y en el seed. */
  @Column({
    name: 'reject_reason',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  rejectReason: OrderRejectReason | null;
}
