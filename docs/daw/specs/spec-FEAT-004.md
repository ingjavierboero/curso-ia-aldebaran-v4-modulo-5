# Spec FEAT-004: Banner de salud con sesión inválida y errores de lectura visibles

| Field | Value |
|-------|-------|
| Ticket | FEAT-004 |
| PRD | docs/daw/prd/prd-FEAT-004.md |
| Tier | FEATURE |
| Date | 2026-11-14 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Server: la evaluación de salud aprende un tercer estado por proceso, "lectura fallida", modelado
como unión discriminada en la entrada del dominio. `GetHealth` lee las corridas de cada proceso en
su propio `try/catch`; un fallo marca solo ese proceso y se informa por un puerto de aplicación
nuevo, `HealthEventLog`, cuyo adaptador escribe una línea JSON sin texto de error. La disponibilidad
de la base sale solo del sondeo. El detalle de `GET /api/health` suma `readFailed` por proceso.
Web: `NetworkError` distingue "sin respuesta" de "el servidor respondió 5xx" con un `status`. El
banner, ante "degradado" sin detalle, confirma la sesión con `getSession()`: si resuelve o da 5xx →
"Base de datos"; si da 401 → el camino común ya lleva al login y el banner se oculta; si no hay
respuesta → conserva lo último. Nombra también los procesos con `readFailed`.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 3 |
| FR-02 | Block 3 |
| FR-03 | Block 3 |
| FR-04 | Block 3 |
| FR-05 | Block 1, Block 2 |
| FR-06 | Block 1, Block 2 |
| FR-07 | Block 3 |
| NFR-01 | Strategy: la confirmación se llama solo dentro de la rama "degradado sin `db` ni `jobs`" del banner, una vez por consulta de salud (Block 3, test_banner_no_confirma_sesion_con_ok_ni_con_detalle) |
| NFR-02 | Strategy: `errorType` nunca entra en `JobHealth`; el detalle HTTP solo suma el booleano `readFailed`; la respuesta anónima sigue siendo `{ status }` (Block 2, test_health_lectura_fallida_respuesta_sin_texto_de_error) |
| NFR-03 | Strategy: el puerto `HealthEventLog.jobReadFailed` solo recibe `{ jobName, errorType }`; el adaptador agrega `event` y `at` y nada más (Block 2, test_health_event_log_registro_sin_datos_de_sesion) |

## Dependencies between blocks
Block 2 depende de Block 1 (usa el puerto y la forma nueva de `JobHealth`). Block 3 depende de
Block 2 (consume `readFailed` del contrato HTTP). Orden: 1 → 2 → 3.

## Block 1 — Dominio y aplicación: lectura fallida por proceso

**Files**
- `server/src/domain/health/HealthEvaluation.ts` (modified) — `JobHealthInput` pasa a ser
  `{ definition; readFailed: true } | { definition; readFailed: false; lastRun; lastSuccess }`;
  `JobHealth` suma `readFailed: boolean`; la evaluación cuenta `readFailed` como degradado.
- `server/src/application/health/HealthEventLog.ts` (new) — puerto
  `jobReadFailed(event: { jobName: string; errorType: string }): void`. Contrato documentado:
  nunca lanza.
- `server/src/application/health/GetHealth.ts` (modified) — deps suma `log: HealthEventLog`;
  `try/catch` por proceso; `dbAvailable = probe.isAvailable()`; docstrings actualizados (ya no dicen
  que un fallo de lectura deja la base no disponible).
- `server/test/support/RecordingHealthEventLog.ts` (new) — doble que guarda los eventos.
- `server/test/domain/HealthEvaluation.test.ts` (modified) — helper `job()` y casos nuevos.
- `server/test/application/GetHealth.test.ts` (modified) — construye `GetHealth` con `log`.

