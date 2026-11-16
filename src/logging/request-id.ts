import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Mismo formato que Idempotency-Key: evita reflejar texto arbitrario en logs y headers. */
const REQUEST_ID_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Id del request: el X-Request-Id que mandó el cliente o un gateway si es
 * válido, así el mismo id sigue el pedido entre servicios; si no, uno nuevo.
 */
export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && REQUEST_ID_FORMAT.test(incoming)
    ? incoming
    : randomUUID();
}
