import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager } from 'typeorm';

export interface LatestPrice {
  /** Último precio del instrumento. */
  close: Decimal;
  /** Cierre del día anterior, para el retorno diario. */
  previousClose: Decimal | null;
}

@Injectable()
export class MarketDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Último precio de cada instrumento: la fila de marketdata con la fecha más
   * reciente. Los instrumentos sin datos (o con close nulo) no aparecen en el mapa.
   */
  async getLatestPrices(
    instrumentIds: number[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<number, LatestPrice>> {
    const prices = new Map<number, LatestPrice>();
    if (instrumentIds.length === 0) {
      return prices;
    }

    const rows: {
      instrumentid: number;
      close: string | null;
      previousclose: string | null;
    }[] = await manager.query(
      `SELECT DISTINCT ON (instrumentid) instrumentid, close, previousclose
         FROM marketdata
        WHERE instrumentid = ANY($1)
        ORDER BY instrumentid, date DESC`,
      [instrumentIds],
    );

    for (const row of rows) {
      if (row.close == null) {
        continue;
      }
      prices.set(row.instrumentid, {
        close: new Decimal(row.close),
        previousClose:
          row.previousclose == null ? null : new Decimal(row.previousclose),
      });
    }
    return prices;
  }
}
