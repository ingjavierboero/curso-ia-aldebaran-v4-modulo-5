# Spec FEAT-011: Configuración de facturación

| Field | Value |
|-------|-------|
| Ticket | FEAT-011 |
| PRD | docs/daw/prd/prd-FEAT-011.md |
| Tier | FEATURE |
| Date | 2026-11-16 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Se agrega la configuración de facturación con el mismo corte DDD que clientes y productos (FEAT-010).
El dominio tiene value objects por valor y un agregado `BillingSettings` que calcula los datos
obligatorios faltantes. La persistencia es una tabla `settings` de una sola fila con columnas tipadas
y CHECK (ADR-008). Hay dos casos de uso: leer (tres perfiles) y actualizar parcialmente (solo Admin),
este último con lectura, mezcla y guardado dentro de la unidad de trabajo. Las rutas son
`GET`/`PATCH /api/settings/billing` y la pantalla es `/configuracion`. `IvaCondition` pasa a
`domain/shared` (D-06) y la fecha de hoy en Argentina se calcula con zona horaria explícita.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 3, Block 4, Block 5 |
| FR-02 | Block 1, Block 3, Block 4, Block 5 |
| FR-03 | Block 1, Block 2 |
| FR-04 | Block 1, Block 3, Block 4, Block 5 |
| FR-05 | Block 1, Block 2, Block 3, Block 4, Block 5 |
| FR-06 | Block 1, Block 4 |
| FR-07 | Block 1, Block 3, Block 4 |
| FR-08 | Block 1, Block 4 |
| FR-09 | Block 1, Block 3, Block 4 |
| FR-10 | Block 1, Block 5 |
| FR-11 | Block 1, Block 4, Block 5 |
| FR-12 | Block 1, Block 3, Block 4, Block 5 |
| FR-13 | Block 1, Block 3, Block 4 |
| NFR-01 | Strategy: el caso de uso convierte cada valor enviado a su value object antes de abrir la transacción; si uno falla no se escribe nada. Dentro de `uow.run` (IMMEDIATE, ADR-003) se lee, se mezcla y se guarda una sola vez. Lo prueban `test_update_billing_settings_invalido_no_guarda_nada` y `test_http_patch_mixto_invalido_no_cambia_nada` |
| NFR-02 | Strategy: la fila vive en SQLite y se relee en una conexión nueva sobre el mismo archivo (`test_settings_persisten_tras_reiniciar`) |
| NFR-03 | Strategy: lectura por clave primaria de una sola fila; `test_http_get_settings_rapido` mide la mediana de 5 lecturas tras un calentamiento, < 200 ms |

## Dependencies between blocks
Block 1 → Block 2 → Block 3 → Block 4 → Block 5, en ese orden. Block 2 usa los value objects y el
puerto de Block 1; Block 3 usa el repositorio y la unidad de trabajo de Block 2; Block 4 expone los
casos de uso de Block 3; Block 5 consume las rutas de Block 4.

## Block 1 — Dominio de la configuración y mudanza de IvaCondition