**Logic**
Implements FR-05 y FR-06 del lado de la aplicación.
- `evaluateJob` con `readFailed: true` → `{ name, lastRunAt: null, lastOutcome: null, late: false,
  readFailed: true }`. Con `readFailed: false` → igual que hoy más `readFailed: false`.
- `degraded = jobs.some(j => j.late || j.lastOutcome === 'error' || j.readFailed)`.
- Rama base no disponible: igual que hoy, con `readFailed: false` en cada proceso.
- `GetHealth.execute()`: si el sondeo da `false`, no lee nada (como hoy). Si da `true`, por cada
  definición intenta `findLatest` y `findLatestSuccess`; si cualquiera lanza, ese proceso queda
  `{ definition, readFailed: true }` y se llama `log.jobReadFailed({ jobName, errorType })`, con
  `errorType = err instanceof Error ? err.name : typeof err`. **Nunca** se pasa `err.message` (puede
  traer el valor guardado). La llamada al puerto va envuelta en su propio `try/catch` vacío:
  `execute()` sigue sin lanzar aunque el log falle.

**Data model**
- Sin cambios de esquema. Reuses `job_runs` from FEAT-003 — no schema change; constraints as
  declared there: `id` PK NOT NULL, `job_name` NOT NULL, `started_at` NOT NULL, `finished_at` NOT
  NULL, `outcome` NOT NULL con CHECK IN ('ok','error'), index on (`job_name`, `outcome`,
  `finished_at`).

**Error handling**
- Falla la lectura de las corridas de un proceso — ese proceso queda degradado por lectura fallida,
  se registra por el puerto y los demás se evalúan normalmente; la base se informa disponible.
- Falla el propio puerto de log — se ignora; `execute()` devuelve el reporte igual, sin lanzar.

**Required tests**
- [ ] test_evaluacion_lectura_fallida_degrada_el_proceso — validates AC-06
- [ ] test_evaluacion_lectura_fallida_sin_corrida_ni_atraso — validates AC-06
- [ ] test_get_health_lectura_fallida_marca_solo_ese_proceso — validates AC-06, AC-07 (error path)
- [ ] test_get_health_lectura_fallida_registra_nombre_y_tipo_de_error — validates AC-08 (error path)
- [ ] test_get_health_lectura_fallida_no_registra_mensaje_de_error — validates AC-09
- [ ] test_get_health_log_que_lanza_error_no_rompe_el_reporte — the failing log is swallowed (error path)
- [ ] test_get_health_base_no_disponible_no_lee_corridas — regresión de FEAT-003 (sondeo en false)

**Completion criterion**
Los tests de dominio y aplicación pasan; `npm run typecheck` no da errores en `server/`.

## Block 2 — Infraestructura del server: log, error tipado y contrato HTTP

**Files**
- `server/src/infrastructure/logging/healthEventLog.ts` (new) —
  `createHealthEventLog(logger: Logger, clock: Clock): HealthEventLog`; importa `Logger` de
  `infrastructure/http/authLog.ts` (mover `Logger` queda como deuda, fuera de alcance).
- `server/src/infrastructure/db/parseIsoDate.ts` (modified) — lanza `InvalidStoredDate` (nuevo,
  `name = 'InvalidStoredDate'`, mismo mensaje) en lugar de `Error`, para que `errorType` diga qué
  pasó.
- `server/src/infrastructure/http/routes/health.ts` (modified) — `detailOf` suma `readFailed`.
- `server/src/main.ts` (modified) — `new GetHealth({ ..., log: createHealthEventLog(logger, clock) })`.
- `server/test/support/testApp.ts` (modified) — línea 91: pasa `log` al construir `GetHealth`, con
  el mismo `logger` de captura del test.
- `server/test/http/health.test.ts` (modified) — casos nuevos y fixtures con `readFailed`.
- `server/test/infrastructure/healthEventLog.test.ts` (new).
- `server/test/infrastructure/parseIsoDate.test.ts` (new, o el existente si lo hay) — nombre del error.

