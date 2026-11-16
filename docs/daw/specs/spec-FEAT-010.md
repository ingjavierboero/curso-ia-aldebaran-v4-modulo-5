# Spec FEAT-010: Clientes y productos

| Field | Value |
|-------|-------|
| Ticket | FEAT-010 |
| PRD | docs/daw/prd/prd-FEAT-010.md |
| Tier | FEATURE |
| Date | 2026-11-16 |
| Spec loops | 2 |
| Loops since last human decision | 2 |

## Summary
Dos agregados nuevos en el dominio, `Client` y `Product`, con value objects `Cuit` (11 dígitos, prefijo
válido y dígito verificador módulo 11), `IvaCondition` (códigos de Factura C) y `Price` (centavos
enteros + moneda ARS/USD). Las asignaciones viven en `client_products`. La unicidad (CUIT, email de
facturación, nombre de producto normalizado, asignación) se garantiza con restricciones UNIQUE en
SQLite y un control previo dentro de la Unit of Work IMMEDIATE (ADR-003). Casos de uso con permisos
`clients.*` y `products.*` (Admin y Editor gestionan; los tres perfiles leen), rutas REST bajo
`/api/clients` y `/api/products`, y tres pantallas web. El precio viaja siempre como texto decimal.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 3, Block 4, Block 5 |
| FR-02 | Block 1, Block 3, Block 4, Block 5 |
| FR-03 | Block 1, Block 3, Block 4, Block 5 |
| FR-04 | Block 1, Block 4, Block 5 |
| FR-05 | Block 1, Block 4 |
| FR-06 | Block 2, Block 3, Block 4 |
| FR-07 | Block 2, Block 3, Block 4 |
| FR-08 | Block 1, Block 3, Block 4, Block 5 |
| FR-09 | Block 1, Block 3, Block 4, Block 5 |
| FR-10 | Block 1, Block 4 |
| FR-11 | Block 1, Block 2, Block 3, Block 4 |
| FR-12 | Block 1, Block 3, Block 4, Block 5 |
| FR-13 | Block 2, Block 3, Block 4, Block 5 |
| FR-14 | Block 3, Block 4 |
| FR-15 | Block 2, Block 3, Block 4, Block 5 |
| FR-16 | Block 3, Block 4, Block 5 |
| FR-17 | Block 3, Block 4, Block 5 |
| FR-18 | Block 3, Block 4, Block 5 |
| FR-19 | Block 1, Block 3, Block 4, Block 5 |
| NFR-01 | Strategy: UNIQUE en `clients.cuit`, `clients.billing_email`, `products.name_normalized` y PK de `client_products`; control previo dentro de `uow.run` IMMEDIATE; la violación de la restricción se traduce a error de dominio (409); tests de repositorio que fuerzan el duplicado sobre SQLite real y test HTTP de altas simultáneas; Block 2, Block 3, Block 4 |
| NFR-02 | Strategy: listados con una sola consulta ordenada (sin N+1), índice implícito de los UNIQUE y de la PK; test con 1000 clientes y 1000 productos que mide < 500 ms; Block 4 |
| NFR-03 | Strategy: `Price` en centavos enteros (`INTEGER`), entrada y salida como texto decimal con gramática fija, sin floats en server, JSON ni web; tests de ida y vuelta 0.01, 15000.50 y 999999999.99; Block 1, Block 2, Block 4, Block 5 |

| Acceptance criterion | Covered by |
|---|---|
| AC-01, AC-02, AC-03, AC-04 | Block 3, Block 4, Block 5 |
| AC-05, AC-06 | Block 1, Block 4 |
| AC-07, AC-11, AC-17 | Block 2, Block 4 |
| AC-08, AC-09, AC-10 | Block 1, Block 4, Block 5 |
| AC-12, AC-13, AC-14, AC-15 | Block 3, Block 4, Block 5 |
| AC-16 | Block 1, Block 4, Block 5 |

## Dependencies between blocks
Block 2 depende de Block 1 (entidades y puertos). Block 3 depende de Block 1 y Block 2 (repositorios y
Unit of Work). Block 4 depende de Block 3 (casos de uso). Block 5 depende de Block 4 (rutas). Orden:
1 → 2 → 3 → 4 → 5.