**Files**
- `server/src/domain/shared/IvaCondition.ts` (new, movido desde `domain/client/IvaCondition.ts`, que se borra) — sin cambios de comportamiento.
- `server/src/domain/shared/errors.ts` (modified) — recibe `InvalidIvaCondition`, que sale de `domain/client/errors.ts` (modified).
- Importadores de `IvaCondition`/`InvalidIvaCondition` (modified, solo el import): `domain/client/Client.ts`, `application/client/CreateClient.ts`, `application/client/UpdateClient.ts`, `application/client/dto/PublicClient.ts`, `infrastructure/db/DrizzleClientRepository.ts`, `infrastructure/db/schema.ts`, `infrastructure/http/errorHandler.ts`, y en `server/test/`: `domain/IvaCondition.test.ts`, `domain/Client.test.ts`, `application/client/UpdateClient.test.ts`, `support/catalogContext.ts`, `support/InMemoryClientRepository.ts`, `support/ClientRepository.contract.test.ts` y los demás que muestre `grep -rn "IvaCondition" server/`.
- `server/src/domain/shared/boundedText.ts` (new) — `parseBoundedText(raw, max, makeError)`: trim y largo 1..max. Lo extrae de `domain/client/Client.ts` (modified), que pasa a usarlo con su propio error (W3).
- `server/src/domain/shared/argentinaDate.ts` (new) — `argentinaCalendarDate(instant: Date): string` (`YYYY-MM-DD`) con `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`. No depende de `process.env.TZ` (F2).
- `server/src/domain/settings/BillingHour.ts` (new) — `BillingHour.parse(raw)` para `HH:MM` entre 00:00 y 23:59; `BillingHour.DEFAULT` = 11:00.
- `server/src/domain/settings/PointOfSale.ts` (new) — `PointOfSale.of(n)`: entero seguro entre 1 y 99999.
- `server/src/domain/settings/IssuerIvaCondition.ts` (new) — `ISSUER_IVA_CONDITIONS` (códigos 4, 6, 13 y 16 de `IVA_CONDITIONS`) y `IssuerIvaCondition.of(code)`. Cualquier código fuera de esa lista, aunque sea un `IvaCondition` válido, lanza `InvalidIssuerIvaCondition` con un mensaje fijo que nombra las 4 admitidas (W11).
- `server/src/domain/settings/ActivityStartDate.ts` (new) — `ActivityStartDate.parse(raw, today)`: `YYYY-MM-DD`, fecha existente del calendario, entre 1900-01-01 y `today`. `ActivityStartDate.rehydrate(raw)` aplica las mismas reglas sin el tope de hoy (W5).
- `server/src/domain/settings/issuerText.ts` (new) — `parseIssuerLegalName`, `parseIssuerAddress` y `parseIssuerTradeName` (trim, 1–200, S-01); `parseIibb` (trim, 1–50, D-07); constantes `ISSUER_TEXT_MAX_LENGTH = 200` e `IIBB_MAX_LENGTH = 50`.
- `server/src/domain/settings/BillingSettings.ts` (new) — agregado inmutable: `defaults()`, `withChanges(changes)` con valores ya tipados (W2), `missingRequired()` y `toData()`.
- `server/src/domain/settings/SettingsRepository.ts` (new) — puerto con `get(): BillingSettings` y `saveBilling(settings, updatedAt)`.
- `server/src/domain/settings/errors.ts` (new) — `InvalidBillingHour`, `InvalidPointOfSale`, `InvalidIssuerIvaCondition`, `InvalidActivityStartDate`, `InvalidIibb`, `InvalidIssuerText`, todos con mensaje fijo y sin repetir el valor.
- `server/src/domain/auth/Authorization.ts` (modified) — acciones `settings.read` (admin, editor, consulta) y `settings.manage` (solo admin).
- Tests (new): `server/test/domain/BillingHour.test.ts`, `PointOfSale.test.ts`, `IssuerIvaCondition.test.ts`, `ActivityStartDate.test.ts`, `issuerText.test.ts`, `argentinaDate.test.ts`, `BillingSettings.test.ts`. (modified): `server/test/domain/Authorization.test.ts`.

**Logic**
Implementa las reglas de FR-02 a FR-13 en el dominio. `missingRequired()` devuelve, en este orden
fijo, las claves de los obligatorios vacíos: `issuerLegalName`, `issuerAddress`,
`issuerIvaCondition`, `issuerIibb`, `issuerActivityStartDate` y `pointOfSale` (W4). `withChanges`
aplica solo las claves presentes y conserva las demás (S-03). No hay forma de vaciar un dato ya
guardado (fuera de alcance). El agregado no recibe un `Clock`: el tope de hoy llega como `today`
calculado por el caso de uso (F2).

**Data model**
- Entidad `BillingSettings` (en memoria, sin esquema propio en este bloque): `billingHour` (no nulo, default 11:00), `pointOfSale` (opcional), `issuerLegalName`, `issuerAddress`, `issuerIvaCondition`, `issuerIibb`, `issuerActivityStartDate`, `issuerTradeName` (todos opcionales). La tabla que lo persiste se declara en Block 2.

