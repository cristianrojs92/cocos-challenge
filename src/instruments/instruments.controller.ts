import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SearchInstrumentsQuery } from './dto/search-instruments.query';
import { InstrumentSearchPage } from './dto/instrument-search.response';
import { InstrumentsService } from './instruments.service';

@ApiTags('instruments')
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get('search')
  @ApiOkResponse({
    type: InstrumentSearchPage,
    description:
      'Una página de activos por ticker o nombre, con su último precio y el total de resultados.',
  })
  search(
    @Query() query: SearchInstrumentsQuery,
  ): Promise<InstrumentSearchPage> {
    return this.instruments.search(query);
  }
}