## Block 1 — Dominio: CUIT, condición IVA, precio, cliente, producto y permisos

**Files**
- `server/src/domain/shared/Email.ts` (new, movido desde `domain/user/Email.ts`) y `InvalidEmail` a `server/src/domain/shared/errors.ts` (new); `domain/user/Email.ts` y `domain/user/errors.ts` (modified) dejan de definirlos y los imports del módulo de usuarios se actualizan (sin cambio de comportamiento).
- `server/src/domain/client/Cuit.ts` (new) — `Cuit.parse(raw)`: quita guiones y espacios, exige `^[0-9]{11}$`, prefijo en {20, 23, 24, 27, 30, 33, 34} y dígito verificador (pesos 5,4,3,2,7,6,5,4,3,2; `11 − (suma mod 11)`; 11 → 0; 10 → inválido); error `InvalidCuit`.
- `server/src/domain/client/IvaCondition.ts` (new) — tabla congelada código → nombre (1 IVA Responsable Inscripto, 4 IVA Sujeto Exento, 5 Consumidor Final, 6 Responsable Monotributo, 7 Sujeto No Categorizado, 8 Proveedor del Exterior, 9 Cliente del Exterior, 10 IVA Liberado – Ley N° 19.640, 13 Monotributista Social, 15 IVA No Alcanzado, 16 Monotributo Trabajador Independiente Promovido); `IvaCondition.of(code)`; error `InvalidIvaCondition`.
- `server/src/domain/client/Client.ts` (new) — entidad inmutable: id, businessName, cuit, address, billingEmail (`Email`), ivaCondition, status (`activo`|`inactivo`), createdAt; `Client.create`, `withData`, `deactivated()`, `reactivated()`; `parseBusinessName`/`parseAddress` (trim, 1–200, S-01); errores `InvalidClientData`.
- `server/src/domain/client/ClientRepository.ts` y `ClientProductRepository.ts` (new) — puertos síncronos.
- `server/src/domain/product/Price.ts` (new) — `Price.parse(text, currency)`: gramática `^\d{1,9}(\.\d{1,2})?$`, cero → `InvalidPrice`, guarda centavos enteros; `toDecimalString()` siempre con 2 decimales; moneda `ARS`|`USD` (`InvalidCurrency`).
- `server/src/domain/product/Product.ts` (new) — entidad: id, name (trim, 1–100), nameNormalized (`trim().normalize('NFC').toLowerCase()`), price, status, createdAt; `create`, `withData`, `deactivated()`, `reactivated()`; error `InvalidProductData`.
- `server/src/domain/product/ProductRepository.ts` (new) — puerto síncrono.
- `server/src/domain/auth/Authorization.ts` (modified) — acciones `clients.read`, `clients.manage`, `products.read`, `products.manage`: admin y editor todas; consulta solo `*.read`.
- Tests: `server/test/domain/Cuit.test.ts`, `IvaCondition.test.ts`, `Price.test.ts`, `Client.test.ts`, `Product.test.ts` (new) y `server/test/domain/Authorization.test.ts` (modified).

**Logic**
Implementa la parte de dominio de FR-01 a FR-05, FR-08 a FR-12 y FR-19. Baja y reactivación son
idempotentes (devuelven la misma entidad si ya estaba en ese estado, como `User`). El email de
facturación usa el `Email` compartido (trim, minúsculas, 254). Ningún módulo de dominio importa de
otro agregado salvo `domain/shared`.

**Data model**
- Reuses `clients` and `products` as declared in Block 2 — no schema change in this block; constraints as declared there: `cuit` NOT NULL UNIQUE, `billing_email` NOT NULL UNIQUE, `iva_condition` NOT NULL CHECK, `name_normalized` NOT NULL UNIQUE, `price_cents` NOT NULL CHECK > 0, `currency` NOT NULL CHECK, `status` NOT NULL CHECK. Este bloque define las entidades en memoria que esas columnas persisten.

**Input validation**
- CUIT: string; se quitan guiones y espacios; 11 dígitos, prefijo válido y dígito verificador.
- Condición IVA: entero de la lista de FR-04.
- Razón social y domicilio: string, trim, 1–200. Nombre de producto: string, trim, 1–100.
- Precio: string `^\d{1,9}(\.\d{1,2})?$`, mayor a cero; moneda `ARS` o `USD`.

