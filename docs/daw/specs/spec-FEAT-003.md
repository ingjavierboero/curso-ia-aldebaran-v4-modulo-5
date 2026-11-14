# Spec FEAT-003: Chequeo de salud de la app y los jobs

| Field | Value |
|-------|-------|
| Ticket | FEAT-003 |
| PRD | docs/daw/prd/prd-FEAT-003.md |
| Tier | FEATURE |
| Date | 2026-11-14 |
| Spec loops | 1 |
| Loops since last human decision | 1 |

## Summary
Se agrega un dominio `health` con la definición de procesos, sus corridas y una evaluación pura del
estado. La aplicación suma un registro de procesos en memoria, un envoltorio que ejecuta y graba cada
corrida, el caso de uso `GetHealth` y `PeekSession`, una validación de sesión que no la renueva. La
infraestructura suma la tabla `job_runs` y un sondeo de la base sobre una conexión dedicada de solo
lectura (ADR-005). `GET`/`HEAD /api/health` es pública y da detalle solo con sesión. La web muestra
un banner en la pantalla principal. Hoy no hay procesos registrados: la base queda lista para los
que vengan.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 3 |
| FR-02 | Block 2, Block 3 |
| FR-03 | Block 1, Block 2 |
| FR-04 | Block 1, Block 2 |
| FR-05 | Block 1, Block 2 |
| FR-06 | Block 1 |
| FR-07 | Block 4 |
| NFR-01 | Block 2 — `SqliteDatabaseProbe` con `busy_timeout = 500` en una conexión dedicada (ADR-005); si la base no está disponible, `GetHealth` no consulta `job_runs` |
| NFR-02 | Block 3 — la respuesta sin sesión es exactamente `{"status": ...}`, verificado por test |
| NFR-03 | Block 3 — 200 para "ok", 503 para "degradado" |
| NFR-04 | Block 4 — `HealthBanner` consulta al montar y cada 60 s con `setInterval`, limpiado al desmontar |

## Dependencies between blocks
Block 1 → Block 2 → Block 3 → Block 4. El Block 2 usa el dominio y el repositorio del Block 1; el
Block 3 expone los casos de uso del Block 2; el Block 4 consume el endpoint del Block 3.

## Block 1 — Dominio de salud y persistencia de corridas

**Files**
- `server/src/domain/health/JobDefinition.ts` (new) — nombre (no vacío, ≤ 64 caracteres) e `intervalMs` (entero > 0); el constructor rechaza lo inválido.
- `server/src/domain/health/JobCatalog.ts` (new) — colección de definiciones que rechaza un nombre repetido (invariante de negocio).
- `server/src/domain/health/JobRun.ts` (new) — `jobName`, `startedAt`, `finishedAt`, `outcome: 'ok' | 'error'`.
- `server/src/domain/health/JobRunRepository.ts` (new) — puerto síncrono: `record(run)`, `findLatest(jobName)`, `findLatestSuccess(jobName)`.
- `server/src/domain/health/HealthEvaluation.ts` (new) — función pura `evaluateHealth({ now, systemStartedAt, dbAvailable, jobs })` donde cada job trae su definición, su última corrida y su última corrida exitosa.
- `server/src/domain/health/errors.ts` (new) — `InvalidJobDefinition`, `DuplicateJobName`.
- `server/src/infrastructure/db/schema.ts` (modified) — tabla `job_runs`; `jobRuns` se suma al objeto `schema`.
- `server/drizzle/0001_*.sql`, `server/drizzle/meta/0001_snapshot.json`, `server/drizzle/meta/_journal.json` (new/modified) — migración generada con `npm run db:generate -w server`.
- `server/src/infrastructure/db/DrizzleJobRunRepository.ts` (new) — implementación síncrona del puerto (ADR-003).
- `server/test/support/InMemoryJobRunRepository.ts` (new) — doble para tests de aplicación.
- `server/test/domain/HealthEvaluation.test.ts`, `server/test/domain/JobDefinition.test.ts` (new), `server/test/infrastructure/DrizzleJobRunRepository.test.ts` (new), `server/test/infrastructure/migrate.test.ts` (modified).

**Logic**
Implements FR-03, FR-04, FR-05 y FR-06. `evaluateHealth` marca un job como atrasado cuando
`now - (lastSuccess?.finishedAt ?? systemStartedAt) > 2 * intervalMs`; el estado general es
"degradado" si `dbAvailable` es falso, si algún job está atrasado o si la última corrida de algún job
tiene `outcome = 'error'`. Con `dbAvailable` falso, los jobs se informan sin datos de corrida y sin
marca de atraso.

