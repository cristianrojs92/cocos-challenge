# Cocos challenge — API de backend

API REST en NestJS 12 + TypeScript 6 + TypeORM sobre PostgreSQL para el [challenge de backend](backend-challenge.md). Expone cuatro endpoints:

- **Portfolio** de un usuario.
- **Búsqueda de activos.**
- **Envío de órdenes** MARKET/LIMIT, por cantidad o por monto en pesos.
- **Cancelación de órdenes** (extra).

Las decisiones de diseño, con su porqué, están en [Decisiones principales](#decisiones-principales).

## Cómo correrlo

Requisito: Docker.

```bash
docker compose up --build
```

Este comando:
- levanta Postgres;
- carga `database.sql` sin modificaciones;
- aplica las migraciones: índices, columnas de idempotencia y motivo de rechazo (ver [Migraciones](#migraciones));
- inicia la API en <http://localhost:3000>.

La documentación Swagger queda en <http://localhost:3000/docs>, y en [`insomnia.json`](insomnia.json) hay una colección de Insomnia con un ejemplo por caso (en Insomnia: *Import → From File*). La URL base es la variable `base_url` del entorno.

```bash
curl localhost:3000/users/1/portfolio
```

Si el puerto 5432 o el 3000 ya está ocupado: `DB_PORT=5434 API_PORT=3001 docker compose up --build`.

### Desarrollo local

Requiere **Node 24.15+** (`.nvmrc`).

```bash
npm install
cp .env.example .env
docker compose up -d db     # solo la base
npm run start:dev
```

Nest 12 se publica solo como ESM. La app es CommonJS y lo carga con `require(esm)` de Node. Jest también puede hacerlo, pero solo desde Node 24.9 y con `--experimental-vm-modules`. Por eso los scripts de test lo pasan explícitamente y `engines` exige Node 24. La CLI de Nest 12 pide 24.15+.

### Migraciones

**La API necesita sus migraciones para funcionar.** Agregan índices y, en `orders`, las columnas `idempotency_key`, `request_hash` y `reject_reason` (ver [Cambios de esquema](#cambios-de-esquema)). Sin esas columnas, la API no puede leer ni escribir órdenes.

- **Con Docker o en desarrollo local no hay que hacer nada:** la API las aplica sola al arrancar.
- Son aditivas y usan `IF NOT EXISTS`: no borran ni modifican datos, y se pueden correr más de una vez. TypeORM registra las aplicadas en la tabla `migrations`.
- Para aplicarlas a mano, revisando antes a qué base apuntan, usar `DB_RUN_MIGRATIONS=false` y estos comandos. Toman `DATABASE_URL` de `.env` y muestran la base antes de hacer nada:

```bash
npm run migration:show   # lista las migraciones y cuáles ya se aplicaron
npm run migration:run    # aplica las pendientes
```

### Usar la base de Neon provista por Cocos

El proyecto **no usa ni modifica la base de Neon**: todo lo anterior corre contra el Postgres local de Docker, cargado con el mismo `database.sql`.

Para usarla, poner `DATABASE_URL=<url de Neon>` en `.env` (no se commitea). Tener en cuenta que, al arrancar, la API aplica las [migraciones](#migraciones) sobre esa base. Para decidir cuándo aplicarlas, arrancar con `DB_RUN_MIGRATIONS=false` y correr `npm run migration:run` antes de usarla.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/users/:userId/portfolio` | Valor total, pesos (saldo, reservado, disponible) y posiciones con cantidad, valor, costo promedio, rendimiento total y diario |
| GET | `/instruments/search?q=&limit=&offset=` | Activos por ticker o nombre (parcial), con último precio, paginados: `{ items, total, limit, offset }`. `limit` va de 1 a 50 (por defecto 20) y `offset` es ≥ 0 (por defecto 0) |
| POST | `/orders` | `{ userId, instrumentId, side: BUY\|SELL, type: MARKET\|LIMIT, size \| amount, price? }` y header opcional `Idempotency-Key`. Devuelve 201 con la orden persistida (`FILLED`, `NEW` o `REJECTED`, con su `rejectReason`). Con una clave ya usada: la orden original (en su estado actual) si el pedido es el mismo, o 409 si es otro |
| POST | `/orders/:id/cancel` | Cancela una orden `NEW` (200). Si no está `NEW`, 409 |

Todas las respuestas, incluidos los errores, llevan el header `X-Request-Id` (ver [Logs](#logs)).

## Tests

Los tests e2e usan la base `cocos_test` (`TEST_DATABASE_URL`), que se borra y recarga desde `database.sql` antes de cada test. Nunca corren contra la base de desarrollo ni contra Neon. `docker compose up -d db` crea esa base automáticamente.

```bash
npm test                                   # unitarios (ledger)
npm run test:e2e                           # funcionales contra Postgres
npm run test:e2e -- orders                 # un archivo
npm run test:e2e -- -t "concurrencia"      # un test por nombre
npm test -- src/portfolio/ledger.spec.ts   # un archivo unitario
```

El test funcional pedido (envío de órdenes) está en [`test/orders.e2e-spec.ts`](test/orders.e2e-spec.ts). Cubre:
- MARKET y LIMIT;
- órdenes por monto;
- rechazos por pesos o acciones insuficientes;
- reserva de LIMIT pendientes;
- validaciones;
- concurrencia: 10 órdenes en paralelo que solo alcanzan para 6.

Los extras tienen sus propios archivos: [`idempotency`](test/idempotency.e2e-spec.ts), [`reject-reason`](test/reject-reason.e2e-spec.ts), [`cancel`](test/cancel.e2e-spec.ts) y [`logging`](test/logging.e2e-spec.ts).

## Decisiones principales

- **Todo se deriva de `orders`.** No hay tabla de posiciones ni de saldos. Las funciones puras de [`src/portfolio/ledger.ts`](src/portfolio/ledger.ts) calculan pesos y posiciones, y las usan tanto el portfolio como la validación de órdenes, así nunca pueden diferir.
- **Las órdenes LIMIT pendientes reservan saldo.** Una compra `NEW` descuenta pesos del disponible, y una venta `NEW` descuenta acciones. Es lo que hace un broker real y evita comprometer dos veces el mismo saldo. Cancelar libera la reserva. El valor total incluye lo reservado, porque sigue siendo del usuario.
- **Rendimiento total y diario.** El enunciado pide "rendimiento total" pero solo da la fórmula del diario (`close` vs `previousClose`). Se devuelven ambos:
  - `totalReturnPercent`: contra el costo promedio ponderado, recorriendo las órdenes en orden cronológico. Vender no cambia el promedio, y si la posición llega a 0, el costo se reinicia.
  - `dailyReturnPercent`: `close` contra `previousClose`.
- **Concurrencia.** Cada orden se procesa en una transacción que primero bloquea la fila del usuario (`SELECT … FOR UPDATE`). Las órdenes de un mismo usuario se serializan y las de usuarios distintos no se bloquean entre sí. El test de concurrencia falla si se quita el lock.
- **Error de pedido contra rechazo de mercado.** Un pedido mal formado devuelve 400 y no se guarda. Ejemplos: LIMIT sin precio, MARKET con precio, `size` y `amount` juntos, operar el instrumento ARS o campos extra como `status`. Una orden válida que no se puede ejecutar se guarda como `REJECTED` y devuelve 201. Eso pasa cuando no alcanzan los pesos o las acciones, cuando el instrumento no tiene precio o cuando el monto no alcanza para 1 acción.
- **Montos exactos.** Todo se calcula con `decimal.js`, nunca con `number`. Se redondea a 2 decimales solo al responder.
- **Búsqueda paginada con `limit` y `offset`.** Sin paginación, una búsqueda amplia (por ejemplo `q=a`, que matchea 59 activos) se cortaba en 20 sin avisar. Ahora la respuesta trae `total`, así el cliente sabe cuántos hay y puede pedir la página siguiente. Se ordena por `ticker` y desempata por `id`, para que las páginas no repitan ni salteen resultados. Se eligió offset y no cursor porque el catálogo de instrumentos es chico y casi no cambia: el costo conocido del offset (saltos si se insertan filas entre una página y otra, y lentitud con offsets muy grandes) acá no aplica, y es más simple de usar y de leer. `limit` tiene un máximo de 50 para que un pedido no pueda traer el catálogo entero.
- **Fuera de alcance:** no se simula el mercado (las LIMIT quedan `NEW` hasta cancelarse), no hay autenticación (el usuario va en la ruta o el body) y `CASH_IN`/`CASH_OUT` no se exponen.

### Extras

- **Cancelación de órdenes.** El enunciado define `CANCELLED` "por el usuario" y "solo se cancelan órdenes NEW", pero no lista un endpoint. Se agrega `POST /orders/:id/cancel` para que esa regla se pueda ejercitar. Usa el mismo lock que el envío de órdenes.
- **Motivo de rechazo.** Toda orden `REJECTED` trae un código en `rejectReason` para que la app muestre su propio mensaje (en cualquier otro estado es `null`):
  - `NO_MARKET_PRICE`: orden MARKET sobre un instrumento sin precio.
  - `AMOUNT_TOO_SMALL`: el monto no alcanza para 1 acción.
  - `INSUFFICIENT_FUNDS`: compra por encima de los pesos disponibles.
  - `INSUFFICIENT_SHARES`: venta por encima de las acciones disponibles.

  Se evalúan en ese orden y gana el primero que falla. Es un código y no un mensaje para que la app lo traduzca y redacte sin tocar el backend. Se guarda en la orden para que un reintento idempotente devuelva el mismo motivo. Las órdenes `REJECTED` del seed quedan con `null`, porque no se sabe por qué se rechazaron.
- **Idempotencia de `POST /orders`.** Un reintento por un corte de red no debe duplicar una compra. El cliente puede mandar `Idempotency-Key` (por ejemplo, un UUID por cada clic en "Comprar").
  - Misma clave y mismo pedido: devuelve la orden original, en su estado actual (si se canceló, viene `CANCELLED`), con `Idempotent-Replayed: true`. No crea otra ni vuelve a validar saldo.
  - Misma clave con otro pedido: 409. Se detecta comparando un SHA-256 del pedido guardado junto con la clave, que también distingue órdenes por monto (la tabla guarda el `size` calculado, no el `amount`).
  - La clave es única por usuario y se busca después del lock del usuario, así dos reintentos simultáneos crean una sola orden.
  - Costo aceptado: si el cliente usa la misma clave para dos compras idénticas que sí quería hacer, la segunda devuelve la primera. Ningún servidor puede distinguir eso de un reintento, y faltar una compra es más barato que duplicarla.
- **Logs con `nestjs-pino`.** Es la integración estándar de pino con Nest: loguea cada request, propaga el id del request con `AsyncLocalStorage` sin pasarlo por parámetro y los services siguen usando el `Logger` de Nest. Un logger propio sobre el `ConsoleLogger` de Nest serían unas 100 líneas de infraestructura para mantener, más lento y con un JSON que Datadog no reconoce de entrada. Detalle en [Logs](#logs).

## Cambios de esquema

`database.sql` no se modifica. Los cambios van en migraciones de TypeORM.

La migración [`AddIndexes`](src/database/migrations/1763000000000-AddIndexes.ts) agrega índices, porque el esquema original solo tiene PKs:

| Índice | Para qué |
|---|---|
| `orders(userid, status)` | Cálculo de saldos y posiciones de un usuario |
| `orders(instrumentid)` | FK sin índice |
| `marketdata(instrumentid, date DESC)` | Último precio por instrumento (`DISTINCT ON`) |
| `instruments` GIN trigram (`pg_trgm`) sobre `ticker` y `name` | Búsqueda `ILIKE '%q%'`: un btree no sirve con comodín al inicio |

La migración [`AddOrderIdempotencyKey`](src/database/migrations/1763100000000-AddOrderIdempotencyKey.ts) agrega lo necesario para la idempotencia de `POST /orders`. El `id` de las órdenes no cambia:

| Cambio | Para qué |
|---|---|
| `orders.idempotency_key VARCHAR(64) NULL` | La clave que mandó el cliente. Las órdenes del seed quedan en `NULL` |
| `orders.request_hash CHAR(64) NULL` | SHA-256 del pedido, para distinguir un reintento de una clave reusada con otro pedido |
| Índice único parcial `orders(userid, idempotency_key) WHERE idempotency_key IS NOT NULL` | Una clave por usuario. Defensa en profundidad: el lock del usuario ya evita duplicados, el índice los impide aunque ese lock se quitara |

La migración [`AddOrderRejectReason`](src/database/migrations/1763200000000-AddOrderRejectReason.ts) agrega `orders.reject_reason VARCHAR(32) NULL`, el código de por qué una orden quedó `REJECTED`. Las órdenes del seed quedan en `NULL`. No lleva `CHECK`, igual que `status`: los valores los valida el código.

## Hallazgos en los datos

- **El instrumento 31 está sobrevendido para el usuario 1.** Compró 20 y vendió 30, ambas `FILLED`, así que queda en −10.
  - No se lista como posición y no se pueden vender más acciones de ese instrumento.
  - El efecto en pesos de esas órdenes sí se cuenta.
- **Los instrumentos 3 y 10 no tienen `marketdata`.** Una orden MARKET sobre ellos queda `REJECTED`. Una posición en ellos mostraría precio, valor y rendimientos en `null` y no sumaría al total.
- Las columnas se crearon sin comillas, así que Postgres las guarda en minúscula (`instrumentid`, `previousclose`). `marketdata` tiene `date` y no `datetime`, como dice el enunciado.

## Logs

La API escribe logs JSON, una línea por evento, pensados para Datadog. Los mensajes están en inglés y los datos van en campos (`orderId`, `userId`, `status`…), no dentro del texto, así se puede filtrar y armar alertas.

- **Id de request.** Cada línea lleva `requestId`. En Datadog, `@requestId:<id>` muestra todo el recorrido de un pedido. Si el pedido trae `X-Request-Id` con el formato `[A-Za-z0-9_-]{1,64}` (por ejemplo, de la app o de un gateway), se reutiliza; si no, se genera un UUID. Se devuelve siempre en el header `X-Request-Id`, así soporte puede pedírselo a la app y encontrar el caso.
- **Nivel.** `LOG_LEVEL` (por defecto `info`). Con `debug` se ven los datos intermedios de cada decisión. Ejemplo: `LOG_LEVEL=debug docker compose up --build`.
- **Cada request**, incluso uno con JSON mal formado, deja una línea `request completed` con método, ruta, status y duración: `info` si salió bien, `warn` si es un 4xx, `error` si es un 5xx. Swagger (`/docs`) no se loguea. Las líneas de los services llevan solo el `requestId`; el request completo va una sola vez, en `request completed`, para no multiplicar el volumen.
- **Eventos:**

  | Nivel | Mensaje | Campos |
  |---|---|---|
  | info | `Order created` | `orderId`, `userId`, `instrumentId`, `side`, `type`, `size`, `status`, `rejectReason` |
  | info | `Idempotent replay` | `orderId`, `userId` |
  | warn | `Idempotency key reused with a different request` | `userId` |
  | info | `Order cancelled` | `orderId`, `userId` |
  | warn | `Order cannot be cancelled` | `orderId`, `status` |
  | debug | `Execution price resolved` | `instrumentId`, `type`, `price` |
  | debug | `Order size resolved` | `size`, `fromAmount` |
  | debug | `Balance check` | `side`, `required`, `available` |
  | debug | `Portfolio computed` | `userId`, `positions`, `totalValue` |
  | debug | `Instrument search` | `query`, `results` |

- **Lo que no se loguea:** el email y el número de cuenta de los usuarios, la `DATABASE_URL` y los headers `Authorization` y `Cookie` (redactados).
- **Si el arranque falla** (por ejemplo, la base no responde), los logs del arranque también salen en JSON de una línea.
- **En desarrollo** (`npm run start:dev`, sin `NODE_ENV=production`) los logs se ven legibles con `pino-pretty`. En Docker salen en JSON.
- **En los tests** el logger está en silencio, salvo en `test/logging.e2e-spec.ts`, que lee las líneas para verificarlas.

## Mejoras posibles

- **Tabla `positions` o snapshots de saldo** si el historial de órdenes creciera mucho. Hoy se recalcula todo por request, que para este volumen es lo más simple y siempre consistente.
- **Constraints `CHECK`** sobre `side`, `type` y `status`, y FKs de `marketdata` con índice único `(instrumentid, date)`.
- **Ejecución de órdenes LIMIT** cuando el precio de mercado las cruza. Hoy no se simula el mercado.
- **Vencimiento de las claves de idempotencia** (por ejemplo, 24 h, como Stripe), para acotar cuánto tiempo afecta un bug de clave repetida en el cliente.
- **Trazas por función con el APM de Datadog** (`dd-trace`), en lugar de logs de entrada y salida escritos a mano.
