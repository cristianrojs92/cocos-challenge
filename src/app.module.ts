import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  buildTypeOrmOptions,
  DEFAULT_DATABASE_URL,
} from './database/typeorm.options';
import { InstrumentsModule } from './instruments/instruments.module';
import { BodyParserModule } from './logging/body-parser.module';
import { LoggingModule } from './logging/logging.module';
import { OrdersModule } from './orders/orders.module';
import { PortfolioModule } from './portfolio/portfolio.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    // Después de LoggingModule: ver body-parser.module.ts.
    BodyParserModule,
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildTypeOrmOptions(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    }),
    InstrumentsModule,
    PortfolioModule,
    OrdersModule,
  ],
})
export class AppModule {}