**Error handling**
- CUIT con dígito verificador inválido — `InvalidCuit`.
- CUIT con prefijo inválido o sin 11 dígitos — `InvalidCuit`.
- Condición IVA fuera de la lista — `InvalidIvaCondition`.
- Precio cero, negativo, con 3 decimales o con formato inválido — `InvalidPrice`.
- Moneda distinta de ARS/USD — `InvalidCurrency`.
- Razón social, domicilio o nombre vacíos o largos — `InvalidClientData` / `InvalidProductData`.

**Required tests**
- [ ] `test_cuit_valido_30711111111` — se acepta y normaliza `30-71111111-1` a `30711111111` — validates AC-06
- [ ] `test_cuit_digito_verificador_invalido_rechazado` — `30711111118` → `InvalidCuit` (sad path) — validates AC-06
- [ ] `test_cuit_prefijo_invalido_rechazado` — `00000000000` y `11111111111` → `InvalidCuit` (sad path) — validates AC-06
- [ ] `test_cuit_formato_invalido_rechazado` — 10 dígitos, letras → `InvalidCuit` (sad path)
- [ ] `test_iva_condicion_invalida_rechazada` — 2 y 99 → `InvalidIvaCondition`; las 11 válidas tienen nombre (sad path) — validates AC-05
- [ ] `test_price_ida_y_vuelta_sin_perdida` — `0.01`, `15000.5` → `15000.50`, `999999999.99` — validates AC-08
- [ ] `test_price_cero_o_negativo_invalido` — `0`, `0.00`, `-100` → `InvalidPrice` (sad path) — validates AC-09
- [ ] `test_price_formato_invalido_rechazado` — `1e3`, `+5`, `1,50`, `1.234` → `InvalidPrice` (sad path)
- [ ] `test_currency_invalida_rechazada` — `EUR` → `InvalidCurrency` (sad path)
- [ ] `test_client_datos_invalidos_rechazados` — razón social vacía o de 201 caracteres → `InvalidClientData` (sad path) — validates AC-02
- [ ] `test_client_baja_y_reactivacion_idempotentes` — validates AC-04
- [ ] `test_product_nombre_normalizado` — "Sistema de Turnos" y "sistema de turnos" y NFC/NFD dan el mismo `nameNormalized` — validates AC-11
- [ ] `test_product_datos_invalidos_rechazados` — nombre vacío o de 101 caracteres → `InvalidProductData` (sad path)
- [ ] `test_authorization_permisos_de_clientes_y_productos` — admin y editor `*.manage`; consulta solo `*.read` — validates AC-16

**Completion criterion**
Los 14 tests pasan, los tests existentes del módulo de usuarios siguen en verde tras mover `Email`, y
`npm run typecheck` y `npm run lint` pasan.

## Block 2 — Persistencia de clientes, productos y asignaciones

**Files**
- `server/src/infrastructure/db/schema.ts` (modified) — tablas `clients`, `products`, `client_products` en `export const schema`.
- `server/drizzle/0003_*.sql`, `server/drizzle/meta/0003_snapshot.json` (new), `server/drizzle/meta/_journal.json` (modified) — `npm run db:generate -w server`.
- `server/src/infrastructure/db/DrizzleClientRepository.ts`, `DrizzleProductRepository.ts`, `DrizzleClientProductRepository.ts` (new).
- `server/src/application/shared/UnitOfWork.ts` y `server/src/infrastructure/db/DrizzleUnitOfWork.ts` (modified) — `clients`, `products`, `clientProducts`.
- `server/test/support/InMemoryClientRepository.ts`, `InMemoryProductRepository.ts`, `InMemoryClientProductRepository.ts` (new, con snapshot/restore); `server/test/support/InMemoryUnitOfWork.ts` (modified, objeto de opciones `{ users, sessions, resetTokens?, clients?, products?, clientProducts? }`, actualizando sus llamadores `authContext.ts`, `InMemoryUnitOfWork.test.ts`, `RegisterFirstAdmin.test.ts`).
- Tests: `server/test/support/ClientRepository.contract.test.ts`, `ProductRepository.contract.test.ts`, `ClientProductRepository.contract.test.ts` (new); `server/test/infrastructure/migrate.test.ts`, `DrizzleUnitOfWork.test.ts`, `server/test/support/InMemoryUnitOfWork.test.ts` (modified).

