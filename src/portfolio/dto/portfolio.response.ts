import { ApiProperty } from '@nestjs/swagger';

export class PositionResponse {
  @ApiProperty({ type: 'integer', example: 47 })
  instrumentId: number;

  @ApiProperty({ example: 'PAMP' })
  ticker: string;

  @ApiProperty({ example: 'Pampa Holding S.A.' })
  name: string;

  @ApiProperty({
    type: 'integer',
    example: 40,
    description: 'Acciones según órdenes FILLED',
  })
  quantity: number;

  @ApiProperty({
    type: 'integer',
    example: 40,
    description: 'Acciones vendibles: quantity − ventas LIMIT pendientes',
  })
  availableQuantity: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 930,
    description: 'Costo promedio ponderado',
  })
  averageCost: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 925.85,
    description: 'Último close; null si el instrumento no tiene precios',
  })
  lastPrice: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 37034,
    description: 'quantity × lastPrice',
  })
  marketValue: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: -0.45,
    description: '% contra el costo promedio ponderado',
  })
  totalReturnPercent: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.44,
    description: '% de close contra previousClose',
  })
  dailyReturnPercent: number | null;
}

export class PortfolioResponse {
  @ApiProperty({ type: 'integer', example: 1 })
  userId: number;

  @ApiProperty({
    example: 904784,
    description: 'cashBalance + valor de mercado de las posiciones',
  })
  totalValue: number;

  @ApiProperty({
    example: 753000,
    description: 'Pesos según los movimientos FILLED',
  })
  cashBalance: number;

  @ApiProperty({
    example: 125500,
    description: 'Pesos comprometidos en compras LIMIT pendientes',
  })
  reservedCash: number;

  @ApiProperty({
    example: 627500,
    description: 'Pesos disponibles para operar: cashBalance − reservedCash',
  })
  availableCash: number;

  @ApiProperty({ type: [PositionResponse] })
  positions: PositionResponse[];
}
