import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { json, urlencoded } from 'express';

/**
 * El body parser de Nest corre antes que los middlewares de los módulos, así
 * que un JSON mal formado (400) o un body enorme (413) salía sin X-Request-Id
 * y sin log. La app se crea con bodyParser: false y el parseo se registra acá,
 * en un módulo importado después de LoggingModule: corre después de pino-http.
 * Mismos parsers y límites que el default de Nest.
 */
@Module({})
export class BodyParserModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(json(), urlencoded({ extended: true })).forRoutes('*');
  }
}