**Logic**
Implementa la persistencia de FR-01 a FR-18 y NFR-01/NFR-03. Puertos: clientes `insert`, `update`,
`findById`, `findByCuit`, `findByBillingEmail`, `list()` (orden por razón social); productos `insert`,
`update`, `findById`, `findByNameNormalized`, `findByIds`, `list()` (orden por nombre); asignaciones
`assign(clientId, productId, now)`, `unassign(clientId, productId): boolean`, `isAssigned`,
`listProductsOf(clientId)`. Cada repositorio Drizzle traduce la violación de UNIQUE/PK de su columna
(regex exacta + `SQLITE_CONSTRAINT_UNIQUE`/`SQLITE_CONSTRAINT_PRIMARYKEY`, patrón de
`DrizzleUserRepository`) a `DuplicateCuit`, `DuplicateBillingEmail`, `DuplicateProductName`,
`ProductAlreadyAssigned`.

**Data model**
- `clients`: `id` text PK; `business_name` text NOT NULL; `cuit` text NOT NULL UNIQUE; `address` text NOT NULL; `billing_email` text NOT NULL UNIQUE (normalizado en minúsculas); `iva_condition` integer NOT NULL CHECK IN (1,4,5,6,7,8,9,10,13,15,16); `status` text NOT NULL CHECK IN ('activo','inactivo'); `created_at` text NOT NULL.
- `products`: `id` text PK; `name` text NOT NULL; `name_normalized` text NOT NULL UNIQUE; `price_cents` integer NOT NULL CHECK > 0; `currency` text NOT NULL CHECK IN ('ARS','USD'); `status` text NOT NULL CHECK IN ('activo','inactivo'); `created_at` text NOT NULL.
- `client_products`: `client_id` text NOT NULL FK → clients.id; `product_id` text NOT NULL FK → products.id; `created_at` text NOT NULL; PK compuesta (`client_id`, `product_id`); índice en `product_id`; sin ON DELETE (no se borran clientes ni productos).

**Input validation**
- Los repositorios reciben entidades ya validadas por el dominio; los ids vienen del server.

**Error handling**
- CUIT duplicado — la UNIQUE lanza y se traduce a `DuplicateCuit`.
- Email de facturación duplicado — se traduce a `DuplicateBillingEmail`.
- Nombre de producto duplicado — se traduce a `DuplicateProductName`.
- Asignación duplicada — la PK se traduce a `ProductAlreadyAssigned`.
- Error dentro de la Unit of Work — los tres repositorios nuevos se revierten.

**Required tests**
- [ ] `test_client_repo_contrato_insert_find_list` — en memoria y Drizzle — validates AC-01
- [ ] `test_client_repo_cuit_duplicado_rechazado` — Drizzle: insert directo con el mismo CUIT → `DuplicateCuit` (sad path) — validates AC-17
- [ ] `test_client_repo_email_duplicado_rechazado` — Drizzle → `DuplicateBillingEmail` (sad path) — validates AC-07
- [ ] `test_product_repo_contrato_insert_find_list` — en memoria y Drizzle; el precio vuelve igual en centavos — validates AC-08
- [ ] `test_product_repo_nombre_duplicado_rechazado` — Drizzle → `DuplicateProductName` (sad path) — validates AC-11
- [ ] `test_client_product_repo_asignacion_duplicada_rechazada` — Drizzle: la PK → `ProductAlreadyAssigned` (sad path) — validates AC-14
- [ ] `test_client_product_repo_assign_unassign_list` — en memoria y Drizzle — validates AC-13, AC-15
- [ ] `test_migracion_clientes_productos` — tablas, UNIQUE, CHECK, FK y PK compuesta
- [ ] `test_uow_error_revierte_clientes_productos` — Drizzle y en memoria (sad path)

**Completion criterion**
Los 9 tests pasan, la migración 0003 se aplica desde cero, los tests existentes siguen en verde con
el nuevo constructor de `InMemoryUnitOfWork`, y `npm run typecheck` y `npm run lint` pasan.

