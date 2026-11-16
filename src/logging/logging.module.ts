import { Global, Module } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule, Params } from 'nestjs-pino';
import { DestinationStream } from 'pino';
import { Options } from 'pino-http';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

/**
 * Destino de los logs. Por defecto undefined: pino escribe JSON a stdout.
 * Los tests e2e lo reemplazan con overrideProvider para leer las líneas.
 */
export const LOG_DESTINATION = Symbol('LOG_DESTINATION');

@Global()
@Module({
  providers: [{ provide: LOG_DESTINATION, useValue: undefined }],
  exports: [LOG_DESTINATION],
})
class LogDestinationModule {}

function pinoHttpOptions(prettyPrint: boolean): Options {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers['x-request-id']);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    // Las líneas de los services llevan solo el id, no el req completo
    // (menos volumen en Datadog); el req entero va en "request completed".
    quietReqLogger: true,
    // El id va como requestId en todas las líneas del request.
    customAttributeKeys: { reqId: 'requestId' },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url?.startsWith('/docs') ?? false },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    // Datadog lee el nivel como texto ("info") sin configuración extra.
    formatters: { level: (label) => ({ level: label }) },
    transport: prettyPrint ? { target: 'pino-pretty' } : undefined,
  };
}

@Module({
  imports: [
    LogDestinationModule,
    LoggerModule.forRootAsync({
      inject: [LOG_DESTINATION],
      useFactory: (destination?: DestinationStream): Params => {
        if (destination) {
          return { pinoHttp: [pinoHttpOptions(false), destination] };
        }
        return {
          pinoHttp: pinoHttpOptions(process.env.NODE_ENV !== 'production'),
        };
      },
    }),
  ],
})
export class LoggingModule {}
