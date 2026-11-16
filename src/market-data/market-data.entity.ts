import Decimal from 'decimal.js';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/decimal';

const money = {
  type: 'numeric' as const,
  nullable: true,
  transformer: decimalTransformer,
};

@Entity({ name: 'marketdata' })
export class MarketData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid' })
  instrumentId: number;

  @Column(money)
  high: Decimal | null;

  @Column(money)
  low: Decimal | null;

  @Column(money)
  open: Decimal | null;

  @Column(money)
  close: Decimal | null;

  @Column({ ...money, name: 'previousclose' })
  previousClose: Decimal | null;

  @Column({ type: 'date' })
  date: string;
}
