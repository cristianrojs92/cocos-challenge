import Decimal from 'decimal.js';
import { EntityManager } from 'typeorm';
import { Order } from '../orders/order.entity';
import { OrderSide, OrderStatus, OrderType } from '../orders/order.enums';

/**
 * Cálculos puros sobre las órdenes de un usuario. Son la única fuente de
 * saldos y posiciones: los usan tanto el portfolio como la validación de
 * órdenes, así nunca pueden diferir.
 */
export type LedgerOrder = Pick<
  Order,
  | 'id'
  | 'instrumentId'
  | 'side'
  | 'type'
  | 'status'
  | 'size'
  | 'price'
  | 'datetime'
>;

export interface CashSummary {
  /** Pesos según los movimientos FILLED. */
  cashBalance: Decimal;
  /** Pesos comprometidos en compras LIMIT pendientes (NEW). */
  reservedCash: Decimal;
  /** cashBalance − reservedCash. */
  availableCash: Decimal;
}

export interface Holding {
  instrumentId: number;
  /** Acciones netas según órdenes FILLED (puede ser negativa si el dataset es inconsistente). */
  quantity: number;
  /** Acciones que se pueden vender: quantity − ventas LIMIT pendientes, nunca menor a 0. */
  availableQuantity: number;
  /** Costo promedio ponderado de las acciones en cartera; null si quantity ≤ 0. */
  averageCost: Decimal | null;
}

const ZERO = new Decimal(0);
const orderAmount = (order: LedgerOrder) =>
  (order.price ?? ZERO).times(order.size);
const isNewOrderLimit = (order: LedgerOrder) =>
  order.status === OrderStatus.NEW && order.type === OrderType.LIMIT;

export function calculateCash(orders: LedgerOrder[]): CashSummary {
  let cashBalance = ZERO;
  let reservedCash = ZERO;

  for (const order of orders) {
    if (order.status === OrderStatus.FILLED) {
      switch (order.side) {
        case OrderSide.CASH_IN:
          cashBalance = cashBalance.plus(order.size);
          break;
        case OrderSide.CASH_OUT:
          cashBalance = cashBalance.minus(order.size);
          break;
        case OrderSide.BUY:
          cashBalance = cashBalance.minus(orderAmount(order));
          break;
        case OrderSide.SELL:
          cashBalance = cashBalance.plus(orderAmount(order));
          break;
      }
    } else if (isNewOrderLimit(order) && order.side === OrderSide.BUY) {
      reservedCash = reservedCash.plus(orderAmount(order));
    }
  }

  return {
    cashBalance,
    reservedCash,
    availableCash: cashBalance.minus(reservedCash),
  };
}

const chronological = (first: LedgerOrder, second: LedgerOrder) =>
  first.datetime.getTime() - second.datetime.getTime() || first.id - second.id;

export function calculateHoldings(orders: LedgerOrder[]): Map<number, Holding> {
  const states = new Map<
    number,
    { quantity: number; averageCost: Decimal | null; pendingSell: number }
  >();
  const get = (instrumentId: number) => {
    let state = states.get(instrumentId);
    if (!state) {
      state = { quantity: 0, averageCost: null, pendingSell: 0 };
      states.set(instrumentId, state);
    }
    return state;
  };

  for (const order of [...orders].sort(chronological)) {
    if (order.side !== OrderSide.BUY && order.side !== OrderSide.SELL) {
      continue;
    }

    if (order.status === OrderStatus.FILLED) {
      const state = get(order.instrumentId);
      const price = order.price ?? ZERO;
      if (order.side === OrderSide.BUY) {
        // Si no había acciones en cartera, el costo promedio es el precio de esta compra.
        state.averageCost =
          state.quantity <= 0 || state.averageCost == null
            ? price
            : state.averageCost
                .times(state.quantity)
                .plus(price.times(order.size))
                .dividedBy(state.quantity + order.size);
        state.quantity += order.size;
      } else {
        // Vender no cambia el costo promedio de lo que queda.
        state.quantity -= order.size;
        if (state.quantity <= 0) {
          state.averageCost = null;
        }
      }
    } else if (isNewOrderLimit(order) && order.side === OrderSide.SELL) {
      get(order.instrumentId).pendingSell += order.size;
    }
  }

  const holdings = new Map<number, Holding>();
  for (const [instrumentId, state] of states) {
    holdings.set(instrumentId, {
      instrumentId,
      quantity: state.quantity,
      availableQuantity: Math.max(0, state.quantity - state.pendingSell),
      averageCost: state.averageCost,
    });
  }
  return holdings;
}

/** Todas las órdenes del usuario: la entrada de calculateCash y calculateHoldings. */
export function loadLedgerOrders(
  manager: EntityManager,
  userId: number,
): Promise<Order[]> {
  return manager.getRepository(Order).find({ where: { userId } });
}