**Data model**
- Entity `job_runs`: `id` (text, PK), `job_name` (text, NOT NULL), `started_at` (text ISO 8601, NOT NULL), `finished_at` (text ISO 8601, NOT NULL), `outcome` (text, NOT NULL, CHECK `outcome IN ('ok','error')`). Index `job_runs_job_outcome_finished_idx` on (`job_name`, `outcome`, `finished_at`). No se guarda el mensaje de error del job (R-07).
- Rollback: la migración solo crea una tabla nueva que ningún código previo lee; revertir el PR y borrar `job_runs` (`DROP TABLE job_runs` más la entrada del journal) deja la base como estaba, sin tocar `users` ni `sessions`.

**Input validation**
- `JobDefinition.name`: string, trim no vacío, máximo 64 caracteres.
- `JobDefinition.intervalMs`: entero, mayor que 0.

**Error handling**
- Nombre de proceso vacío o intervalo menor o igual a cero — `InvalidJobDefinition`; no se crea la definición.
- Nombre de proceso repetido en el catálogo — `DuplicateJobName`; el catálogo queda igual.
- `outcome` fuera de `ok`/`error` al insertar — la base lo rechaza por CHECK.

**Required tests**
- [ ] `test_job_atrasado_tras_dos_intervalos_sin_exito` — validates AC-10
- [ ] `test_job_sin_corridas_cuenta_desde_el_arranque` — validates AC-11
- [ ] `test_ultima_corrida_con_error_degrada` — validates AC-06
- [ ] `test_base_no_disponible_degrada_y_omite_corridas` — validates AC-05
- [ ] `test_todo_sano_estado_ok` — validates AC-01
- [ ] `test_intervalo_invalido_rechazado` — intervalo 0 y negativo (sad path) — validates AC-08
- [ ] `test_nombre_duplicado_rechazado` — (sad path) — validates AC-07
- [ ] `test_outcome_invalido_rechazado_por_la_base` — CHECK de `job_runs` (sad path) — validates AC-09
- [ ] `test_repositorio_guarda_y_devuelve_ultima_corrida` — inicio, fin y resultado, última y última exitosa — validates AC-09

**Completion criterion**
Los 9 tests pasan, la migración crea `job_runs` con su CHECK e índice (verificado en `migrate.test.ts`) y lint y typecheck dan 0.

## Block 2 — Casos de uso, sondeo y sesión de solo lectura

**Files**
- `server/src/application/health/JobRegistry.ts` (new) — contenedor en memoria de un `JobCatalog`, que llena el composition root.
- `server/src/application/health/RunTrackedJob.ts` (new) — `run(name, fn)`: rechaza nombres no registrados, ejecuta `fn` (puede ser async), graba la corrida con inicio, fin y resultado en una sola escritura al terminar, y relanza el error de `fn` si lo hubo; un fallo al grabar no reemplaza el error del job.
- `server/src/application/health/DatabaseProbe.ts` (new) — puerto síncrono `isAvailable(): boolean`.
- `server/src/application/health/GetHealth.ts` (new) — sondea la base; solo si está disponible consulta `job_runs`; evalúa con `evaluateHealth`.
- `server/src/application/auth/PeekSession.ts` (new) — `execute(token): PublicUser | null`; mismas reglas que `AuthenticateSession` pero sin `touch` y sin borrar sesiones.
- `server/src/application/auth/AuthenticateSession.ts` (modified) — extrae la validación común a una función compartida con `PeekSession`, sin cambiar su comportamiento.
- `server/src/infrastructure/db/SqliteDatabaseProbe.ts` (new) — conexión `readonly` propia con `busy_timeout = 500` y `SELECT 1 FROM sqlite_master LIMIT 1` (ADR-005).
- `server/test/support/FakeDatabaseProbe.ts` (new), `server/test/support/authContext.ts` (modified) — suma `PeekSession`.
- `server/test/application/GetHealth.test.ts`, `RunTrackedJob.test.ts`, `PeekSession.test.ts` (new), `server/test/infrastructure/SqliteDatabaseProbe.test.ts` (new).

**Logic**
Implements FR-02, FR-04 y FR-05, y la parte de aplicación de FR-03. `systemStartedAt` lo fija el
composition root con `clock.now()` al arrancar.

