import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ParseIdPipe } from '../common/validation';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponse } from './dto/order.response';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  IdempotencyKey,
} from './idempotency';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Siempre 201: también una orden REJECTED queda persistida con su estado. */
  @Post()
  @ApiCreatedResponse({
    type: OrderResponse,
    headers: {
      [IDEMPOTENT_REPLAYED_HEADER]: {
        description:
          'true si la respuesta es la orden ya creada con esa Idempotency-Key (reintento)',
        schema: { type: 'string', enum: ['true'] },
      },
    },
    description:
      'Orden persistida: FILLED (MARKET), NEW (LIMIT) o REJECTED (saldo/acciones insuficientes, sin precio o cantidad 0).',
  })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: false,
    description:
      'Clave única por intención de compra/venta (ej. un UUID), de 1 a 64 caracteres [A-Za-z0-9_-]. Un reintento con la misma clave y el mismo pedido devuelve la orden original con el header Idempotent-Replayed: true.',
  })
  @ApiBadRequestResponse({ description: 'Pedido mal formado' })
  @ApiNotFoundResponse({ description: 'Usuario o instrumento inexistente' })
  @ApiConflictResponse({
    description: 'Idempotency-Key ya usada con otro pedido',
  })
  async create(
    @Body() dto: CreateOrderDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderResponse> {
    const { order, replayed } = await this.orders.create(dto, idempotencyKey);
    if (replayed) {
      res.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    }
    return order;
  }

  @Post(':id/cancel')
  @ApiOkResponse({ type: OrderResponse, description: 'Orden cancelada' })
  @ApiConflictResponse({ description: 'La orden no está NEW' })
  @ApiNotFoundResponse({ description: 'Orden inexistente' })
  @HttpCode(200)
  cancel(@Param('id', ParseIdPipe) id: number): Promise<OrderResponse> {
    return this.orders.cancel(id);
  }
}
