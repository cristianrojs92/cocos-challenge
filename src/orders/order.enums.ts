export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  NEW = 'NEW',
  FILLED = 'FILLED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Tipo de instrumento con el que se modela el cash (ARS). */
export const CASH_INSTRUMENT_TYPE = 'MONEDA';

/**
 * Por qué una orden quedó REJECTED (README, "Motivo de rechazo").
 * Las validaciones se evalúan en este orden y gana la primera que falla.
 */
export enum OrderRejectReason {
  NO_MARKET_PRICE = 'NO_MARKET_PRICE',
  AMOUNT_TOO_SMALL = 'AMOUNT_TOO_SMALL',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_SHARES = 'INSUFFICIENT_SHARES',
}
