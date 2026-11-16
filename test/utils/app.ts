import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { Writable } from 'node:stream';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { LOG_DESTINATION } from '../../src/logging/logging.module';

/** logDestination: recibe las líneas JSON del logger, para tests que leen los logs. */
export async function createTestApp(
  options: { logDestination?: Writable } = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(LOG_DESTINATION)
    .useValue(options.logDestination)
    .compile();
  const app = moduleRef.createNestApplication({
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  return app;
}
