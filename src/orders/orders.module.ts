import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [MarketDataModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
