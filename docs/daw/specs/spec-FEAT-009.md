# Spec FEAT-009: Límite de intentos en login, primer Admin y cambio de contraseña

| Field | Value |
|-------|-------|
| Ticket | FEAT-009 |
| PRD | docs/daw/prd/prd-FEAT-009.md |
| Tier | FEATURE |
| Date | 2026-11-15 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Una regla pura del dominio (`AttemptWindow`) cuenta los fallos confirmados por IP y bloquea en el
momento del 5.º fallo dentro de 15 minutos, durante 15 minutos. Un registro en memoria por operación
(`AttemptTracker`, con `Clock` inyectado) guarda ese estado por clave de IP. `express-rate-limit`
(`^8.7.2`) queda como compuerta reconocida por CodeQL: su Store no cuenta, solo consulta al registro
si la clave está bloqueada, y en ese caso corta con 429 antes del handler (sin hash). Las rutas
informan `fail`/`succeed` al registro cuando conocen el resultado (ADR-006). Los limitadores se crean
dentro de `createApp`, uno por operación. Sin cambios de esquema: todo vive en memoria (D-05).
La rama sale de `feat/FEAT-007-cambio-de-contrasena` y el PR apunta a ella.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 2 |
| FR-02 | Block 2 |
| FR-03 | Block 2 |
| FR-04 | Block 2 |
| FR-05 | Block 1, Block 2 |
| FR-06 | Block 1, Block 2 |
| FR-07 | Block 1, Block 2 |
| FR-08 | Block 1, Block 2 |
| FR-09 | Block 2 |
| FR-10 | Block 1, Block 2 |
| FR-11 | Block 3 |
| NFR-01 | Strategy: la compuerta rechaza antes del handler de la ruta, así que el caso de uso (y argon2) no corre; se prueba con un doble del caso de uso que cuenta llamadas, más una cota holgada de tiempo; Block 2 |
| NFR-02 | Strategy: `AttemptTracker` guarda un `Map` en memoria creado en cada `createApp`; 0 accesos a la base; un `createApp` nuevo simula el reinicio; Block 1 y Block 2 |
| NFR-03 | Strategy: barrido amortizado (como máximo uno por minuto según el `Clock`) que descarta claves sin fallos dentro de la ventana y sin bloqueo vigente; `size()` para observarlo; Block 1 |

| Acceptance criterion | Covered by |
|---|---|
| AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-14 | Block 2 (y Block 1 para la regla de AC-01, AC-02, AC-03, AC-09, AC-10) |
| AC-15 | Block 1 |
| AC-13 | Block 3 |

## Dependencies between blocks
Block 2 depende de Block 1 (usa el registro y la compuerta). Block 3 depende de Block 2 (el 429 real).
Orden: 1 → 2 → 3.

## Block 1 — Regla de intentos, registro en memoria y compuerta

**Files**
- `server/src/domain/auth/AttemptWindow.ts` (new) — constantes `MAX_FAILURES = 5`, `WINDOW_MS = 15 min`, `BLOCK_MS = 15 min`; tipo `AttemptState = { failures: readonly number[]; blockedUntil: number | null }`; funciones puras `emptyAttemptState()`, `isBlocked(state, now)`, `recordFailure(state, now)`, `isIdle(state, now)`, `retryAfterMinutes(remainingMs)`.
- `server/src/infrastructure/http/rateLimit/AttemptTracker.ts` (new) — registro por operación: `Map<string, AttemptState>` con `Clock`; `check(key) → { blocked: boolean; blockedUntil: Date | null }`, `fail(key)`, `succeed(key)`, `size()`; barrido amortizado.
- `server/src/infrastructure/http/rateLimit/attemptGate.ts` (new) — `attemptKey(req)` (`ipKeyGenerator(req.ip ?? '')`), `TrackerStore` (implementa `Store` de express-rate-limit consultando al registro) y `createAttemptGate({ operation, tracker, clock, logger, emailOf })`, que devuelve el middleware de `rateLimit(...)` (import default).
- `server/src/infrastructure/http/authLog.ts` (modified) — `AuthOutcome` suma `'blocked'`.
- `server/package.json` y `package-lock.json` (raíz) (modified) — dependencia `express-rate-limit` `^8.7.2`.
- `server/test/domain/AttemptWindow.test.ts` (new), `server/test/infrastructure/AttemptTracker.test.ts` (new), `server/test/infrastructure/attemptGate.test.ts` (new) — tests.