**Input validation**
- Hora: texto `^\d{2}:\d{2}$`, horas 00–23 y minutos 00–59.
- Punto de venta: entero seguro, 1 a 99999.
- Condición frente al IVA del emisor: entero en {4, 6, 13, 16}.
- Fecha de inicio: texto `YYYY-MM-DD`, fecha existente, entre 1900-01-01 y hoy en Argentina.
- Razón social, domicilio comercial y nombre de fantasía: texto, trim, 1–200 caracteres.
- Número de ingresos brutos: texto, trim, 1–50 caracteres.

**Error handling**
- Hora fuera de formato o de rango — `InvalidBillingHour`.
- Punto de venta fuera de rango o no entero — `InvalidPointOfSale`.
- Condición frente al IVA no admitida para el emisor — `InvalidIssuerIvaCondition`.
- Fecha de inicio inexistente, futura o anterior a 1900 — `InvalidActivityStartDate`.
- Número de ingresos brutos vacío tras el trim o de más de 50 — `InvalidIibb`.
- Razón social, domicilio o nombre de fantasía vacío o de más de 200 — `InvalidIssuerText`.

**Required tests**
- [ ] `test_billing_hour_valida_2359` — `23:59` y `00:00` válidos — validates AC-02
- [ ] `test_billing_hour_invalida_rechazada` — `24:00`, `23:60`, `9:00` y `""` son inválidos (sad path) — validates AC-03
- [ ] `test_point_of_sale_valido_5` — validates AC-04
- [ ] `test_point_of_sale_invalido_rechazado` — `0`, `100000` y `2.5` son inválidos (sad path) — validates AC-05
- [ ] `test_issuer_iva_condition_responsable_inscripto_rechazada` — los códigos 1 y 99 lanzan el mismo `InvalidIssuerIvaCondition`, y el 6 es válido (sad path) — validates AC-07
- [ ] `test_activity_start_fecha_inexistente_o_futura_rechazada` — `2020-02-31`, mañana y `1899-12-31` son inválidos (sad path) — validates AC-08
- [ ] `test_activity_start_hoy_y_bisiesto_validos` — `2024-02-29` y hoy son válidos — validates AC-06, AC-08
- [ ] `test_argentina_date_borde_medianoche` — `2026-11-17T02:30:00Z` → `2026-11-16`
- [ ] `test_iibb_trim_y_largo_invalido_rechazado` — `""`, `"   "` y 51 caracteres son inválidos; `"  CM 901-123456-7  "` → `"CM 901-123456-7"` (sad path) — validates AC-09
- [ ] `test_issuer_text_invalido_rechazado` — vacío y 201 caracteres son inválidos (sad path)
- [ ] `test_billing_settings_defaults_hora_11` — validates AC-01
- [ ] `test_billing_settings_missing_required_en_orden` — validates AC-10, AC-12
- [ ] `test_billing_settings_with_changes_conserva_no_enviados` — validates AC-06
- [ ] `test_authorization_permisos_de_configuracion` — validates AC-13

**Completion criterion**
Los 14 tests pasan, los tests existentes de clientes siguen en verde después de la mudanza y
`npm run typecheck` y `npm run lint` pasan.

## Block 2 — Persistencia de la configuración

**Files**
- `server/src/infrastructure/db/schema.ts` (modified) — tabla `settings`.
- `server/drizzle/0004_<tag>.sql`, `server/drizzle/meta/0004_snapshot.json` (new) y `server/drizzle/meta/_journal.json` (modified) — generados con `npm run db:generate`.
- `server/src/infrastructure/db/DrizzleSettingsRepository.ts` (new) — `get` (sin fila → `BillingSettings.defaults()`, W1) y `saveBilling` (upsert de la fila 1 que actualiza solo las columnas de facturación, W6). Rehidrata con `rehydrate()` de `storedValue.ts` y `ActivityStartDate.rehydrate`.
- `server/src/application/shared/UnitOfWork.ts` (modified) — `settings: SettingsRepository` en `TransactionalRepositories` (F3).
- `server/src/infrastructure/db/DrizzleUnitOfWork.ts` (modified) — instancia `DrizzleSettingsRepository(tx)`.
- `server/test/support/InMemorySettingsRepository.ts` (new) — con `snapshot()`/`restore()`.
- `server/test/support/InMemoryUnitOfWork.ts` (modified) — `settings` opcional, incluida en el rollback.
- `server/test/support/SettingsRepository.contract.test.ts` (new) — mismo contrato sobre InMemory y Drizzle (W10).
- `server/test/infrastructure/migrate.test.ts`, `server/test/support/InMemoryUnitOfWork.test.ts` y `server/test/infrastructure/DrizzleUnitOfWork.test.ts` (modified).

