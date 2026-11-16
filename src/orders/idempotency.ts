import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { CreateOrderDto } from './dto/create-order.dto';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

const KEY_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Header Idempotency-Key ya validado: undefined si no vino; si vino, de 1 a
 * 64 caracteres [A-Za-z0-9_-] o 400. Es un decorador propio porque
 * @Headers() de Nest no acepta pipes.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const value = ctx
      .switchToHttp()
      .getRequest<Request>()
      .header(IDEMPOTENCY_KEY_HEADER);
    if (value === undefined) {
      return undefined;
    }
    if (!KEY_FORMAT.test(value)) {
      throw new BadRequestException(
        `${IDEMPOTENCY_KEY_HEADER} must be 1 to 64 characters of [A-Za-z0-9_-]`,
      );
    }
    return value;
  },
);

/**
 * Hash del pedido, para distinguir un reintento (mismo hash) de una clave
 * reusada con otro pedido. Campos en orden fijo y null si faltan; los montos
 * ya llegan como number validados, así que 100 y 100.0 dan lo mismo.
 */
export function requestHash(dto: CreateOrderDto): string {
  const fields = [
    dto.userId,
    dto.instrumentId,
    dto.side,
    dto.type,
    dto.size ?? null,
    dto.amount ?? null,
    dto.price ?? null,
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
