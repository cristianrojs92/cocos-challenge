import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../common/validation';
import { PortfolioResponse } from './dto/portfolio.response';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('users/:userId/portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  @ApiOkResponse({
    type: PortfolioResponse,
    description:
      'Valor total, pesos (saldo, reservado, disponible) y posiciones con rendimiento total y diario.',
  })
  @ApiNotFoundResponse({ description: 'Usuario inexistente' })
  get(
    @Param('userId', ParseIdPipe) userId: number,
  ): Promise<PortfolioResponse> {
    return this.portfolio.getPortfolio(userId);
  }
}