**Logic**
Implementa la persistencia de FR-03, FR-05 y NFR-02. La fila se crea en el primer guardado. Los
CHECK salen de constantes del dominio, como `sqlList(ISSUER_IVA_CONDITIONS…)`, igual que hace
`schema.ts` con `IVA_CONDITIONS`. `updated_at` lo pasa el caso de uso desde `clock.now()`.

**Data model**
- Tabla `settings`:
  - `id` INTEGER PK, CHECK `id = 1`.
  - `billing_hour` TEXT NOT NULL, sin default (la fuente es el dominio, W1), con CHECK de formato `HH:MM` ≤ `23:59`.
  - `point_of_sale` INTEGER NULL, CHECK `BETWEEN 1 AND 99999`.
  - `issuer_legal_name`, `issuer_address` y `issuer_trade_name` TEXT NULL, CHECK `length BETWEEN 1 AND 200`.
  - `issuer_iva_condition` INTEGER NULL, CHECK `IN (4, 6, 13, 16)` derivado de `ISSUER_IVA_CONDITIONS`.
  - `issuer_iibb` TEXT NULL, CHECK `length BETWEEN 1 AND 50`.
  - `issuer_activity_start` TEXT NULL, CHECK de formato `YYYY-MM-DD`.
  - `updated_at` TEXT NOT NULL.
  - Sin índices adicionales: se lee por clave primaria.

**Input validation**
- El repositorio recibe un `BillingSettings` ya validado. Al leer, cada columna se revalida con su value object; un valor corrupto lanza `InvalidStoredValue`, que nombra tabla y columna sin el valor.

**Error handling**
- Fila corrupta al rehidratar — `InvalidStoredValue` (500 genérico en HTTP).
- Violación de un CHECK al guardar (defensa en profundidad) — el error de SQLite se propaga y la transacción se revierte.
- Error dentro de la unidad de trabajo — rollback completo de `settings`, igual que con los demás repositorios.

**Required tests**
- [ ] `test_settings_repo_sin_fila_devuelve_defaults` — validates AC-01
- [ ] `test_settings_repo_guardar_y_releer` — validates AC-02, AC-04, AC-06
- [ ] `test_settings_repo_upsert_idempotente` — dos guardados dejan una sola fila
- [ ] `test_settings_repo_fila_corrupta_invalida_rechazada` — una hora `25:00` escrita por fuera → `InvalidStoredValue` (sad path)
- [ ] `test_migracion_settings_check_invalido_rechazado` — `id = 2`, punto de venta 0 y condición 1 son rechazados por la base (sad path)
- [ ] `test_uow_error_revierte_settings` — un error dentro de `run` deja la fila como estaba (sad path)
- [ ] `test_settings_persisten_tras_reiniciar` — validates AC-15

**Completion criterion**
Los 7 tests pasan contra InMemory y Drizzle donde aplica, la migración 0004 corre sobre una base
nueva y sobre una con datos de FEAT-010, y la suite sigue en verde.

## Block 3 — Casos de uso

**Files**
- `server/src/application/settings/GetBillingSettings.ts` (new) — sin transacción, como `ListClients`. Exige `settings.read` con `requireActor`.
- `server/src/application/settings/UpdateBillingSettings.ts` (new).
- `server/src/application/settings/dto/BillingSettingsDto.ts` (new) — mapper puro a la forma pública con `missing: { field, label }[]`. Las etiquetas son "razón social", "domicilio comercial", "condición frente al IVA", "número de ingresos brutos", "fecha de inicio de actividades" y "punto de venta".
- `server/test/support/settingsContext.ts` (new) — armado de los tests de aplicación.
- Tests (new): `server/test/application/settings/GetBillingSettings.test.ts` y `UpdateBillingSettings.test.ts`.

