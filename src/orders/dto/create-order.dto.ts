import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsPositive,
  Max,
  ValidateIf,
} from 'class-validator';
import { IsMoney, MAX_INT } from '../../common/validation';
import { OrderSide, OrderType } from '../order.enums';

/**
 * Los campos opcionales usan ValidateIf(!== undefined) en lugar de
 * IsOptional: así un null explícito es un 400 y no llega al servicio.
 */
const unlessAbsent = ValidateIf(
  (_dto: object, value: unknown) => value !== undefined,
);

export class CreateOrderDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(MAX_INT)
  userId: number;

  @ApiProperty({ example: 47 })
  @IsInt()
  @IsPositive()
  @Max(MAX_INT)
  instrumentId: number;

  /** CASH_IN / CASH_OUT no se operan por esta API. */
  @ApiProperty({ enum: [OrderSide.BUY, OrderSide.SELL] })
  @IsIn([OrderSide.BUY, OrderSide.SELL])
  side: OrderSide.BUY | OrderSide.SELL;

  @ApiProperty({ enum: OrderType })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiPropertyOptional({
    example: 10,
    description: 'Cantidad de acciones. Enviar size o amount, no ambos.',
  })
  @unlessAbsent
  @IsInt()
  @IsPositive()
  @Max(MAX_INT)
  size?: number;

  @ApiPropertyOptional({
    example: 10000,
    description:
      'Monto en ARS; se envía la máxima cantidad entera de acciones que cubre.',
  })
  @unlessAbsent
  @IsMoney()
  amount?: number;

  @ApiPropertyOptional({
    example: 900,
    description:
      'Precio límite en ARS. Obligatorio en LIMIT, prohibido en MARKET.',
  })
  @unlessAbsent
  @IsMoney()
  price?: number;
}
