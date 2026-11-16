import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toMoney } from '../common/decimal';
import { MarketDataService } from '../market-data/market-data.service';
import { CASH_INSTRUMENT_TYPE } from '../orders/order.enums';
import { InstrumentSearchPage } from './dto/instrument-search.response';
import { SearchInstrumentsQuery } from './dto/search-instruments.query';
import { Instrument } from './instrument.entity';

/** Escapa los comodines de LIKE para que el término se busque literalmente. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class InstrumentsService {
  private readonly logger = new Logger(InstrumentsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly marketData: MarketDataService,
  ) {}

  async search({
    q: query,
    limit,
    offset,
  }: SearchInstrumentsQuery): Promise<InstrumentSearchPage> {
    const [instruments, total] = await this.dataSource
      .getRepository(Instrument)
      .createQueryBuilder('instrument')
      .where(
        `(instrument.ticker ILIKE :pattern ESCAPE '\\' OR instrument.name ILIKE :pattern ESCAPE '\\')`,
        {
          pattern: `%${escapeLike(query)}%`,
        },
      )
      .andWhere('instrument.type <> :cash', { cash: CASH_INSTRUMENT_TYPE })
      // El id desempata, así las páginas son estables entre pedidos.
      .orderBy('instrument.ticker', 'ASC')
      .addOrderBy('instrument.id', 'ASC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    this.logger.debug({
      msg: 'Instrument search',
      query,
      limit,
      offset,
      results: instruments.length,
      total,
    });

    const prices = await this.marketData.getLatestPrices(
      instruments.map((instrument) => instrument.id),
    );

    const items = instruments.map((instrument) => ({
      id: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      type: instrument.type,
      lastPrice: toMoney(prices.get(instrument.id)?.close ?? null),
    }));
    return { items, total, limit, offset };
  }
}
