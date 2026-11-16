import {
  ArgumentMetadata,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { registerDecorator, ValidationOptions } from 'class-validator';

/** Máximo de una columna INT de Postgres (ids y orders.size). */
export const MAX_INT = 2147483647;
/** Máximo de una columna NUMERIC(10, 2) (orders.price). */
export const MAX_MONEY = new Decimal('99999999.99');
const MIN_MONEY = new Decimal('0.01');

/**
 * Monto en ARS que entra en NUMERIC(10, 2): número finito, a lo sumo 2
 * decimales y entre 0.01 y 99999999.99. Usa Decimal para contar decimales,
 * así también funciona con notación exponencial (1e-7).
 */
export function IsMoney(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isMoney',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be a number between 0.01 and 99999999.99 with at most 2 decimals`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
          }
          const amount = new Decimal(value);
          return (
            amount.decimalPlaces() <= 2 &&
            amount.gte(MIN_MONEY) &&
            amount.lte(MAX_MONEY)
          );
        },
      },
    });
}

/** Como ParseIntPipe, pero además exige un id positivo que entre en INT. */
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const id = /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INT) {
      throw new BadRequestException(
        `${metadata.data ?? 'id'} must be an integer between 1 and ${MAX_INT}`,
      );
    }
    return id;
  }
}
