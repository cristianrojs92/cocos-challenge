import { ApiProperty } from '@nestjs/swagger';

export class InstrumentSearchResult {
  @ApiProperty({ type: 'integer', example: 47 })
  id: number;

  @ApiProperty({ example: 'PAMP' })
  ticker: string;

  @ApiProperty({ example: 'Pampa Holding S.A.' })
  name: string;

  @ApiProperty({ example: 'ACCIONES' })
  type: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 925.85,
    description: 'Último close; null si el instrumento no tiene precios',
  })
  lastPrice: number | null;
}

export class InstrumentSearchPage {
  @ApiProperty({ type: [InstrumentSearchResult] })
  items: InstrumentSearchResult[];

  @ApiProperty({
    type: 'integer',
    example: 1,
    description: 'Cantidad total de resultados, sin paginar',
  })
  total: number;

  @ApiProperty({ type: 'integer', example: 20 })
  limit: number;

  @ApiProperty({ type: 'integer', example: 0 })
  offset: number;
}