**Data model**
- Reuses `job_runs` from Block 1 — no schema change; constraints as declared there: NOT NULL en todas las columnas, CHECK `outcome IN ('ok','error')`, index on (`job_name`, `outcome`, `finished_at`).

**Input validation**
- `RunTrackedJob.run(name, fn)`: `name` tiene que estar registrado en `JobRegistry`.
- `PeekSession.execute(token)`: string; vacío o inexistente devuelve `null`.

**Error handling**
- Nombre de proceso no registrado en `RunTrackedJob` — error `UnknownJob`; `fn` no se ejecuta y no se graba nada.
- El job falla — se graba la corrida con `outcome = 'error'` y se relanza el error original.
- Falla la grabación de la corrida — se relanza el error del job si lo hubo; si el job fue exitoso, se relanza el error de grabación.
- La base no responde en 500 ms o el archivo es ilegible — `isAvailable()` devuelve `false`; el error de SQLite no sale del adaptador.
- Token inválido, vencido o de usuario Inactivo en `PeekSession` — devuelve `null`; la sesión no se modifica.

**Required tests**
- [ ] `test_get_health_con_base_caida_no_consulta_corridas` — validates AC-05
- [ ] `test_get_health_detalle_por_proceso` — validates AC-03
- [ ] `test_run_tracked_job_graba_inicio_fin_y_resultado` — validates AC-09
- [ ] `test_run_tracked_job_nombre_no_registrado_rechazado` — (sad path) — validates AC-07
- [ ] `test_run_tracked_job_error_del_job_se_graba_y_se_relanza` — (sad path) — validates AC-06
- [ ] `test_run_tracked_job_falla_de_grabacion_no_oculta_error_del_job` — (sad path) — validates AC-09
- [ ] `test_probe_base_bloqueada_no_disponible_en_menos_de_un_segundo` — base con un lock exclusivo tomado (sad path) — validates AC-14
- [ ] `test_peek_session_token_invalido_rechazado_devuelve_null` — inválido, vencido, usuario Inactivo (sad path) — validates AC-04
- [ ] `test_peek_session_no_renueva_last_activity` — validates AC-03

**Completion criterion**
Los 9 tests pasan; los tests existentes de `AuthenticateSession` siguen pasando sin cambios; lint y typecheck dan 0.

## Block 3 — Endpoint `/api/health`

**Files**
- `server/src/infrastructure/http/routes/health.ts` (new) — el handler.
- `server/src/infrastructure/http/authMiddleware.ts` (modified) — `GET /api/health` y `HEAD /api/health` en `PUBLIC_ROUTES` (coincidencia exacta).
- `server/src/infrastructure/http/app.ts` (modified) — `AppDeps` suma `getHealth` y `peekSession`; monta `healthRoutes`.
- `server/src/main.ts` (modified) — arma `JobRegistry` (vacío), `DrizzleJobRunRepository`, `SqliteDatabaseProbe`, `GetHealth` (con `systemStartedAt`) y `PeekSession`.
- `server/test/support/testApp.ts` (modified) — deps nuevas con dobles.
- `server/test/http/health.test.ts` (new), `server/test/http/middleware.test.ts` (modified) — variantes de la ruta pública nueva.

**Logic**
Implements FR-01 y la parte HTTP de FR-02. La ruta lee la cookie con `readSessionToken` y llama a
`PeekSession`; no usa `req.user`, no lanza `Unauthenticated`, no emite `Set-Cookie` y no loguea
`session_rejected`.

**API contract**
- Method + path: `GET /api/health` y `HEAD /api/health`
- Request: sin body ni parámetros; cookie `aldebaran_sid` opcional.
- Response sin sesión válida: `{ "status": "ok" | "degradado" }` y nada más. Response con sesión válida: `{ "status", "db": "disponible" | "no_disponible", "jobs": [{ "name": string, "lastRunAt": string | null, "lastOutcome": "ok" | "error" | null, "late": boolean }] }`. `HEAD` responde el mismo código sin body.
- Error codes: 200 (ok), 503 (degradado); cualquier otro método o variante de ruta sin sesión → 401 como el resto de `/api`.
- Auth: pública; el detalle exige una sesión válida, verificada con `PeekSession` sin renovarla.

**Input validation**
- Cookie `aldebaran_sid`: string opcional; cualquier valor que no corresponda a una sesión válida se trata como ausente.

