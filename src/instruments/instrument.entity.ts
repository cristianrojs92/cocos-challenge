import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticker: string;

  @Column()
  name: string;

  @Column()
  type: string;
}
