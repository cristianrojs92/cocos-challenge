import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager } from 'typeorm';
import { toMoney } from '../common/decimal';
import { MAX_INT } from '../common/validation';
import { Instrument } from '../instruments/instrument.entity';
import { MarketDataService } from '../market-data/market-data.service';
import {
  calculateCash,
  calculateHoldings,
  loadLedgerOrders,
} from '../portfolio/ledger';
import { User } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponse } from './dto/order.response';
import { requestHash } from './idempotency';
import { Order } from './order.entity';
import {
  CASH_INSTRUMENT_TYPE,
  OrderRejectReason,
  OrderSide,
  OrderStatus,
  OrderType,
} from './order.enums';

export const toOrderResponse = (o: Order): OrderResponse => ({
  id: o.id,
  userId: o.userId,
  instrumentId: o.instrumentId,
  side: o.side,
  type: o.type,
  size: o.size,
  price: toMoney(o.price),
  status: o.status,
  rejectReason: o.rejectReason,
  datetime: o.datetime,
});

const rejected = (rejectReason: OrderRejectReason) => ({
  status: OrderStatus.REJECTED,
  rejectReason,
});

/** Reglas que combinan campos y no se expresan con un decorador por campo. */
function assertValidShape(dto: CreateOrderDto): void {
  if ((dto.size === undefined) === (dto.amount === undefined)) {
    throw new BadRequestException('Send exactly one of size or amount');
  }
  if (dto.type === OrderType.LIMIT && dto.price === undefined) {
    throw new BadRequestException('price is required for LIMIT orders');
  }
  if (dto.type === OrderType.MARKET && dto.price !== undefined) {
    throw new BadRequestException(
      'price is not allowed for MARKET orders (the last close is used)',
    );
  }
}

/**
 * Bloquea la fila del usuario hasta el fin de la transacción: las órdenes de
 * un mismo usuario se procesan de a una, así dos órdenes simultáneas no
 * pueden validar contra el mismo saldo.
 */