**Logic**
Implementa FR-01, FR-02, FR-04, FR-05, FR-07, FR-09, FR-12 y FR-13. `UpdateBillingSettings`:
1. Calcula `today = argentinaCalendarDate(clock.now())`.
2. Convierte cada campo presente a su value object. Si uno falla, lanza y no abre la transacción.
3. Dentro de `uow.run`: `requireActor(users, actor, 'settings.manage')`, `settings.get()`, `withChanges` y `settings.saveBilling(next, clock.now())` (F3).
4. Devuelve el DTO.

**Data model**
- Reusa `settings` de Block 2, sin cambio de esquema. Restricciones como se declararon allí: `id = 1`, `billing_hour` NOT NULL, CHECK de rangos y de la lista `IN (4, 6, 13, 16)`, largos 1–200 y 1–50.

**Input validation**
- Entrada `UpdateBillingSettingsInput`: `billingHour?: string`, `pointOfSale?: number`, `issuer?: { legalName?, address?, ivaCondition?: number, iibb?, activityStartDate?, tradeName? }`. Cada valor presente pasa por su value object de Block 1.

**Error handling**
- Actor Editor o Consulta — `Forbidden` (403); nada cambia.
- Actor inexistente o Inactivo — el error de `requireActor` (401 o 403 según el patrón existente); nada cambia.
- Algún valor inválido — el error de dominio de Block 1, antes de la transacción; nada cambia.

**Required tests**
- [ ] `test_get_billing_settings_tres_perfiles` — Admin, Editor y Consulta leen — validates AC-01, AC-13
- [ ] `test_update_billing_settings_admin_guarda` — validates AC-02, AC-04, AC-06
- [ ] `test_update_billing_settings_editor_consulta_forbidden` — 403 sin cambios (sad path) — validates AC-13
- [ ] `test_update_billing_settings_admin_inactivo_no_autorizado` — un Admin dado de baja recibe el error de `requireActor` y nada cambia (sad path)
- [ ] `test_update_billing_settings_invalido_no_guarda_nada` — razón social válida más condición 1 → no cambia ninguna (sad path) — validates AC-14
- [ ] `test_update_billing_settings_guarda_con_faltantes` — validates AC-10
- [ ] `test_update_billing_settings_completa_ultimo_faltante` — `missing` queda vacío — validates AC-11
- [ ] `test_update_billing_settings_fecha_futura_rechazada_hora_argentina` — con el reloj en `2026-11-17T02:30:00Z`, `2026-11-17` es inválida y `2026-11-16` válida (sad path) — validates AC-08

**Completion criterion**
Los 8 tests pasan con `FakeClock` e InMemory, y la suite sigue en verde.

## Block 4 — Rutas HTTP

**Files**
- `server/src/infrastructure/http/routes/settings.ts` (new).
- `server/src/infrastructure/http/app.ts` (modified) — `getBillingSettings` y `updateBillingSettings` en `AppDeps`, y `settingsRoutes(deps)` montado en `/api`.
- `server/src/infrastructure/http/errorHandler.ts` (modified) — los 6 errores de `domain/settings/errors.ts` → 400 con su mensaje fijo.
- `server/src/main.ts` y `server/test/support/testApp.ts` (modified) — cableado.
- `server/src/infrastructure/http/body.ts` (modified, solo si hace falta) — `optionalObject(body, field)` para `issuer`.
- Tests (new): `server/test/http/settings.test.ts`.

**Logic**
Implementa FR-01 a FR-13 en HTTP. La ruta valida solo la forma del body; el caso de uso autoriza y
el dominio valida las reglas (patrón de `routes/clients.ts`). `requireJson` y `noStore` ya se aplican
globalmente en `/api`.

