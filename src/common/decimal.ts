import Decimal from 'decimal.js';
import { ValueTransformer } from 'typeorm';

/** pg devuelve NUMERIC como string: se convierte a Decimal para no perder precisión. */
export const decimalTransformer: ValueTransformer = {
  to: (value: Decimal | null | undefined) =>
    value == null ? value : value.toString(),
  from: (value: string | null) => (value == null ? null : new Decimal(value)),
};

const round2 = (value: Decimal | null): number | null =>
  value == null
    ? null
    : value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/** Redondea un monto a 2 decimales para serializarlo. */
export const toMoney = round2;

/** Redondea un porcentaje a 2 decimales para serializarlo. */
export const toPercent = round2;