**Logic**
Implementa la regla de FR-01, FR-05, FR-06, FR-07, FR-08 y FR-10. `recordFailure(state, now)`: si está
bloqueado, devuelve el mismo estado (un intento bloqueado nunca se registra); si no, descarta los
fallos con más de `WINDOW_MS`, agrega `now` y, si quedan `MAX_FAILURES`, devuelve
`{ failures: [], blockedUntil: now + BLOCK_MS }` (bloqueo decidido en el 5.º fallo, 15 minutos desde
él). `isBlocked`: `blockedUntil !== null && now < blockedUntil`. `isIdle`: no bloqueado y sin fallos
dentro de la ventana. `retryAfterMinutes(ms)`: `Math.ceil(ms / 60_000)`, mínimo 1. Solo cuentan los
fallos que la ruta confirma con `fail`; los pedidos en curso no cuentan (intentos concurrentes desde
la misma IP pueden verificar contraseña antes de que el 5.º fallo bloquee — aceptado: lo acota el
número de pedidos simultáneos). `succeed(key)` borra la clave (FR-08). El barrido corre dentro de
`check`/`fail` como máximo una vez por minuto y borra las claves `isIdle`. `TrackerStore`:
`increment(key)` devuelve `{ totalHits: blocked ? 2 : 1, resetTime: blockedUntil ?? undefined }`
(con `limit: 1` la librería corta solo a los bloqueados); `decrement` no hace nada; `resetKey(key)`
llama a `succeed`; `localKeys: true`. `createAttemptGate` usa `limit: 1`, `windowMs: WINDOW_MS`,
`keyGenerator: attemptKey`, `standardHeaders: false`, `legacyHeaders: false` y un `handler` que
calcula los segundos restantes con el `Clock` inyectado, responde 429 con `Retry-After` y
`{ error: "Demasiados intentos. Probá de nuevo en N minutos." }` (`N` = `retryAfterMinutes`), y
registra `logAuthAttempt(logger, clock, req, operation, 'blocked', emailOf(req))`. `emailOf` lee con
guardas: nunca lanza (body que no es objeto → `''`).

**Data model**
- Sin esquema de base: estado en memoria `Map<string, AttemptState>` por operación; clave = `ipKeyGenerator(ip)` (IPv4 tal cual, IPv6 agrupado por subred /56); `failures` con como máximo 4 marcas de tiempo (se vacía al bloquear); `blockedUntil` nullable; sin persistencia (D-05).

**Input validation**
- Clave: la IP la arma el server (`req.ip`, sin `trust proxy`, S-03); una IP ausente se trata como `''` y comparte una clave.
- `emailOf(req)`: devuelve el email del body solo si `req.body` es objeto y `email` es string; si no, `''`.

**Error handling**
- Intento desde una IP bloqueada — 429 con `Retry-After` y el mensaje con los minutos; no se registra como fallo.
- Body del intento bloqueado no es un objeto o no trae email string — el handler registra el bloqueo con email `null` sin lanzar.
- IP ausente en la solicitud — se usa la clave `''`; el límite sigue aplicando (falla cerrado).

**Required tests**
- [ ] `test_attempt_window_bloquea_en_el_quinto_fallo` — 5 fallos dentro de 15 min dejan `blockedUntil = quinto + 15 min` — validates AC-01
- [ ] `test_attempt_window_bloqueo_vence_a_los_15_minutos` — `isBlocked` falso a los 15 min del quinto fallo — validates AC-02
- [ ] `test_attempt_window_fallo_viejo_fuera_de_ventana` — 4 fallos con el primero de hace más de 15 min: el siguiente fallo no bloquea — validates AC-03
- [ ] `test_attempt_window_intento_bloqueado_rechazado_sin_registrar` — `recordFailure` sobre un estado bloqueado no lo cambia y, al vencer, 4 fallos no bloquean (sad path) — validates AC-01
- [ ] `test_attempt_window_retry_after_redondea_hacia_arriba` — 14 min 10 s → 15 — validates AC-09
- [ ] `test_attempt_tracker_succeed_reinicia` — 4 fallos, `succeed`, 4 fallos más no bloquean — validates AC-10
- [ ] `test_attempt_tracker_barrido_descarta_inactivas` — sin tráfico propio, tras más de 30 min y otro acceso, `size()` llega a 0 — validates AC-15
- [ ] `test_attempt_gate_bloqueado_rechazado_429` — con la clave bloqueada responde 429 con `Retry-After = 850` y el mensaje "15 minutos", sin llegar al handler (sad path) — validates AC-08, AC-09
- [ ] `test_attempt_gate_body_invalido_registra_bloqueo` — body no objeto: registra `blocked` con email `null`, sin lanzar (sad path) — validates AC-12
- [ ] `test_attempt_gate_ip_faltante_rechazado` — sin `req.ip` usa la clave `''` y bloquea igual (sad path) — validates AC-01