**API contract**
- Method + path: `GET /api/settings/billing` y `PATCH /api/settings/billing`.
- Request: el GET no lleva body. El PATCH lleva `{ billingHour?: string, pointOfSale?: integer, issuer?: { legalName?: string, address?: string, ivaCondition?: integer, iibb?: string, activityStartDate?: string, tradeName?: string } }`, con al menos un campo, y si viene `issuer` tiene que tener al menos uno.
- Response: 200 con `{ billingHour: string, pointOfSale: number | null, issuer: { legalName, address, ivaCondition: { code, name } | null, iibb, activityStartDate, tradeName } (cada uno string | null), missing: { field: string, label: string }[], updatedAt: string | null }`. El PATCH devuelve el mismo DTO (W4).
- Error codes: 400 (body con forma inválida o valor inválido), 401 (sin sesión), 403 (Editor o Consulta en el PATCH), 500 (fila corrupta, genérico).
- Auth: cookie de sesión. GET para los tres perfiles (`settings.read`) y PATCH solo para Admin (`settings.manage`).

**Data model**
- Reusa `settings` de Block 2, sin cambio de esquema. Restricciones como se declararon allí: `id = 1`, `billing_hour` NOT NULL, CHECK de rangos y de la lista `IN (4, 6, 13, 16)`, largos 1–200 y 1–50.

**Input validation**
- `billingHour`, `issuer.legalName`, `issuer.address`, `issuer.tradeName`, `issuer.iibb` e `issuer.activityStartDate`: string opcional, con un largo máximo de la ruta de 200, 50 y 10 tomado de las constantes del dominio. `null` es inválido.
- `pointOfSale` e `issuer.ivaCondition`: entero seguro opcional (`optionalInteger`).
- `issuer`: objeto no vacío (`optionalObject`).
- `{}` es inválido. Las claves desconocidas se ignoran.

**Error handling**
- Body vacío, `issuer` vacío o no-objeto, o un campo con tipo incorrecto — 400 `InvalidBody`; nada cambia.
- Valor rechazado por el dominio — 400 con el mensaje fijo del error; nada cambia.
- Sin sesión — 401, no autorizado.
- Editor o Consulta en el PATCH — 403 forbidden; nada cambia.

**Required tests**
- [ ] `test_http_get_settings_recien_instalado` — 11:00, punto de venta `null`, emisor vacío y los 6 faltantes — validates AC-01
- [ ] `test_http_patch_hora_y_punto_de_venta` — validates AC-02, AC-04
- [ ] `test_http_patch_hora_invalida_rechazada` — `24:00` y `23:60` → 400 y la hora sigue igual (sad path) — validates AC-03
- [ ] `test_http_patch_punto_de_venta_invalido_rechazado` — 0, 100000 y 2.5 → 400 (sad path) — validates AC-05
- [ ] `test_http_patch_emisor_completo` — los 6 datos y el aviso vacío — validates AC-06, AC-11
- [ ] `test_http_patch_condicion_iva_emisor_invalida_rechazada` — código 1 → 400 (sad path) — validates AC-07
- [ ] `test_http_patch_fecha_inicio_invalida_rechazada` — `2020-02-31` y mañana → 400; hoy → 200 (sad path) — validates AC-08
- [ ] `test_http_patch_iibb_invalido_rechazado_y_trim` — `"   "` y 51 caracteres → 400; el valor con espacios se guarda sin ellos (sad path) — validates AC-09
- [ ] `test_http_patch_con_faltantes_devuelve_missing` — sin IIBB ni fecha → `missing` los nombra — validates AC-10, AC-12
- [ ] `test_http_patch_editor_consulta_forbidden` — 403 y la base sin cambios; los dos pueden hacer el GET (sad path) — validates AC-13
- [ ] `test_http_patch_mixto_invalido_no_cambia_nada` — validates AC-14
- [ ] `test_http_patch_body_vacio_invalido` — `{}` e `issuer: {}` → 400 (sad path)
- [ ] `test_http_settings_sin_sesion_no_autorizado` — GET y PATCH → 401 (sad path)
- [ ] `test_http_get_settings_rapido` — mediana < 200 ms — validates AC-01

**Completion criterion**
Los 14 tests pasan, verificando el body y el estado de la base, y la suite sigue en verde.

## Block 5 — Pantalla de configuración