## Block 3 — Casos de uso

**Files**
- `server/src/application/shared/requireActor.ts` (new, movido desde `application/user/requireActor.ts`; los 4 casos de uso de usuarios actualizan su import).
- `server/src/application/client/CreateClient.ts`, `UpdateClient.ts`, `DeactivateClient.ts`, `ReactivateClient.ts`, `ListClients.ts`, `GetClient.ts`, `AssignProducts.ts`, `UnassignProduct.ts`, `errors.ts` (new).
- `server/src/application/product/CreateProduct.ts`, `UpdateProduct.ts`, `DeactivateProduct.ts`, `ReactivateProduct.ts`, `ListProducts.ts`, `errors.ts` (new).
- `server/src/application/client/dto/PublicClient.ts` y `server/src/application/product/dto/PublicProduct.ts` (new) — `toPublicClient` (ivaCondition `{ code, name }`, fechas ISO) y `toPublicProduct` (`price` texto con 2 decimales, `currency`).
- `server/test/support/catalogContext.ts` (new) — arma usuarios de los tres perfiles y los casos de uso sobre los dobles.
- Tests: `server/test/application/client/*.test.ts`, `server/test/application/product/*.test.ts` y `server/test/application/clientRace.test.ts` (new).

**Logic**
Cada caso de uso: `assertCan(actor.role, …)` antes de la transacción y `requireActor` dentro, como
`CreateUser`. Alta y modificación de cliente: valida con el dominio, controla dentro de `uow.run`
CUIT y email (excluyendo al propio cliente en la modificación). Producto: igual con el nombre
normalizado. `AssignProducts(clientId, productIds)`: todo o nada dentro de `uow.run`; cliente
inexistente → `ClientNotFound`; producto inexistente → `ProductNotFound`; producto Inactivo →
`ProductInactive`; ya asignado → `ProductAlreadyAssigned`. `UnassignProduct`: no asignado →
`ProductNotAssigned`. `GetClient` devuelve el cliente con sus productos asignados. Baja y
reactivación idempotentes. Los listados devuelven DTOs.

**Data model**
- Reutiliza `clients`, `products` y `client_products` de Block 2 — sin cambio de esquema; restricciones como están declaradas ahí: `cuit` NOT NULL UNIQUE, `billing_email` NOT NULL UNIQUE, `name_normalized` NOT NULL UNIQUE, `price_cents` NOT NULL CHECK > 0, PK compuesta de asignaciones.

**Input validation**
- Los casos de uso reciben strings y números crudos y validan con el dominio (Block 1); `productIds` llega ya validado como lista no vacía, sin repetidos y de hasta 50 (Block 4).

**Error handling**
- Usuario Consulta que intenta modificar — `Forbidden`.
- Cliente o producto inexistente — `ClientNotFound` / `ProductNotFound`.
- CUIT, email o nombre duplicado — `DuplicateCuit` / `DuplicateBillingEmail` / `DuplicateProductName`.
- Producto Inactivo en una asignación — `ProductInactive`, no se asigna ninguno del lote.
- Producto ya asignado — `ProductAlreadyAssigned`, no se asigna ninguno del lote.
- Desasignar uno no asignado — `ProductNotAssigned`.

