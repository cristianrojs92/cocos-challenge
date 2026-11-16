import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Los logs de arranque esperan al logger de pino en vez de salir por consola.
    bufferLogs: true,
    // Si el arranque falla antes de tener pino (por ejemplo, sin base), Nest
    // vuelca esos logs con este logger: JSON de una línea, como el resto.
    logger: new ConsoleLogger({ json: true, colors: false }),
    // El body se parsea después de pino-http: ver logging/body-parser.module.ts.
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  // Con SIGTERM (docker compose stop, Ctrl+C) cierra el servidor y la conexión a la base.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