**Files**
- `web/src/api/types.ts` (modified) — `BillingSettings` y `UpdateBillingSettingsInput`.
- `web/src/api/settingsApi.ts` (new) — `getBillingSettings` y `updateBillingSettings` con guardas de forma (`guards.ts`). Test: `settingsApi.test.ts` (new).
- `web/src/api/settingsRules.ts` (new) — las 4 condiciones del emisor con su nombre, los topes 200 y 50, el regex de hora y `canManageSettings(role)`. Es solo de interfaz: la validación real es la del server (W9). Test: `settingsRules.test.ts` (new).
- `web/src/pages/SettingsPage.tsx` (new) + `SettingsPage.test.tsx` (new) — formulario antd que reusa `PageParts`.
- `web/src/router.tsx` (modified) — `/configuracion` con `sessionLoader` para los tres perfiles. `web/src/router.test.tsx` (modified).
- `web/src/components/AppLayout.tsx` (modified) — enlace "Configuración" para los tres perfiles y comentario del header actualizado. `web/src/pages/HomePage.test.tsx` (modified).

**Logic**
Implementa FR-01 a FR-13 en la web:
- Muestra la hora, el punto de venta y los datos del emisor, con los 6 obligatorios marcados (FR-10) y un `Alert` que nombra los faltantes según `missing` (FR-11).
- El Admin edita y guarda: se envían solo los campos cambiados y la pantalla se actualiza con el DTO de la respuesta.
- Editor y Consulta ven el formulario deshabilitado y sin botón Guardar.
- El `DatePicker` limita a la fecha del navegador. Es solo de interfaz: el server aplica la de Argentina (W9).

**API contract**
- Method + path: `GET` y `PATCH /api/settings/billing` de Block 4, consumidas con `request` de `client.ts`.
- Request: el body del PATCH de Block 4, solo con los campos cambiados.
- Response: el DTO de Block 4, validado en tiempo de ejecución. Una forma inválida da un error genérico.
- Error codes: 400 y 403 se muestran con el mensaje del server; 401 lleva al login.
- Auth: cookie de sesión. Los tres perfiles ven y solo el Admin guarda.

**Input validation**
- Hora con el regex `HH:MM` y el rango 00:00–23:59, punto de venta entero entre 1 y 99999, condición del emisor de la lista de 4, textos con trim y topes de 200 y 50, fecha hasta hoy. Si algo falla, el formulario muestra el error y no llama a la API.

**Error handling**
- Dato inválido en el formulario — error en el campo, sin llamar a la API.
- 400 del server, valor rechazado — mensaje del server en el formulario.
- 403 forbidden — mensaje del server y refresco de la sesión.
- Respuesta con forma inválida — error genérico, sin romper la pantalla.
- Sin sesión — redirección a `/login`, no autorizado.

**Required tests**
- [ ] `test_web_configuracion_muestra_valores_y_obligatorios` — validates AC-01, AC-12
- [ ] `test_web_admin_guarda_configuracion` — validates AC-02, AC-04, AC-06
- [ ] `test_web_hora_invalida_rechazada` — `24:00` no llama a la API (sad path) — validates AC-03
- [ ] `test_web_aviso_faltantes_y_desaparece` — validates AC-10, AC-11
- [ ] `test_web_valor_rechazado_por_server_muestra_error` — 400 → mensaje (sad path) — validates AC-05, AC-07
- [ ] `test_web_editor_consulta_solo_lectura` — validates AC-13
- [ ] `test_web_guardado_forbidden_muestra_error` — 403 → mensaje (sad path)
- [ ] `test_web_respuesta_invalida_error_generico` — forma inesperada → error (sad path)
- [ ] `test_web_ruta_configuracion_sin_sesion_no_autorizado` — sin sesión → `/login`; los tres perfiles entran (sad path)

**Completion criterion**
Los 9 tests pasan, la suite web sigue en verde y `npm run typecheck` y `npm run lint` pasan.

## Final verification
- Suite completa en verde con cobertura ≥ 80% en líneas, ramas y funciones.
- `npm run lint` y `npm run typecheck` limpios.
- `validate_spec.py --tier FEATURE` pasa sobre este documento.
- Los 52 Required tests existen con su identificador `test_...`.
- Los 15 criterios de aceptación del PRD quedan cubiertos por al menos un test.