**Required tests**
- [ ] `test_create_client_activo_con_fecha_de_alta` — validates AC-01
- [ ] `test_update_client_modifica_datos` — razón social y domicilio nuevos — validates AC-03
- [ ] `test_update_client_mismo_cuit_propio_no_es_duplicado` — modificar sin cambiar el CUIT no falla
- [ ] `test_create_client_cuit_duplicado_rechazado` — `DuplicateCuit` y nada cambia (sad path) — validates AC-07
- [ ] `test_update_client_email_duplicado_rechazado` — `Pagos@LosAndes.com` contra otro cliente → `DuplicateBillingEmail` (sad path) — validates AC-07
- [ ] `test_deactivate_reactivate_client` — validates AC-04
- [ ] `test_client_inexistente_no_encontrado` — `ClientNotFound` (sad path)
- [ ] `test_create_product_activo` — validates AC-08
- [ ] `test_update_product_nombre_precio_moneda` — de pesos a dólares — validates AC-10
- [ ] `test_create_product_nombre_duplicado_rechazado` — "sistema de turnos" → `DuplicateProductName` (sad path) — validates AC-11
- [ ] `test_deactivate_product_conserva_asignaciones` — validates AC-12
- [ ] `test_assign_productos_a_cliente_inactivo` — validates AC-13
- [ ] `test_assign_producto_inactivo_rechazado_todo_o_nada` — lote con uno Inactivo → `ProductInactive` y 0 asignados (sad path) — validates AC-12
- [ ] `test_assign_producto_ya_asignado_rechazado` — `ProductAlreadyAssigned`, una sola asignación (sad path) — validates AC-14
- [ ] `test_assign_producto_inexistente_no_encontrado` — `ProductNotFound` (sad path)
- [ ] `test_unassign_producto` — validates AC-15
- [ ] `test_unassign_producto_no_asignado_rechazado` — `ProductNotAssigned` (sad path)
- [ ] `test_consulta_no_autorizado_a_modificar` — Consulta en cada caso de uso de escritura → `Forbidden` y nada cambia (sad path) — validates AC-16
- [ ] `test_consulta_puede_listar_y_ver_detalle` — validates AC-16
- [ ] `test_race_dos_altas_mismo_cuit_conflict` — SQLite real: uno se crea, el otro `DuplicateCuit` (sad path: conflict) — validates AC-17

**Completion criterion**
Los 20 tests pasan, los casos de uso dependen solo de `domain/` y `application/`, los tests de
usuarios siguen en verde tras mover `requireActor`, y `npm run typecheck` y `npm run lint` pasan.

## Block 4 — Rutas HTTP

**Files**
- `server/src/infrastructure/http/routes/clients.ts` y `routes/products.ts` (new).
- `server/src/infrastructure/http/body.ts` (modified) — `requiredInteger(body, field)` y `requiredStringArray(body, field, { maxItems, maxLength })`.
- `server/src/infrastructure/http/errorHandler.ts` (modified) — mapeo de los errores nuevos.
- `server/src/infrastructure/http/app.ts`, `server/src/main.ts`, `server/test/support/testApp.ts` (modified) — `AppDeps` con los casos de uso y armado.
- Tests: `server/test/http/clients.test.ts`, `server/test/http/products.test.ts` (new).

**Logic**
Implementa FR-01 a FR-19 en HTTP. Las rutas validan la forma del body (400) y llaman al caso de uso;
no tienen lógica de negocio. Todas requieren sesión (no son públicas). Responden DTOs.

**API contract**
- Method + path: `GET /api/clients`, `GET /api/clients/:id`, `POST /api/clients`, `PATCH /api/clients/:id`, `POST /api/clients/:id/deactivate`, `POST /api/clients/:id/reactivate`, `POST /api/clients/:id/products`, `POST /api/clients/:id/products/:productId/unassign`, `GET /api/products`, `POST /api/products`, `PATCH /api/products/:id`, `POST /api/products/:id/deactivate`, `POST /api/products/:id/reactivate`
- Request: cliente `{ businessName: string, cuit: string, address: string, billingEmail: string, ivaCondition: number }` (PATCH con los mismos campos opcionales); asignación `{ productIds: string[] }`; producto `{ name: string, price: string, currency: "ARS"|"USD" }` (PATCH opcionales)
- Response: cliente `{ id, businessName, cuit, address, billingEmail, ivaCondition: { code, name }, status, createdAt }`; detalle con `products: Product[]`; producto `{ id, name, price, currency, status, createdAt }`; listados `{ clients: [...] }` / `{ products: [...] }`; 201 en altas, 200 en el resto, 204 en desasignar
- Error codes: `400` (body inválido, `InvalidCuit`, `InvalidIvaCondition`, `InvalidPrice`, `InvalidCurrency`, `InvalidEmail`, `InvalidClientData`, `InvalidProductData`), `401`, `403` (`Forbidden`), `404` (`ClientNotFound`, `ProductNotFound`, `ProductNotAssigned`), `409` (`DuplicateCuit`, `DuplicateBillingEmail`, `DuplicateProductName`, `ProductAlreadyAssigned`, `ProductInactive`), `415`, `500`
- Auth: sesión obligatoria; lectura para los tres perfiles, escritura solo Admin y Editor (`clients.*`, `products.*`)