**Error handling**
- Cookie inválida o vencida — respuesta anónima (sin detalle), sin 401 y sin borrar la cookie.
- Base no disponible — 503 `degradado` en menos de 1 s, nunca 500.
- Variante de la ruta (`/api/health/`, `POST`, mayúsculas) sin sesión — 401, el deny-by-default no cambia.

**Required tests**
- [ ] `test_health_sin_sesion_ok_200_solo_status` — body exacto `{status:"ok"}` — validates AC-01
- [ ] `test_health_sin_sesion_degradado_503_solo_status` — validates AC-02
- [ ] `test_health_con_sesion_trae_detalle` — validates AC-03
- [ ] `test_health_cookie_invalida_rechazada_responde_anonimo_sin_401` — sin `Set-Cookie` (sad path) — validates AC-04
- [ ] `test_health_base_caida_503_en_menos_de_un_segundo` — (sad path) — validates AC-05, AC-14
- [ ] `test_health_variantes_de_ruta_no_autorizado_401` — `/api/health/`, `POST`, `/API/HEALTH` (sad path) — validates AC-01
- [ ] `test_health_head_responde_codigo_sin_body` — validates AC-02

**Completion criterion**
Los 7 tests pasan, los tests existentes de `middleware.test.ts` siguen pasando y el resto de `/api` sigue exigiendo sesión.

## Block 4 — Banner de salud en la pantalla principal

**Files**
- `web/src/api/healthApi.ts` (new) — `getHealth()` con su propio `fetch` (`credentials: 'include'`), que acepta 200 y 503 como respuestas válidas y lee el body; otro código o un fallo de red lanza `NetworkError`.
- `web/src/api/types.ts` (modified) — tipos `HealthResponse`.
- `web/src/components/HealthBanner.tsx` (new) — antd `Alert` de tipo `warning` que nombra lo degradado ("Base de datos" y el nombre de cada proceso atrasado o con error); consulta al montar y cada 60 s; limpia el intervalo y descarta respuestas tardías al desmontar.
- `web/src/pages/HomePage.tsx` (modified) — renderiza `HealthBanner`.
- `web/src/test/fetchMock.ts` (modified) — respuesta `HEALTH_OK`.
- `web/src/components/HealthBanner.test.tsx` (new), `web/src/pages/HomePage.test.tsx` y `web/src/pages/LoginPage.test.tsx` (modified) — suman la ruta `GET /api/health` a su `mockFetch`.

**Logic**
Implements FR-07 y NFR-04. Un 200 sin detalle (sesión perdida) no muestra banner ni navega: el flujo
de sesión de FEAT-001 sigue decidiendo. Un error de red conserva el último estado mostrado y no
reintenta fuera del intervalo.

**API contract**
- Method + path: `GET /api/health` (consumido; definido en el Block 3)
- Request: sin body; `credentials: 'include'` para enviar la cookie de sesión.
- Response: `{ "status": "ok" | "degradado", "db"?: "disponible" | "no_disponible", "jobs"?: [{ "name", "lastRunAt", "lastOutcome", "late" }] }`.
- Error codes: 200 y 503 son respuestas válidas; cualquier otro código o un fallo de red → `NetworkError`.
- Auth: la pantalla principal ya exige sesión; el detalle llega porque la cookie viaja con la consulta.

**Input validation**
- Respuesta de `/api/health`: `status` tiene que ser `ok` o `degradado`; un body con otra forma se trata como error de red.

**Error handling**
- Error de red o respuesta con forma inválida — el banner conserva el último estado y no rompe la pantalla.
- Respuesta tardía después de desmontar — se descarta.

**Required tests**
- [ ] `test_banner_visible_con_estado_degradado_nombra_lo_degradado` — validates AC-12
- [ ] `test_banner_oculto_con_estado_ok` — validates AC-13
- [ ] `test_banner_se_actualiza_cada_60_segundos` — fake timers — validates AC-12
- [ ] `test_banner_error_de_red_conserva_ultimo_estado` — también con un body de forma inválida (sad path) — validates AC-13
- [ ] `test_banner_respuesta_tardia_rechazada_tras_desmontar` — (sad path) — validates AC-13

**Completion criterion**
Los 5 tests pasan y los tests existentes de `HomePage` y `LoginPage` siguen pasando con la ruta nueva en su `mockFetch`.

## Final verification
- `npm run lint`, `npm run typecheck` y `npm test` terminan sin errores.
- El CI del PR de FEAT-003 termina en verde.
- `validate_spec.py --tier FEATURE` pasa sobre este documento y `validate_threat.py` pasa contra él.
