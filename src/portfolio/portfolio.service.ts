import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, In } from 'typeorm';
import { toMoney, toPercent } from '../common/decimal';
import { Instrument } from '../instruments/instrument.entity';
import { MarketDataService } from '../market-data/market-data.service';
import { User } from '../users/user.entity';
import { PortfolioResponse, PositionResponse } from './dto/portfolio.response';
import { calculateCash, calculateHoldings, loadLedgerOrders } from './ledger';

const percentChange = (from: Decimal | null, to: Decimal | null) =>
  from == null || to == null || from.isZero()
    ? null
    : to.minus(from).dividedBy(from).times(100);

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly marketData: MarketDataService,
  ) {}

  async getPortfolio(userId: number): Promise<PortfolioResponse> {
    const manager = this.dataSource.manager;
    const user = await manager.getRepository(User).findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const orders = await loadLedgerOrders(manager, userId);
    const cash = calculateCash(orders);
    // Solo las posiciones abiertas: se descartan las cerradas y las sobrevendidas.
    const holdings = [...calculateHoldings(orders).values()].filter(
      (holding) => holding.quantity > 0,
    );

    const instrumentIds = holdings.map((holding) => holding.instrumentId);
    const [instruments, prices] = await Promise.all([
      instrumentIds.length
        ? manager.getRepository(Instrument).findBy({ id: In(instrumentIds) })
        : Promise.resolve([]),
      this.marketData.getLatestPrices(instrumentIds),
    ]);
    const instrumentById = new Map(
      instruments.map((instrument) => [instrument.id, instrument]),
    );

    let positionsValue = new Decimal(0);
    const positions = holdings.map((holding): PositionResponse => {
      const instrument = instrumentById.get(holding.instrumentId)!;
      // Sin marketdata no hay valor ni rendimientos: quedan en null.
      const price = prices.get(holding.instrumentId);
      const close = price?.close ?? null;
      const marketValue = close?.times(holding.quantity) ?? null;
      if (marketValue) {
        positionsValue = positionsValue.plus(marketValue);
      }
      return {
        instrumentId: holding.instrumentId,
        ticker: instrument.ticker,
        name: instrument.name,
        quantity: holding.quantity,
        availableQuantity: holding.availableQuantity,
        averageCost: toMoney(holding.averageCost),
        lastPrice: toMoney(close),
        marketValue: toMoney(marketValue),
        // Contra el costo promedio ponderado de las acciones en cartera.
        totalReturnPercent: toPercent(
          percentChange(holding.averageCost, close),
        ),
        dailyReturnPercent: toPercent(
          percentChange(price?.previousClose ?? null, close),
        ),
      };
    });
    positions.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const portfolio: PortfolioResponse = {
      userId,
      totalValue: toMoney(cash.cashBalance.plus(positionsValue))!,
      cashBalance: toMoney(cash.cashBalance)!,
      reservedCash: toMoney(cash.reservedCash)!,
      availableCash: toMoney(cash.availableCash)!,
      positions,
    };
    this.logger.debug({
      msg: 'Portfolio computed',
      userId,
      positions: positions.length,
      totalValue: portfolio.totalValue,
    });
    return portfolio;
  }
}