**Logic**
Implements FR-05 y FR-06 del lado de infraestructura.
- Adaptador: `jobReadFailed({ jobName, errorType })` →
  `logger.error({ event: 'health_job_read_failed', job: jobName, errorType, at: clock.now().toISOString() })`,
  dentro de `try/catch` vacío (contrato "nunca lanza").
- `InvalidStoredDate extends Error` en `parseIsoDate.ts`; el resto de quienes lo usan (repos de
  sesiones/usuarios) no cambia: siguen recibiendo un `Error`.

**API contract**
- Method + path: `GET /api/health` (y `HEAD`, sin body), sin cambios de ruta.
- Request: sin body; cookie `aldebaran_sid` opcional (como en FEAT-003).
- Response: sin sesión válida o con la base no disponible → `{ status }`, sin cambios. Con sesión
  válida y base disponible → `{ status, db, jobs: [{ name: string, lastRunAt: string|null,
  lastOutcome: 'ok'|'error'|null, late: boolean, readFailed: boolean }] }`. Con `readFailed: true`:
  `lastRunAt` y `lastOutcome` en `null`, `late` en `false`.
- Error codes: 200 con "ok", 503 con "degradado" (sin cambios); un proceso con lectura fallida da 503.
- Auth: pública; el detalle exige sesión válida vía `PeekSession` (sin cambios).

**Data model**
- Reuses `job_runs` from FEAT-003 — no schema change; constraints as declared there: `id` PK NOT
  NULL, `job_name` NOT NULL, `started_at` NOT NULL, `finished_at` NOT NULL, `outcome` NOT NULL con
  CHECK IN ('ok','error'), index on (`job_name`, `outcome`, `finished_at`).

**Input validation**
- Cookie `aldebaran_sid`: la lee `readSessionToken` y la valida `PeekSession`, sin cambios; un token
  ausente, vacío o inválido da la respuesta anónima.

**Error handling**
- Lectura fallida de un proceso — 503 con `readFailed: true` en ese proceso; el texto del error no
  sale en la respuesta (NFR-02).
- Fecha inválida guardada en `job_runs` — `InvalidStoredDate`; se registra con
  `errorType: "InvalidStoredDate"`.
- Falla la escritura del log — se ignora en el adaptador; la ruta responde igual.

**Required tests**
- [ ] test_health_lectura_fallida_responde_503_con_read_failed — validates AC-06 (error path)
- [ ] test_health_lectura_fallida_respuesta_sin_texto_de_error — validates AC-09 (error path)
- [ ] test_health_lectura_fallida_anonima_solo_status — validates AC-09, NFR-02
- [ ] test_health_fecha_invalida_registra_invalid_stored_date — validates AC-08 (error path)
- [ ] test_health_event_log_registro_sin_datos_de_sesion — validates AC-11
- [ ] test_health_event_log_error_de_escritura_no_lanza — the failing write is swallowed (error path)
- [ ] test_parse_iso_date_invalida_lanza_invalid_stored_date — validates AC-08

**Completion criterion**
Los tests HTTP e infraestructura pasan, incluidos los de FEAT-003 con `readFailed: false` en sus
fixtures; `npm run typecheck` y `npm run lint` sin errores.

## Block 3 — Web: confirmación de sesión y procesos con lectura fallida

**Files**
- `web/src/api/authApi.ts` (modified) — `NetworkError` suma `readonly status: number | null`
  (constructor `new NetworkError(status = null)`); `request` lanza `new NetworkError(response.status)`
  ante 5xx y `new NetworkError()` ante un fallo de `fetch` o un body ilegible. Mensaje y `name` sin
  cambios: el resto de la app no se entera.