**Completion criterion**
Los 10 tests pasan, `AttemptWindow` no importa nada fuera de `domain/`, y `npm run typecheck` y
`npm run lint` pasan con la dependencia instalada.

## Block 2 — Compuerta y registro en las tres rutas

**Files**
- `server/src/infrastructure/http/app.ts` (modified) — `createApp` crea tres `AttemptTracker` (login, primer Admin, cambio de contraseña) con `deps.clock` y sus compuertas, y los pasa a `authRoutes` y `setupRoutes`. No entran en `AppDeps`.
- `server/src/infrastructure/http/routes/auth.ts` (modified) — `router.post('/auth/login', gates.login, handler)` y `router.post('/auth/password', gates.passwordChange, handler)`; `fail`/`succeed` según el resultado.
- `server/src/infrastructure/http/routes/setup.ts` (modified) — `router.post('/setup/first-admin', gates.firstAdmin, handler)`; el parseo del body entra al `try`; cualquier error de la ruta llama a `fail`.
- `server/test/http/auth.test.ts` (modified), `server/test/http/setup.test.ts` (modified) — tests.

**Logic**
Implementa FR-01 a FR-10 en HTTP. Login: la compuerta corre primero; en el `catch`, solo
`InvalidCredentials` llama a `trackers.login.fail(attemptKey(req))` (un `InvalidEmail` o un body
inválido no cuentan, FR-02); con éxito, `succeed`. Cambio de contraseña: `authMiddleware` ya corrió a
nivel `/api`, luego la compuerta; solo `IncorrectCurrentPassword` llama a `fail` (FR-03); con éxito,
`succeed`. Primer Admin: el parseo (`bodyObject`, `requiredString`) pasa adentro del `try`; cualquier
error de la ruta (body inválido, datos inválidos, `FirstAdminAlreadyExists`) llama a `fail` (FR-04);
los rechazos del parser JSON (400) y de `requireJson` (415), montados antes en `/api`, no llegan a la
ruta y no cuentan; con éxito, `succeed`. El email del bloqueo: `req.body.email` con guardas en login y
primer Admin; `req.user?.email` en el cambio. Cada operación tiene su propio registro, así que un
bloqueo no afecta a las otras (FR-09).

**API contract**
- Method + path: `POST /api/auth/login`, `POST /api/setup/first-admin`, `POST /api/auth/password` (sin cambios de request/response en el camino normal)
- Request: los mismos bodies JSON de FEAT-001 y FEAT-007
- Response: la misma de cada ruta; nuevo `429` `{ error: "Demasiados intentos. Probá de nuevo en N minutos." }` con header `Retry-After` (segundos)
- Error codes: `429` por bloqueo, más los existentes (`400`, `401`, `409`, `415`, `500`)
- Auth: login y primer Admin públicos; cambio de contraseña con sesión; el límite es por IP y por operación

**Data model**
- Reutiliza los registros en memoria de Block 1 — sin cambio de esquema de base; restricciones como están declaradas ahí: clave por IP con `ipKeyGenerator`, como máximo 4 fallos guardados, `blockedUntil` nullable, sin persistencia.

**Input validation**
- Sin validación nueva de los campos: login, primer Admin y cambio de contraseña conservan la suya; el primer Admin solo mueve su parseo dentro del `try` para contar el body inválido.

**Error handling**
- Credenciales incorrectas en login — 401 como hoy, y cuenta un fallo.
- Contraseña actual incorrecta en el cambio — 400 como hoy, y cuenta un fallo.
- Contraseña nueva inválida o email con formato inválido — 400 como hoy, sin contar.
- Rechazo del registro del primer Admin (body inválido, datos inválidos o Admin ya existente) — el mismo código que hoy (400 o 409), y cuenta un fallo.
- IP bloqueada en cualquiera de las tres — 429 sin ejecutar el caso de uso.