export async function lockUser(
  manager: EntityManager,
  userId: number,
): Promise<void> {
  const user = await manager
    .getRepository(User)
    .createQueryBuilder('user')
    .setLock('pessimistic_write')
    .where('user.id = :userId', { userId })
    .getOne();
  if (!user) {
    throw new NotFoundException(`User ${userId} not found`);
  }
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly marketData: MarketDataService,
  ) {}

  /**
   * Con idempotencyKey, un reintento del mismo pedido devuelve la orden
   * original (replayed: true) y uno con otro pedido es un 409. La clave se
   * busca después del lock, así dos reintentos simultáneos se serializan.
   */
  async create(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<{ order: OrderResponse; replayed: boolean }> {
    assertValidShape(dto);
    const hash = idempotencyKey ? requestHash(dto) : null;

    let replayed = false;
    const order = await this.dataSource.transaction(async (manager) => {
      await lockUser(manager, dto.userId);

      if (idempotencyKey) {
        const previous = await manager
          .getRepository(Order)
          .findOneBy({ userId: dto.userId, idempotencyKey });
        if (previous) {
          if (previous.requestHash !== hash) {
            this.logger.warn({
              msg: 'Idempotency key reused with a different request',
              userId: dto.userId,
            });
            throw new ConflictException(
              'Idempotency-Key already used with a different order request',
            );
          }
          replayed = true;
          this.logger.log({
            msg: 'Idempotent replay',
            orderId: previous.id,
            userId: dto.userId,
          });
          return previous;
        }
      }

      const instrument = await manager
        .getRepository(Instrument)
        .findOneBy({ id: dto.instrumentId });
      if (!instrument) {
        throw new NotFoundException(`Instrument ${dto.instrumentId} not found`);
      }
      if (instrument.type === CASH_INSTRUMENT_TYPE) {
        throw new BadRequestException('Cash (ARS) cannot be bought or sold');
      }

      // Precio de ejecución: el límite, o el último close para MARKET.
      const price =
        dto.type === OrderType.LIMIT
          ? new Decimal(String(dto.price))
          : ((
              await this.marketData.getLatestPrices([instrument.id], manager)
            ).get(instrument.id)?.close ?? null);
      this.logger.debug({
        msg: 'Execution price resolved',
        instrumentId: instrument.id,
        type: dto.type,
        price: price?.toString() ?? null,
      });

      // Cantidad: la exacta, o la máxima cantidad entera que cubre el monto.
      const size =
        dto.size ??
        (price
          ? new Decimal(String(dto.amount)).dividedBy(price).floor().toNumber()
          : 0);
      this.logger.debug({
        msg: 'Order size resolved',
        size,
        fromAmount: dto.size === undefined,
      });

      // Un monto chico sobre un precio muy bajo puede dar más acciones de las
      // que entran en orders.size (INT): es un pedido que no se puede representar.
      if (size > MAX_INT) {
        throw new BadRequestException(
          `amount / price yields more than ${MAX_INT} shares`,
        );
      }

      const { status, rejectReason } = await this.decideStatus(
        manager,
        dto,
        price,
        size,
      );

      return manager.getRepository(Order).save(
        manager.getRepository(Order).create({
          userId: dto.userId,
          instrumentId: instrument.id,
          side: dto.side,
          type: dto.type,
          size,
          price,
          status,
          rejectReason,
          datetime: new Date(),
          idempotencyKey: idempotencyKey ?? null,
          requestHash: hash,
        }),
      );
    });

    // Después del commit: solo se loguea lo que quedó guardado.
    if (!replayed) {
      this.logger.log({
        msg: 'Order created',
        orderId: order.id,
        userId: order.userId,
        instrumentId: order.instrumentId,
        side: order.side,
        type: order.type,
        size: order.size,
        status: order.status,
        rejectReason: order.rejectReason,
      });
    }
    return { order: toOrderResponse(order), replayed };
  }

  /** Solo las órdenes NEW se pueden cancelar; cancelar libera lo reservado. */
  async cancel(orderId: number): Promise<OrderResponse> {
    const order = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Order);
      const found = await repo.findOneBy({ id: orderId });
      if (!found) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      // Mismo lock que al crear órdenes; se relee la orden ya bloqueada.
      await lockUser(manager, found.userId);
      const current = await repo.findOneByOrFail({ id: orderId });
      if (current.status !== OrderStatus.NEW) {
        this.logger.warn({
          msg: 'Order cannot be cancelled',
          orderId,
          status: current.status,
        });
        throw new ConflictException(
          `Only NEW orders can be cancelled (order ${orderId} is ${current.status})`,
        );
      }

      current.status = OrderStatus.CANCELLED;
      return repo.save(current);
    });

    this.logger.log({
      msg: 'Order cancelled',
      orderId: order.id,
      userId: order.userId,
    });
    return toOrderResponse(order);
  }

  private async decideStatus(
    manager: EntityManager,
    dto: CreateOrderDto,
    price: Decimal | null,
    size: number,
  ): Promise<{ status: OrderStatus; rejectReason: OrderRejectReason | null }> {
    // Sin precio no se puede dimensionar ni valuar la orden: se valida primero.
    if (!price) {
      return rejected(OrderRejectReason.NO_MARKET_PRICE);
    }
    if (size <= 0) {
      return rejected(OrderRejectReason.AMOUNT_TOO_SMALL);
    }

    const orders = await loadLedgerOrders(manager, dto.userId);
    // BUY: pesos necesarios contra pesos disponibles; SELL: acciones.
    const required =
      dto.side === OrderSide.BUY ? price.times(size) : new Decimal(size);
    const available =
      dto.side === OrderSide.BUY
        ? calculateCash(orders).availableCash
        : new Decimal(
            calculateHoldings(orders).get(dto.instrumentId)
              ?.availableQuantity ?? 0,
          );
    const affordable = required.lte(available);
    this.logger.debug({
      msg: 'Balance check',
      side: dto.side,
      required: required.toString(),
      available: available.toString(),
    });

    if (!affordable) {
      return rejected(
        dto.side === OrderSide.BUY
          ? OrderRejectReason.INSUFFICIENT_FUNDS
          : OrderRejectReason.INSUFFICIENT_SHARES,
      );
    }
    return {
      status:
        dto.type === OrderType.MARKET ? OrderStatus.FILLED : OrderStatus.NEW,
      rejectReason: null,
    };
  }
}
