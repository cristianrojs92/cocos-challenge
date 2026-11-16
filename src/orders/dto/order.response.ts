import { ApiProperty } from '@nestjs/swagger';
import {
  OrderRejectReason,
  OrderSide,
  OrderStatus,
  OrderType,
} from '../order.enums';

export class OrderResponse {
  @ApiProperty({ type: 'integer', example: 12 })
  id: number;

  @ApiProperty({ type: 'integer', example: 1 })
  userId: number;

  @ApiProperty({ type: 'integer', example: 47 })
  instrumentId: number;

  @ApiProperty({ enum: OrderSide, example: OrderSide.BUY })
  side: OrderSide;

  @ApiProperty({ enum: OrderType, example: OrderType.MARKET })
  type: OrderType;

  @ApiProperty({
    type: 'integer',
    example: 10,
    description: 'Cantidad de acciones',
  })
  size: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 925.85,
    description:
      'Precio de ejecución (MARKET) o límite (LIMIT); null en una MARKET sin precio de mercado (REJECTED con NO_MARKET_PRICE)',
  })
  price: number | null;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.FILLED })
  status: OrderStatus;

  // OpenAPI 3.0.3: con enum, nullable solo admite null si null está en la lista.
  // El tipo de @nestjs/swagger no lo acepta, de ahí el cast.
  @ApiProperty({
    enum: [
      ...Object.values(OrderRejectReason),
      null,
    ] as unknown as OrderRejectReason[],
    nullable: true,
    example: null,
    description:
      'Por qué quedó REJECTED; null en cualquier otro estado. La app traduce el código a un mensaje',
  })
  rejectReason: OrderRejectReason | null;

  @ApiProperty({ type: String, format: 'date-time' })
  datetime: Date;
}
