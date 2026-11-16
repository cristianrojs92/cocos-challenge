import Decimal from 'decimal.js';
import { OrderSide, OrderStatus, OrderType } from '../orders/order.enums';
import { calculateCash, calculateHoldings, LedgerOrder } from './ledger';

const { BUY, SELL, CASH_IN, CASH_OUT } = OrderSide;
const { MARKET, LIMIT } = OrderType;
const { NEW, FILLED, REJECTED, CANCELLED } = OrderStatus;

let nextId = 1;
const o = (
  instrumentId: number,
  side: OrderSide,
  size: number,
  price: number,
  status: OrderStatus,
  type: OrderType,
  datetime: string,
  id = nextId++,
): LedgerOrder => ({
  id,
  instrumentId,
  side,
  size,
  price: new Decimal(price),
  status,
  type,
  datetime: new Date(datetime),
});

// Las 11 órdenes del usuario 1 en database.sql (ids 1–11 en orden de inserción).
const seedOrders: LedgerOrder[] = [
  o(66, CASH_IN, 1000000, 1, FILLED, MARKET, '2023-07-12T12:11:20', 1),
  o(47, BUY, 50, 930, FILLED, MARKET, '2023-07-12T12:31:20', 2),
  o(47, BUY, 50, 920, CANCELLED, LIMIT, '2023-07-12T14:21:20', 3),
  o(47, SELL, 10, 940, FILLED, MARKET, '2023-07-12T14:51:20', 4),
  o(45, BUY, 50, 710, NEW, LIMIT, '2023-07-12T15:14:20', 5),
  o(47, SELL, 100, 950, REJECTED, MARKET, '2023-07-12T16:11:20', 6),
  o(31, BUY, 60, 1500, NEW, LIMIT, '2023-07-13T11:13:20', 7),
  o(66, CASH_OUT, 100000, 1, FILLED, MARKET, '2023-07-13T12:31:20', 8),
  o(31, BUY, 20, 1540, FILLED, LIMIT, '2023-07-13T12:51:20', 9),
  o(54, BUY, 500, 250, FILLED, MARKET, '2023-07-13T14:11:20', 10),
  o(31, SELL, 30, 1530, FILLED, MARKET, '2023-07-13T15:13:20', 11),
];

describe('calculateCash', () => {
  it('pesos del seed', () => {
    const c = calculateCash(seedOrders);
    expect(c.cashBalance.toString()).toBe('753000');
    expect(c.reservedCash.toString()).toBe('125500');
    expect(c.availableCash.toString()).toBe('627500');
  });

  it('ignora REJECTED y CANCELLED', () => {
    const c = calculateCash([
      o(66, CASH_IN, 1000, 1, FILLED, MARKET, '2023-01-01T10:00:00'),
      o(66, CASH_IN, 500, 1, REJECTED, MARKET, '2023-01-01T10:01:00'),
      o(1, BUY, 1, 100, CANCELLED, LIMIT, '2023-01-01T10:02:00'),
      o(1, BUY, 1, 100, REJECTED, MARKET, '2023-01-01T10:03:00'),
    ]);
    expect(c.cashBalance.toString()).toBe('1000');
    expect(c.reservedCash.toString()).toBe('0');
  });
});

describe('calculateHoldings', () => {
  it('posiciones del seed', () => {
    const h = calculateHoldings(seedOrders);
    expect(h.get(47)).toMatchObject({ quantity: 40, availableQuantity: 40 });
    expect(h.get(47)!.averageCost!.toString()).toBe('930');
    expect(h.get(54)).toMatchObject({ quantity: 500, availableQuantity: 500 });
    expect(h.get(54)!.averageCost!.toString()).toBe('250');
    expect(h.get(31)).toMatchObject({ quantity: -10, availableQuantity: 0 });
    expect(h.has(45)).toBe(false);
    expect(h.has(66)).toBe(false);
  });

  it('promedio ponderado: BUY 10@100, BUY 10@200 → 150; SELL 5 no cambia el promedio', () => {
    const h = calculateHoldings([
      o(1, BUY, 10, 100, FILLED, MARKET, '2023-01-01T10:00:00'),
      o(1, BUY, 10, 200, FILLED, MARKET, '2023-01-01T11:00:00'),
      o(1, SELL, 5, 500, FILLED, MARKET, '2023-01-01T12:00:00'),
    ]);
    expect(h.get(1)!.quantity).toBe(15);
    expect(h.get(1)!.averageCost!.toString()).toBe('150');
  });

  it('se reinicia al quedar en 0: BUY 10@100, SELL 10, BUY 10@300 → 300', () => {
    const h = calculateHoldings([
      o(1, BUY, 10, 100, FILLED, MARKET, '2023-01-01T10:00:00'),
      o(1, SELL, 10, 120, FILLED, MARKET, '2023-01-01T11:00:00'),
      o(1, BUY, 10, 300, FILLED, MARKET, '2023-01-01T12:00:00'),
    ]);
    expect(h.get(1)!.quantity).toBe(10);
    expect(h.get(1)!.averageCost!.toString()).toBe('300');
  });

  it('SELL LIMIT NEW reduce availableQuantity: qty 40, SELL NEW 30 → 10', () => {
    const h = calculateHoldings([
      o(1, BUY, 40, 100, FILLED, MARKET, '2023-01-01T10:00:00'),
      o(1, SELL, 30, 150, NEW, LIMIT, '2023-01-01T11:00:00'),
    ]);
    expect(h.get(1)).toMatchObject({ quantity: 40, availableQuantity: 10 });
  });

  it('ignora REJECTED y CANCELLED', () => {
    const h = calculateHoldings([
      o(1, BUY, 10, 100, FILLED, MARKET, '2023-01-01T10:00:00'),
      o(1, BUY, 10, 999, REJECTED, MARKET, '2023-01-01T11:00:00'),
      o(1, SELL, 5, 999, CANCELLED, LIMIT, '2023-01-01T12:00:00'),
    ]);
    expect(h.get(1)).toMatchObject({ quantity: 10, availableQuantity: 10 });
    expect(h.get(1)!.averageCost!.toString()).toBe('100');
  });

  it('el resultado no depende del orden de entrada del array', () => {
    const shuffled = [...seedOrders].reverse();
    const a = calculateHoldings(seedOrders);
    const b = calculateHoldings(shuffled);
    expect(b.get(47)!.averageCost!.toString()).toBe(
      a.get(47)!.averageCost!.toString(),
    );
    // con el orden invertido, la SELL de 31 vendría antes de la BUY: el resultado tiene que ser el mismo
    expect(b.get(31)).toEqual(a.get(31));
  });
});