- `web/src/api/types.ts` (modified) — `HealthJob` suma `readFailed: boolean`.
- `web/src/api/healthApi.ts` (modified) — `isHealthJob` exige `readFailed` booleano.
- `web/src/components/HealthBanner.tsx` (modified) — confirmación de sesión y `readFailed`.
- `web/src/components/HealthBanner.test.tsx` (modified) — fixtures con `readFailed` y casos nuevos.
- `web/src/pages/HomePage.test.tsx` (modified) — el caso "degradado sin detalle" ahora pasa por la
  confirmación de sesión (mock de `/api/auth/session` en 200).
- `web/src/api/authApi.test.ts` (modified, o new si no existe) — `status` de `NetworkError`.

**Logic**
Implements FR-01 a FR-04 y FR-07.
- `degradedNames(health)`: con detalle, suma los procesos con `late`, `lastOutcome === 'error'` o
  `readFailed`.
- En `check()`, cuando `health.status === 'degradado'` y llegan sin `db` ni `jobs`: llamar
  `getSession()` una vez (navegación por defecto ante 401). Al resolver, si
  `controller.signal.aborted` → descartar; si no → `setNames(['Base de datos'])`. Al rechazar (y no
  abortada): `ApiError` 401 → `setNames(null)` (el camino común ya llevó al login);
  `NetworkError` con `status !== null` → `setNames(['Base de datos'])`; `NetworkError` sin status o
  cualquier otro error → no tocar `names`.
- Con "ok" o con detalle no se llama `getSession()` (NFR-01).
- La navegación ante 401 ocurre dentro de `request` y no se puede cancelar con el `AbortController`
  del banner; queda aceptado.

**Input validation**
- Respuesta de `/api/health`: `isHealthJob` exige `name` string, `lastRunAt` string|null,
  `lastOutcome` 'ok'|'error'|null, `late` boolean y `readFailed` boolean; cualquier otra forma es
  `NetworkError` (como hoy).

**Error handling**
- La confirmación de sesión responde 401 — no se muestra el banner; el usuario va al login.
- La confirmación de sesión responde 5xx — el banner nombra "Base de datos".
- La confirmación de sesión no obtiene respuesta (error de red) — se conserva lo último.
- Respuesta de salud con un proceso sin `readFailed` booleano — inválida, se conserva lo último.

**Required tests**
- [ ] test_banner_degradado_sin_detalle_confirma_sesion_una_vez — validates AC-01
- [ ] test_banner_sesion_no_autorizada_lleva_al_login_sin_banner — validates AC-02 (error path)
- [ ] test_banner_sesion_valida_nombra_base_de_datos — validates AC-03
- [ ] test_banner_confirmacion_error_de_red_conserva_ultimo — validates AC-04 (error path)
- [ ] test_banner_confirmacion_error_del_servidor_nombra_base_de_datos — validates AC-12 (error path)
- [ ] test_banner_no_confirma_sesion_con_ok_ni_con_detalle — validates AC-05
- [ ] test_banner_nombra_proceso_con_lectura_fallida — validates AC-10
- [ ] test_banner_respuesta_sin_read_failed_invalida_conserva_ultimo — malformed response is rejected (error path)
- [ ] test_banner_confirmacion_tardia_tras_desmontar_se_descarta — abort tras la confirmación
- [ ] test_network_error_5xx_lleva_status — `status` del 5xx en `NetworkError`
- [ ] test_home_muestra_banner_con_estado_degradado — regresión de FEAT-003 con la confirmación

**Completion criterion**
Los tests de web pasan, incluidos los de FEAT-003; `npm run typecheck` y `npm run lint` sin errores.

## Final verification
`npm test`, `npm run typecheck` y `npm run lint` en verde. Con una corrida de fecha ilegible en
`job_runs`, `GET /api/health` con sesión responde 503, `db: "disponible"` y ese proceso con
`readFailed: true`, y el log tiene una línea `health_job_read_failed` con
`errorType: "InvalidStoredDate"` sin el valor guardado. Con la sesión vencida y "degradado" sin
detalle, la pantalla principal va al login.