**Data model**
- Reutiliza `clients`, `products` y `client_products` de Block 2 — sin cambio de esquema; restricciones como están declaradas ahí: UNIQUE en `cuit`, `billing_email` y `name_normalized`, CHECK de condición IVA, precio y moneda, PK compuesta de asignaciones.

**Input validation**
- Body: objeto JSON (`bodyObject`); strings con `requiredString`/`optionalString` y largo máximo (razón social y domicilio 200, CUIT 20, email 254, nombre 100, precio 13).
- `ivaCondition`: entero (`requiredInteger`); `price`: string; un número JSON da 400.
- `productIds`: lista de 1 a 50 strings de hasta 64 caracteres, sin repetidos (`requiredStringArray`).
- `:id` y `:productId`: string de hasta 64 caracteres.

**Error handling**
- Body inválido o campo con tipo incorrecto — 400.
- Datos de dominio inválidos (CUIT, condición IVA, precio, moneda, email, largos) — 400 con el mensaje del error.
- Usuario Consulta que escribe — 403 y nada cambia.
- Cliente, producto o asignación inexistente — 404.
- Duplicado, producto Inactivo o ya asignado — 409 y nada cambia.

**Required tests**
- [ ] `test_http_alta_cliente_aparece_en_listado` — 201 y en `GET /api/clients` — validates AC-01
- [ ] `test_http_alta_cliente_sin_campos_rechazado` — sin cada uno de los 5 campos → 400 (sad path) — validates AC-02
- [ ] `test_http_modificar_cliente_y_ver_detalle` — validates AC-03
- [ ] `test_http_baja_y_reactivacion_cliente` — validates AC-04
- [ ] `test_http_condicion_iva_invalida_rechazada` — 2, 99 y `"5"` → 400 (sad path) — validates AC-05
- [ ] `test_http_cuit_invalido_rechazado` — `30711111118` y `00000000000` en alta y modificación → 400 y nada cambia; `30711111111` → 201 (sad path) — validates AC-06
- [ ] `test_http_cuit_y_email_duplicados_conflict` — 409 en alta y modificación (sad path) — validates AC-07
- [ ] `test_http_alta_producto_precio_texto` — `"15000.50"` ARS → 201 y listado con `"15000.50"` — validates AC-08
- [ ] `test_http_precio_invalido_rechazado` — `"0"`, `"-100"`, `15000.5` como número → 400; `"0.01"` → 201 (sad path) — validates AC-09
- [ ] `test_http_modificar_producto_a_dolares` — validates AC-10
- [ ] `test_http_nombre_producto_duplicado_conflict` — 409 (sad path) — validates AC-11
- [ ] `test_http_desactivar_producto_asignado` — sigue en el detalle del cliente; asignarlo a otro → 409; reactivado se puede asignar — validates AC-12
- [ ] `test_http_asignar_dos_productos_a_cliente_inactivo` — validates AC-13
- [ ] `test_http_asignar_ya_asignado_conflict` — 409 (sad path) — validates AC-14
- [ ] `test_http_asignar_lista_invalida_rechazada` — vacía, repetidos, 51 ids → 400 (sad path)
- [ ] `test_http_desasignar_producto` — 204 y el detalle muestra solo el otro — validates AC-15
- [ ] `test_http_desasignar_no_asignado_no_encontrado` — 404 (sad path)
- [ ] `test_http_consulta_forbidden_en_escrituras` — 403 en cada ruta de escritura; 200 en listados y detalle (sad path) — validates AC-16
- [ ] `test_http_altas_simultaneas_mismo_cuit` — dos `POST` concurrentes: un 201 y un 409, un solo registro (sad path: conflict) — validates AC-17
- [ ] `test_http_listados_1000_registros_rapidos` — `GET /api/clients` y `GET /api/products` con 1000 filas cada uno en < 500 ms

**Completion criterion**
Los 20 tests pasan, los tests HTTP existentes siguen en verde, y `npm run typecheck` y
`npm run lint` pasan.

## Block 5 — Web