**Required tests**
- [ ] `test_login_quinto_fallo_bloquea_sexto_rechazado` — 5 contraseñas incorrectas → el sexto intento correcto da 429 (sad path) — validates AC-01
- [ ] `test_login_desbloquea_a_los_15_minutos` — `FakeClock` avanza 15 min y el login correcto da 200 — validates AC-02
- [ ] `test_login_fallo_fuera_de_ventana_no_cuenta` — validates AC-03
- [ ] `test_login_email_invalido_no_cuenta` — 5 emails con formato inválido (400) y después login correcto 200 (sad path) — validates AC-04
- [ ] `test_password_actual_incorrecta_bloquea_sexto_rechazado` — 5 contraseñas actuales incorrectas → el sexto, aun correcto, da 429 y la contraseña no cambia (sad path) — validates AC-05
- [ ] `test_password_nueva_invalida_no_cuenta` — 5 nuevas de 7 caracteres (400) y después un cambio válido 204 (sad path) — validates AC-06
- [ ] `test_first_admin_rechazado_cinco_veces_bloquea` — con un usuario existente, 5 intentos (409) → el sexto da 429 (sad path) — validates AC-07
- [ ] `test_login_bloqueado_no_ejecuta_caso_de_uso` — con un doble de `login` que cuenta llamadas, los intentos bloqueados no lo llaman y responden en menos de 50 ms — validates AC-08
- [ ] `test_login_bloqueado_mensaje_y_retry_after` — a 14 min 10 s del fin, 429 con "15 minutos" y `Retry-After: 850` — validates AC-09
- [ ] `test_login_exito_reinicia_contador` — 4 fallos, éxito, 4 fallos más: el siguiente correcto da 200 — validates AC-10
- [ ] `test_login_bloqueado_no_afecta_cambio_de_contraseña` — con el login bloqueado, el cambio de contraseña desde la misma IP da 204 — validates AC-11
- [ ] `test_bloqueo_registrado_en_log_sin_contraseñas` — el log tiene `{ event: 'login', outcome: 'blocked', ip, at }` y ninguna contraseña — validates AC-12
- [ ] `test_reinicio_borra_bloqueo` — con la IP bloqueada, un `createApp` nuevo sobre la misma base acepta el login correcto — validates AC-14

**Completion criterion**
Los 13 tests pasan, los tests HTTP existentes siguen en verde, y `npm run typecheck` y `npm run lint`
pasan.

## Block 3 — Web: mensaje de bloqueo en las tres pantallas

**Files**
- `web/src/pages/LoginPage.test.tsx` (modified), `web/src/pages/FirstAdminPage.test.tsx` (modified), `web/src/pages/ProfilePage.test.tsx` (modified) — tests con `POST` respondiendo 429.
- Sin cambios de producto esperados: las tres pantallas ya muestran `errorText(err)` ante un `ApiError`, y `client.ts` convierte el 429 en `ApiError` con el mensaje del server. Si un test muestra lo contrario, el arreglo va en la pantalla correspondiente (`web/src/pages/LoginPage.tsx`, `FirstAdminPage.tsx` o `ProfilePage.tsx`).

**Logic**
Implementa FR-11: cada pantalla muestra el mensaje del 429 tal como llega, con los minutos de espera.

**API contract**
- Method + path: `POST /api/auth/login`, `POST /api/setup/first-admin`, `POST /api/auth/password` (consumidos; los define Block 2)
- Request: los mismos bodies de hoy, vía `request` de `client.ts`
- Response: `429` → `ApiError(429, mensaje)`
- Error codes: `429` además de los existentes
- Auth: sin cambios (cookie de sesión solo en el cambio de contraseña)

**Input validation**
- Sin validación nueva: los formularios conservan sus reglas actuales.

**Error handling**
- 429 en el login — muestra el mensaje y vacía la contraseña, como ante cualquier `ApiError`.
- 429 en el registro del primer Admin — muestra el mensaje (no es el 409 que redirige).
- 429 en "Mi perfil" — muestra el mensaje y conserva lo ingresado.

**Required tests**
- [ ] `test_login_page_bloqueo_rechazado_muestra_mensaje` — 429 → "Demasiados intentos. Probá de nuevo en 15 minutos." (sad path) — validates AC-13
- [ ] `test_first_admin_page_bloqueo_rechazado_muestra_mensaje` — 429 → mensaje visible y sigue en `/setup` (sad path) — validates AC-13
- [ ] `test_profile_page_bloqueo_rechazado_muestra_mensaje` — 429 → mensaje visible y el formulario conserva lo ingresado (sad path) — validates AC-13

**Completion criterion**
Los 3 tests pasan y la suite web sigue en verde.

## Final verification
`npm test`, `npm run lint` y `npm run typecheck` en verde; los 26 Required tests presentes con sus
identificadores `test_...`; en el PR, el escaneo de CodeQL deja cerradas las alertas #2, #3 y #5
(`js/missing-rate-limiting`) — si no, la alternativa de ADR-006 es exponer el middleware de
`rateLimit` sin envolverlo; sin migraciones: el rollback es revertir los commits del ticket.