**Files**
- `web/src/api/types.ts` (modified) — `Client`, `ClientDetail`, `Product`, inputs.
- `web/src/api/clientsApi.ts`, `web/src/api/productsApi.ts` (new) — llamadas con validación de forma de la respuesta (como `isPublicUser`); tests `clientsApi.test.ts`, `productsApi.test.ts` (new).
- `web/src/api/catalogRules.ts` (new) — condiciones IVA con nombre, largos, validador de CUIT (mismo algoritmo y prefijos) y de precio por regex; `formatPrice(price, currency)` con `Intl.NumberFormat('es-AR')` a partir de parte entera y centavos (sin floats); `toApiPrice(text)` convierte la coma es-AR a punto como texto. Tests `catalogRules.test.ts` (new).
- `web/src/pages/ClientsPage.tsx`, `ClientDetailPage.tsx`, `ProductsPage.tsx` (new) + tests (new).
- `web/src/router.tsx` (modified) — `/clientes`, `/clientes/:id`, `/productos` con loaders de sesión para los tres perfiles; `web/src/router.test.tsx` (modified).
- `web/src/components/AppLayout.tsx` (modified) — enlaces "Clientes" y "Productos" para los tres perfiles; `web/src/pages/HomePage.test.tsx` (modified).

**Logic**
Implementa FR-01 a FR-19 en la web. Listado de clientes con razón social, CUIT, email, condición IVA
y estado; alta y edición en un formulario modal; baja y reactivación. Detalle con los productos
asignados, asignar (solo productos Activos no asignados) y desasignar. Listado de productos con
precio formateado y moneda; alta, edición, desactivar y reactivar. Para Consulta las acciones de
escritura no se muestran (el server igual rechaza). El precio se edita como texto (`Input` con
validación, no `InputNumber` numérico).

**API contract**
- Method + path: las rutas de Block 4, consumidas con `request` de `client.ts` (sin DELETE).
- Request: los bodies de Block 4; `price` como texto con punto decimal.
- Response: DTOs de Block 4 validados en tiempo de ejecución; forma inválida → error genérico.
- Error codes: 400, 403, 404, 409 mostrados con `errorText`; 401 lleva al login.
- Auth: cookie de sesión; los tres perfiles ven, Admin y Editor escriben.

**Input validation**
- Mismas reglas que el server: CUIT (dígito y prefijo), condición IVA de la lista, largos, email, precio `^\d{1,9}([.,]\d{1,2})?$` mayor a cero.

**Error handling**
- Datos inválidos — error en el formulario sin llamar a la API.
- 409 duplicado o producto Inactivo — mensaje del server en el formulario o en la pantalla.
- 403 o 404 — mensaje del server.
- Respuesta con forma inesperada — error genérico, sin romper la pantalla.

**Required tests**
- [ ] `test_web_clientes_listado_y_alta` — validates AC-01
- [ ] `test_web_alta_cliente_cuit_invalido_rechazado` — no llama a la API (sad path) — validates AC-06
- [ ] `test_web_cliente_duplicado_conflict_muestra_error` — 409 → mensaje (sad path) — validates AC-07
- [ ] `test_web_editar_cliente` — validates AC-03
- [ ] `test_web_baja_reactivacion_cliente` — validates AC-04
- [ ] `test_web_detalle_asignar_y_desasignar` — validates AC-13, AC-15
- [ ] `test_web_productos_listado_precio_formateado` — `15.000,50` y moneda — validates AC-08
- [ ] `test_web_precio_invalido_rechazado` — `0` y `1,234` no llaman a la API (sad path) — validates AC-09
- [ ] `test_web_editar_producto_y_desactivar` — validates AC-10, AC-12
- [ ] `test_web_consulta_sin_acciones_de_escritura` — validates AC-16
- [ ] `test_web_respuesta_invalida_error_generico` — forma inesperada → error (sad path)
- [ ] `test_web_rutas_catalogo_requieren_sesion` — sin sesión → `/login`; los tres perfiles entran

**Completion criterion**
Los 12 tests pasan, la suite web sigue en verde y `npm run typecheck` y `npm run lint` pasan.

## Final verification
`npm test`, `npm run lint` y `npm run typecheck` en verde; los 75 Required tests presentes con sus
identificadores `test_...`; la migración 0003 se aplica sobre una base existente de FEAT-008; rollback:
revertir los commits del ticket (las tablas nuevas quedan sin uso y no afectan a las demás).
