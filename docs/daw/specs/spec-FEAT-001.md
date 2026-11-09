# Spec FEAT-001: Login de usuarios (inicio/cierre de sesión y registro del primer Admin)

| Field | Value |
|-------|-------|
| Ticket | FEAT-001 |
| PRD | docs/daw/prd/prd-FEAT-001.md |
| Tier | FEATURE |
| Date | 2026-11-04 |
| Spec loops | 2 |
| Loops since last human decision | 2 |

## Summary
Monorepo npm workspaces (`server/` y `web/`, ESM, TypeScript strict). El server (Express 5, Drizzle 0.45 + better-sqlite3) sigue DDD: domain (entidades, value objects, puertos), application (casos de uso, `UnitOfWork`, DTO `PublicUser`) e infrastructure (repos Drizzle síncronos, argon2id, generador de tokens, HTTP). La sesión vive en la tabla `sessions` (solo el SHA-256 del token) y viaja en la cookie `aldebaran_sid` httpOnly + SameSite=Strict; vence a las 24 h sin actividad, con reloj inyectable. La web (React 19 + Vite 8 + antd 6 + zustand 5 + react-router 8, data router) ofrece login, registro del primer Admin y una pantalla principal protegida, con estructura por responsabilidad (`api/`, `store/`, `routes/`, `pages/`): DDD aplica solo a `server/` (decisión del usuario, 2026-11-04).

Decisiones registradas como ADR: ADR-001 (sesión en servidor vs JWT), ADR-002 (argon2id vs bcrypt), ADR-003 (repos síncronos + UnitOfWork IMMEDIATE). Mitigaciones del threat model (`docs/daw/security/threat-FEAT-001.md`) incorporadas: R-02, R-03, R-04, R-05, R-07, R-08.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 4, Block 5 |
| FR-02 | Block 2, Block 4, Block 5 |
| FR-03 | Block 2, Block 4, Block 5 |
| FR-04 | Block 2, Block 4, Block 5 |
| FR-05 | Block 2, Block 4, Block 5 |
| FR-06 | Block 2, Block 3, Block 4, Block 5 |
| FR-07 | Block 2, Block 4 |
| FR-08 | Block 2, Block 4 |
| FR-09 | Block 2, Block 4, Block 5 |
| NFR-01 | Strategy: `Argon2PasswordHasher` con argon2id (memoria 19 MiB, t=2, p=1) en producción (Block 3); test de infraestructura que lee la fila y verifica el prefijo `$argon2id$` y que no contiene la contraseña (AC-12) |

## Dependencies between blocks
Block 1 → Block 2 → Block 3 → Block 4 → Block 5. Block 2 usa solo los tipos de Block 1 (ninguna base); Block 3 implementa los puertos de Block 2 sobre el schema de Block 1; Block 4 compone todo detrás de HTTP; Block 5 consume la API de Block 4.

## Block 1 — Scaffolding del monorepo y base de datos

**Files**
- `package.json` (new) — workspaces `["server","web"]`, scripts `dev`, `build`, `test` (`vitest run` con workspace), `typecheck` (`tsc -b`).
- `tsconfig.base.json` (new) — `strict`, `target ES2023`, sin `baseUrl`.
- `vitest.workspace.ts` (new) — proyectos `server` y `web`.
- `.gitignore` (modified) — agrega `node_modules/`, `dist/`, `data/*.db*`, `.env`.
- `server/package.json` (new) — `"type": "module"`, deps `express@5`, `drizzle-orm@0.45`, `better-sqlite3`, `@node-rs/argon2`, `cookie-parser`; dev `drizzle-kit`, `vitest`, `supertest`, `tsx`, tipos.
- `server/tsconfig.json` (new) — `module`/`moduleResolution: nodenext`.
- `server/vitest.config.ts` (new) — environment `node`.
- `server/drizzle.config.ts` (new) — dialecto sqlite, schema `src/infrastructure/db/schema.ts`, out `drizzle/`.
- `server/drizzle/0000_init.sql`, `server/drizzle/meta/_journal.json`, `server/drizzle/meta/0000_snapshot.json` (new) — generados por `drizzle-kit generate` y commiteados.
- `server/src/infrastructure/db/schema.ts` (new) — tablas `users` y `sessions`.
- `server/src/infrastructure/db/client.ts` (new) — `createDb(path)`: crea el directorio padre con modo 0700 si falta, abre better-sqlite3, `journal_mode=WAL`, `foreign_keys=ON`, `chmod 0600` del archivo; `resolveDatabasePath(env)`: `DATABASE_PATH` o `<raíz del repo>/data/aldebaran.db` (resuelto desde `import.meta.url`).
- `server/src/infrastructure/db/migrate.ts` (new) — `migrate(db)` con `migrationsFolder` resuelto desde `import.meta.url`.
- `server/src/infrastructure/http/app.ts` (new) — `createApp(deps)` esqueleto: `express.json({ limit: '10kb' })`, headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, 404 JSON `{ error: "No encontrado" }`.
- `server/test/infrastructure/migrate.test.ts`, `server/test/http/app.test.ts` (new).

**Logic**
Deja el monorepo compilando y testeando, y la base con su schema aplicado por migración explícita (sin efectos al importar). Bloque habilitante: no implementa ningún FR por sí mismo; es la base de Block 2 a Block 5.

Rollback del schema: `0000_init.sql` es la migración inicial sobre una base vacía (no hay datos previos que preservar). Revertirla es borrar `data/aldebaran.db*`, o ejecutar `DROP TABLE sessions; DROP TABLE users;` en ese orden; las migraciones futuras se agregan como archivos nuevos y nunca editan `0000_init.sql`.

**Data model**
- `users`: `id` TEXT PK (UUID), `name` TEXT NOT NULL, `email` TEXT NOT NULL UNIQUE (ya normalizado a minúsculas), `role` TEXT NOT NULL CHECK IN (`admin`,`editor`,`consulta`), `status` TEXT NOT NULL CHECK IN (`activo`,`inactivo`) DEFAULT `activo`, `password_hash` TEXT NOT NULL, `created_at` TEXT NOT NULL (ISO 8601).
- `sessions`: `id` TEXT PK (UUID), `user_id` TEXT NOT NULL FK → `users.id` ON DELETE CASCADE, `token_hash` TEXT NOT NULL UNIQUE (hex SHA-256), `created_at` TEXT NOT NULL, `last_activity_at` TEXT NOT NULL; índice en `user_id`.

**Error handling**
- Directorio de la base no creable o archivo no abrible — `createDb` lanza el error con la ruta; `main.ts` (Block 4) lo informa y termina con código 1.
- Ruta inexistente — 404 JSON `{ error: "No encontrado" }`.

**Required tests**
- [ ] `test_migrate_crea_tablas_users_y_sessions_con_indices_unicos` — migrate crea las tablas users y sessions con sus índices únicos — base de Block 3
- [ ] `test_createdb_crea_directorio_0700_y_archivo_0600` — createDb crea el directorio faltante con permisos 0700 y el archivo con 0600 — mitigación R-08
- [ ] `test_createdb_con_ruta_no_creable_lanza_error_con_la_ruta` — createDb con ruta no creable lanza error con la ruta (error) — sad path
- [ ] `test_get_api_inexistente_responde_404_json_con_headers_de_seguridad` — GET /api/inexistente responde 404 rechazado con JSON y headers de seguridad — sad path

**Completion criterion**
`npm test` corre los proyectos `server` y `web` (este último vacío), los cuatro tests pasan y `npm run typecheck` termina sin errores.

## Block 2 — Dominio y casos de uso

**Files**
- `server/src/domain/user/User.ts` (new) — entidad (`id`, `name`, `email: Email`, `role`, `status`, `passwordHash`, `createdAt`); `isActive()`.
- `server/src/domain/user/Email.ts` (new) — value object: trim + lowercase, formato `local@dominio.tld`, máximo 254.
- `server/src/domain/user/PasswordPolicy.ts` (new) — mínimo 8, máximo 1024 caracteres.
- `server/src/domain/user/UserRepository.ts` (new) — puerto síncrono: `countAll()`, `findByEmail(email)`, `findById(id)`, `insert(user)`.
- `server/src/domain/user/errors.ts` (new) — `WeakPassword`, `InvalidEmail`.
- `server/src/domain/auth/Session.ts` (new) — entidad; `isExpired(now)` = `now - lastActivityAt >= 24 h`.
- `server/src/domain/auth/SessionRepository.ts` (new) — puerto síncrono: `insert`, `findByTokenHash`, `touch(id, now)`, `delete(id)`.
- `server/src/domain/auth/PasswordHasher.ts` (new) — puerto asíncrono: `hash(plain)`, `verify(hash, plain)`.
- `server/src/domain/shared/Clock.ts` (new) — puerto `now(): Date`.
- `server/src/application/shared/UnitOfWork.ts` (new) — `run<T>(fn: (repos: { users: UserRepository }) => T): T` (síncrono, ADR-003).
- `server/src/application/shared/IdGenerator.ts` (new) — `next(): string`.
- `server/src/application/auth/SessionTokenGenerator.ts` (new) — `generate(): { token, tokenHash }`, `hash(token)`.
- `server/src/application/auth/dto/PublicUser.ts` (new) — `{ id, name, email, role, status }` y `toPublicUser(user)`; sin `passwordHash`.
- `server/src/application/auth/errors.ts` (new) — `InvalidCredentials`, `Unauthenticated`, `FirstAdminAlreadyExists`.
- `server/src/application/auth/RegisterFirstAdmin.ts` (new) — (1) `Email` y `PasswordPolicy`; (2) si `countAll() > 0` → `FirstAdminAlreadyExists` sin hashear; (3) `await hasher.hash()`; (4) `uow.run`: `countAll() > 0` → `FirstAdminAlreadyExists`, si no `insert` con `role=admin`, `status=activo`. Ningún `await` dentro de `run`.
- `server/src/application/auth/Login.ts` (new) — normaliza `Email`; usuario inexistente → `verify(dummyHash, plain)` y `InvalidCredentials`; contraseña incorrecta o usuario Inactivo → `InvalidCredentials`; si vale → `generate()`, `sessions.insert`, devuelve `{ token, user: PublicUser }`.
- `server/src/application/auth/Logout.ts` (new) — `findByTokenHash(hash(token))` y `delete`; idempotente.
- `server/src/application/auth/AuthenticateSession.ts` (new) — sesión inexistente → `Unauthenticated`; vencida → `delete` + `Unauthenticated`; usuario inexistente o Inactivo → `delete` + `Unauthenticated`; si vale → `touch(now)` y devuelve `PublicUser`.
- `server/src/application/auth/GetSetupStatus.ts` (new) — `{ needsFirstAdmin: countAll() === 0 }`.
- `server/test/support/InMemoryUserRepository.ts`, `InMemorySessionRepository.ts`, `InMemoryUnitOfWork.ts`, `FakeClock.ts`, `FakePasswordHasher.ts`, `FakeSessionTokenGenerator.ts`, `SequentialIdGenerator.ts` (new) — dobles de los puertos.
- `server/test/domain/*.test.ts`, `server/test/application/*.test.ts` (new).

**Logic**
Implementa FR-02 (login con email normalizado, D-01), FR-03 (mismo `InvalidCredentials` para los tres casos, D-02), FR-04 (logout), FR-05 (registro del primer Admin Activo), FR-06 (rechazo si ya hay usuarios), FR-07 (mínimo 8), FR-08 (los casos de uso solo devuelven `PublicUser`) y FR-09 (vencimiento a las 24 h, deslizante). Mitigaciones R-02 (hash dummy) y R-04 (pre-check + doble verificación dentro de la unidad de trabajo).

**Data model**
- Reuses `users` and `sessions` from Block 1 — no schema change; constraints as declared there: `users.email` NOT NULL UNIQUE, `role` y `status` con CHECK, `password_hash` NOT NULL; `sessions.token_hash` NOT NULL UNIQUE, `user_id` FK NOT NULL.

**Input validation**
- `email`: string, trim + lowercase, máximo 254, formato `local@dominio.tld` → si no, `InvalidEmail`.
- `password`: string, mínimo 8, máximo 1024 → si no, `WeakPassword`.
- `name` (registro): string, trim, 1 a 100 caracteres → si no, `InvalidName` (en `domain/user/errors.ts`).

**Error handling**
- Contraseña de menos de 8 caracteres en el registro — `WeakPassword`; no se crea usuario.
- Email con formato inválido — `InvalidEmail`; no se crea usuario ni sesión.
- Nombre vacío o de más de 100 caracteres en el registro — `InvalidName`; no se crea usuario.
- Ya existe al menos un usuario al registrar — `FirstAdminAlreadyExists`; no se hashea ni se inserta.
- Email inexistente, contraseña incorrecta o usuario Inactivo en el login — `InvalidCredentials`; no se crea sesión.
- Sesión inexistente, vencida o de usuario Inactivo — `Unauthenticated`; la sesión se borra si existía.

**Required tests**
- [ ] `test_login_credenciales_correctas_usuario_activo_devuelve_token_y_public_user` — Login con email y contraseña correctos de un usuario Activo devuelve token y PublicUser — validates AC-01
- [ ] `test_login_con_email_en_mayusculas_encuentra_al_usuario` — Login con Admin@Empresa.com encuentra al usuario admin@empresa.com — validates AC-02
- [ ] `test_login_contrasena_incorrecta_rechazado_invalid_credentials` — Login con contraseña incorrecta es rechazado con InvalidCredentials — validates AC-03 (sad path)
- [ ] `test_login_email_inexistente_rechazado_y_verifica_contra_hash_dummy` — Login con email inexistente es rechazado con InvalidCredentials y verifica contra el hash dummy — validates AC-03 (sad path)
- [ ] `test_login_usuario_inactivo_rechazado_invalid_credentials` — Login de usuario Inactivo es rechazado con InvalidCredentials — validates AC-03 (sad path)
- [ ] `test_logout_borra_la_sesion_y_authenticate_session_posterior_es_rechazado` — Logout borra la sesión y AuthenticateSession posterior es rechazado (no autorizado) — validates AC-04 (sad path)
- [ ] `test_register_first_admin_sistema_vacio_crea_admin_activo_que_hace_login` — RegisterFirstAdmin con sistema vacío crea un Admin Activo que puede hacer Login — validates AC-05
- [ ] `test_register_first_admin_contrasena_de_7_rechazado_weak_password_sin_crear_usuario` — RegisterFirstAdmin con contraseña de 7 caracteres es rechazado con WeakPassword y no crea usuario — validates AC-06 (sad path)
- [ ] `test_register_first_admin_email_invalido_rechazado_invalid_email` — RegisterFirstAdmin con email inválido es rechazado con InvalidEmail — sad path
- [ ] `test_register_first_admin_nombre_faltante_rechazado_invalid_name` — RegisterFirstAdmin con nombre faltante es rechazado con InvalidName — sad path
- [ ] `test_register_first_admin_con_usuario_existente_rechazado_conflict_sin_hash` — RegisterFirstAdmin con un usuario existente es rechazado con FirstAdminAlreadyExists (conflict) sin llamar a hash — validates AC-07 (sad path)
- [ ] `test_authenticate_session_24h_sin_actividad_rechazado_y_borra_la_sesion` — AuthenticateSession con última actividad hace 24 h es rechazado (Unauthenticated) y borra la sesión — validates AC-09 (sad path)
- [ ] `test_authenticate_session_23h_devuelve_usuario_y_actualiza_last_activity_at` — AuthenticateSession con última actividad hace 23 h devuelve el usuario y actualiza last_activity_at — validates AC-10
- [ ] `test_authenticate_session_token_inexistente_rechazado` — AuthenticateSession con token inexistente es rechazado (no autorizado) — sad path
- [ ] `test_public_user_no_tiene_password_hash` — PublicUser no tiene la propiedad passwordHash — validates AC-11

**Completion criterion**
Los 15 tests pasan con los dobles en memoria y `FakeClock`, sin base ni HTTP, y ningún archivo de `domain/` o `application/` importa de `infrastructure/`.

## Block 3 — Adaptadores de infraestructura

**Files**
- `server/src/infrastructure/db/DrizzleUserRepository.ts` (new) — implementa `UserRepository` sobre un handle `db` o `tx`.
- `server/src/infrastructure/db/DrizzleSessionRepository.ts` (new) — implementa `SessionRepository`.
- `server/src/infrastructure/db/DrizzleUnitOfWork.ts` (new) — `run(fn)` con `db.transaction(tx => fn({ users: new DrizzleUserRepository(tx) }), { behavior: 'immediate' })`.
- `server/src/infrastructure/auth/Argon2PasswordHasher.ts` (new) — `@node-rs/argon2`, `algorithm: Argon2id`; parámetros por constructor, default producción `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`.
- `server/src/infrastructure/auth/CryptoSessionTokenGenerator.ts` (new) — `randomBytes(32).toString('base64url')`, SHA-256 hex.
- `server/src/infrastructure/auth/UuidGenerator.ts` (new) — `crypto.randomUUID()`.
- `server/src/infrastructure/clock/SystemClock.ts` (new).
- `server/test/infrastructure/*.test.ts` (new).

**Logic**
Implementa sobre SQLite los puertos de Block 2. Cubre NFR-01 (argon2id real) y la parte de persistencia de FR-06 (unicidad y transacción IMMEDIATE, ADR-003).

**Data model**
- Reuses `users` and `sessions` from Block 1 — no schema change; constraints as declared there: `users.email` NOT NULL UNIQUE, `password_hash` NOT NULL, CHECK de `role` y `status`; `sessions.token_hash` NOT NULL UNIQUE, FK `user_id` ON DELETE CASCADE, índice en `user_id`.

**Input validation**
- Los repositorios reciben entidades ya validadas por Block 2 (`Email` normalizado, máximo 254; `name` de 1 a 100; `role` y `status` dentro de sus enums); no revalidan formato.
- `Argon2PasswordHasher.hash`/`verify`: `plain` string de hasta 1024 caracteres (garantizado por `PasswordPolicy`); `hash` en formato PHC, cualquier otro formato se trata como inválido.
- `CryptoSessionTokenGenerator.hash(token)`: string base64url; cualquier otro valor produce un hash que no coincide con ninguna sesión.
- Todas las consultas usan parámetros de Drizzle; ningún valor se concatena en SQL.

**Error handling**
- Inserción de un email duplicado — la violación UNIQUE de SQLite se traduce a `FirstAdminAlreadyExists`; no se inserta nada.
- Hash con formato inválido en `verify` — devuelve `false` (no lanza); el login termina en `InvalidCredentials`.

**Required tests**
- [ ] `test_argon2_parametros_de_produccion_guarda_hash_argon2id_sin_contrasena` — Argon2PasswordHasher con parámetros de producción guarda un hash $argon2id$ sin la contraseña en texto plano — validates AC-12
- [ ] `test_drizzle_user_repository_inserta_y_encuentra_por_email_normalizado` — DrizzleUserRepository inserta y encuentra por email normalizado — validates AC-02
- [ ] `test_drizzle_user_repository_email_duplicado_rechazado_first_admin_already_exists` — DrizzleUserRepository con email duplicado es rechazado como FirstAdminAlreadyExists — sad path
- [ ] `test_argon2_verify_con_hash_invalido_devuelve_false` — Argon2PasswordHasher.verify con hash inválido devuelve false (error controlado) — sad path
- [ ] `test_drizzle_unit_of_work_revierte_la_transaccion_si_fn_lanza` — DrizzleUnitOfWork revierte la transacción si fn lanza — base de AC-07
- [ ] `test_drizzle_session_repository_touch_actualiza_y_delete_elimina` — DrizzleSessionRepository touch actualiza last_activity_at y delete la elimina — base de AC-04 y AC-10

**Completion criterion**
Los 6 tests pasan contra una base SQLite temporal migrada y el hash leído de `users.password_hash` empieza con `$argon2id$v=19$m=19456,t=2,p=1$`.

## Block 4 — API HTTP, middleware de sesión y composition root

**Files**
- `server/src/infrastructure/http/app.ts` (modified) — `createApp(deps)` recibe casos de uso, `Clock` y logger; monta `cookie-parser`, `requireJson`, `authMiddleware` solo sobre `/api`, rutas y `errorHandler`.
- `server/src/infrastructure/http/authMiddleware.ts` (new) — deny-by-default; públicas: `POST /api/auth/login`, `GET /api/setup/status`, `POST /api/setup/first-admin`; el resto exige `aldebaran_sid` válida vía `AuthenticateSession` → `req.user`.
- `server/src/infrastructure/http/requireJson.ts` (new) — POST sin `Content-Type: application/json` → 415 (R-07).
- `server/src/infrastructure/http/sessionCookie.ts` (new) — `aldebaran_sid`, `httpOnly`, `SameSite=Strict`, `Secure` si `NODE_ENV=production`, `Path=/`, sin `Max-Age`; `set`/`clear`.
- `server/src/infrastructure/http/errorHandler.ts` (new) — mapeo único: `WeakPassword`/`InvalidEmail`/`InvalidName`/body inválido → 400; `InvalidCredentials` → 401 `"Email o contraseña incorrectos"`; `Unauthenticated` → 401 `"Sesión no válida"` y borra la cookie; `FirstAdminAlreadyExists` → 409; resto → 500 sin detalle.
- `server/src/infrastructure/http/authLog.ts` (new) — log JSON en stdout de cada intento de login y registro: `{ event, outcome, email, ip, at }`, nunca contraseña ni token (R-05).
- `server/src/infrastructure/http/routes/auth.ts` (new) — login, logout, sesión actual.
- `server/src/infrastructure/http/routes/setup.ts` (new) — estado y registro del primer Admin.
- `server/src/main.ts` (new) — composition root: `TZ=America/Argentina/Buenos_Aires`, `createDb(resolveDatabasePath())`, `migrate`, hasher de producción, `dummyHash = await hasher.hash(randomUUID())`, `SystemClock`, `listen(PORT ?? 3000)`.
- `server/test/support/testApp.ts` (new) — `createApp` con base temporal migrada, argon2id de costo bajo y `FakeClock`.
- `server/test/http/auth.test.ts`, `server/test/http/setup.test.ts`, `server/test/http/middleware.test.ts` (new).

**Logic**
Expone FR-01 (todo `/api` protegido salvo las tres rutas públicas), FR-02/FR-03 (login con cookie o 401 genérico), FR-04 (logout que invalida la sesión), FR-05/FR-06/FR-07 (registro del primer Admin), FR-08 (solo `PublicUser` en las respuestas) y FR-09 (middleware con vencimiento deslizante). `GET /api/setup/status` es excepción documentada de FR-01: devuelve solo el booleano que la web necesita para FR-05/FR-06.

**API contract**
- Method + path: `POST /api/auth/login` · Request: `{ email: string, password: string }` · Response: 200 `{ user: PublicUser }` + `Set-Cookie: aldebaran_sid` · Error codes: 400, 401, 415 · Auth: pública.
- Method + path: `POST /api/auth/logout` · Request: body vacío `{}` con `Content-Type: application/json` · Response: 204 + cookie borrada · Error codes: 401, 415 · Auth: sesión requerida.
- Method + path: `GET /api/auth/session` · Request: sin body · Response: 200 `{ user: PublicUser }` · Error codes: 401 · Auth: sesión requerida.
- Method + path: `GET /api/setup/status` · Request: sin body · Response: 200 `{ needsFirstAdmin: boolean }` · Error codes: ninguno propio (500 genérico) · Auth: pública (excepción documentada).
- Method + path: `POST /api/setup/first-admin` · Request: `{ name: string, email: string, password: string }` · Response: 201 `{ user: PublicUser }` (sin iniciar sesión) · Error codes: 400, 409, 415 · Auth: pública; rechazada con 409 cuando existe al menos un usuario.
- `PublicUser`: `{ id: string, name: string, email: string, role: "admin"|"editor"|"consulta", status: "activo"|"inactivo" }`.

**Data model**
- Reuses `users` and `sessions` from Block 1 — no schema change; constraints as declared there: `users.email` NOT NULL UNIQUE, `password_hash` NOT NULL; `sessions.token_hash` NOT NULL UNIQUE, FK `user_id` ON DELETE CASCADE.

**Input validation**
- Body: JSON obligatorio en POST (`Content-Type: application/json`), tamaño máximo 10 kB.
- `email`: string, máximo 254, formato `local@dominio.tld`.
- `password`: string, máximo 1024 (y mínimo 8 en `first-admin`).
- `name`: string, 1 a 100 caracteres (solo `first-admin`).
- Campos faltantes o de tipo distinto a string → 400.

**Error handling**
- Body con campo faltante o de tipo inválido — 400 `{ error }` nombrando el campo; nada persistido.
- POST sin `Content-Type: application/json` — 415; no se ejecuta el caso de uso.
- Credenciales inválidas, email inexistente o usuario Inactivo — 401 `{ error: "Email o contraseña incorrectos" }`; sin cookie.
- Solicitud a `/api` sin cookie, con sesión inexistente, cerrada o vencida — 401 `{ error: "Sesión no válida" }` sin datos; cookie borrada.
- Registro del primer Admin con usuarios existentes — 409; no se crea usuario.
- Contraseña de menos de 8 caracteres en `first-admin` — 400; no se crea usuario.
- Error inesperado — 500 `{ error: "Error interno" }` sin stack; detalle solo en el log.

**Required tests**
- [ ] `test_post_login_credenciales_validas_200_public_user_y_cookie_segura` — POST /api/auth/login con credenciales válidas responde 200, PublicUser y cookie httpOnly SameSite=Strict — validates AC-01
- [ ] `test_post_login_email_en_mayusculas_inicia_sesion` — POST /api/auth/login con email en mayúsculas inicia sesión — validates AC-02
- [ ] `test_post_login_credenciales_invalidas_401_con_el_mismo_mensaje` — POST /api/auth/login con contraseña incorrecta, email inexistente o usuario Inactivo es rechazado con 401 y el mismo mensaje — validates AC-03 (sad path)
- [ ] `test_post_login_campo_faltante_rechazado_400` — POST /api/auth/login con campo faltante es rechazado con 400 — sad path
- [ ] `test_post_login_sin_content_type_json_rechazado_415` — POST /api/auth/login sin Content-Type JSON es rechazado con 415 — sad path
- [ ] `test_post_logout_y_get_session_con_la_misma_cookie_rechazado_401` — POST /api/auth/logout y luego GET /api/auth/session con la misma cookie es rechazado con 401 — validates AC-04 (sad path)
- [ ] `test_setup_status_sin_usuarios_y_first_admin_con_8_caracteres_crea_admin_que_hace_login` — GET /api/setup/status sin usuarios devuelve needsFirstAdmin true y POST /api/setup/first-admin con 8 caracteres crea Admin Activo que hace login — validates AC-05
- [ ] `test_post_first_admin_contrasena_de_7_rechazado_400_sin_crear_usuario` — POST /api/setup/first-admin con contraseña de 7 caracteres es rechazado con 400 y no crea usuario — validates AC-06 (sad path)
- [ ] `test_post_first_admin_con_usuario_existente_rechazado_409` — POST /api/setup/first-admin con usuario existente es rechazado con 409 (conflict) — validates AC-07 (sad path)
- [ ] `test_dos_post_first_admin_simultaneos_un_201_un_409_y_un_solo_usuario` — Dos POST /api/setup/first-admin simultáneos: un 201, un 409 duplicado rechazado y un solo usuario — validates AC-07 (sad path, R-04)
- [ ] `test_get_session_sin_cookie_rechazado_401_sin_datos` — GET /api/auth/session sin cookie es rechazado con 401 sin datos — validates AC-08 (sad path)
- [ ] `test_get_session_24h_despues_de_la_ultima_actividad_rechazado_401` — GET /api/auth/session con FakeClock 24 h después de la última actividad es rechazado con 401 — validates AC-09 (sad path)
- [ ] `test_get_session_23h_despues_responde_200` — GET /api/auth/session con FakeClock 23 h después responde 200 — validates AC-10
- [ ] `test_ninguna_respuesta_contiene_password_hash` — Ninguna respuesta de login, first-admin ni session contiene passwordHash ni password_hash — validates AC-11
- [ ] `test_error_inesperado_en_caso_de_uso_responde_500_sin_stack` — Error inesperado en un caso de uso responde 500 sin stack (error) — sad path
- [ ] `test_auth_log_registra_el_intento_de_login_sin_la_contrasena` — authLog registra el intento de login sin la contraseña — mitigación R-05

**Completion criterion**
Los 16 tests de supertest pasan contra `testApp`, y `npm run dev -w server` arranca, aplica la migración sobre `data/aldebaran.db` y responde 401 a `GET /api/auth/session` sin cookie.

## Block 5 — Web: login, registro del primer Admin y ruta protegida

**Files**
- `web/package.json` (new) — `"type": "module"`, deps `react@19`, `react-dom@19`, `antd@6`, `zustand@5`, `react-router@8`, `styled-components@6`; dev `vite@8`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
- `web/tsconfig.json` (new) — `moduleResolution: bundler`, `jsx: react-jsx`.
- `web/vite.config.ts` (new) — proxy `/api` → `http://localhost:3000`; `test.environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`.
- `web/index.html` (new).
- `web/src/test/setup.ts` (new) — `@testing-library/jest-dom`.
- `web/src/main.tsx` (new) — monta `RouterProvider` dentro de `ConfigProvider` de antd.
- `web/src/router.tsx` (new) — data router: `/` (loader exige sesión), `/login` (loader redirige a `/setup` si `needsFirstAdmin`, a `/` si hay sesión), `/setup` (loader redirige a `/login` si no `needsFirstAdmin`).
- `web/src/api/authApi.ts` (new) — `fetch` con `credentials: 'include'` y `Content-Type: application/json`; `login`, `logout`, `getSession`, `getSetupStatus`, `registerFirstAdmin`; ante 401 en cualquier llamada distinta de `login` → `authStore.setAnon()` y navegación a `/login`.
- `web/src/store/authStore.ts` (new) — zustand: `user`, `status: 'loading'|'anon'|'authed'`, `setUser`, `setAnon`.
- `web/src/pages/LoginPage.tsx` (new) — formulario antd email + contraseña; muestra el mensaje del 401; limpia la contraseña tras un fallo; botón deshabilitado durante el envío.
- `web/src/pages/FirstAdminPage.tsx` (new) — formulario nombre, email, contraseña (mínimo 8 validado también en cliente); al crear, navega a `/login`.
- `web/src/pages/HomePage.tsx` (new) — pantalla principal con el nombre del usuario y botón "Cerrar sesión".
- `web/src/**/*.test.tsx` (new).

**Logic**
La UI de FR-01 (sin sesión no se ve `/`), FR-02/FR-03 (login y mensaje genérico), FR-04 (cerrar sesión), FR-05/FR-06 (registro del primer Admin solo con el sistema vacío) y FR-09 (un 401 por vencimiento devuelve al login). Las guardas son UX: la autorización real es `authMiddleware.ts` de Block 4.

**API contract**
- Method + path: consume `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/setup/status`, `POST /api/setup/first-admin` tal como los define Block 4.
- Request: los cuerpos de Block 4, en JSON.
- Response: `{ user: PublicUser }` / `{ needsFirstAdmin }` / 204.
- Error codes: 400, 401, 409, 415 manejados como mensajes en pantalla; 401 fuera del login → `/login`.
- Auth: cookie `aldebaran_sid` enviada por el navegador (`credentials: 'include'`); la web nunca lee ni guarda el token.

**Input validation**
- Login: email requerido con formato email (antd `type: 'email'`), contraseña requerida.
- Registro: nombre requerido (máximo 100), email requerido con formato, contraseña requerida de mínimo 8 caracteres.

**Error handling**
- 401 en el login — se muestra "Email o contraseña incorrectos" y se limpia la contraseña.
- 400 en el registro (contraseña corta, campo inválido) — se muestra el mensaje del servidor; no se navega.
- 409 en el registro (ya hay usuarios) — se muestra el mensaje y se navega a `/login`.
- 401 en una acción fuera del login (sesión vencida o cerrada) — el store pasa a `anon` y se navega a `/login`.
- Error de red o 5xx — se muestra "No se pudo conectar con el servidor"; el formulario queda habilitado.

**Required tests**
- [ ] `test_login_page_credenciales_validas_navega_a_la_pantalla_principal` — LoginPage con credenciales válidas navega a la pantalla principal — validates AC-01
- [ ] `test_login_page_401_muestra_mensaje_y_limpia_la_contrasena` — LoginPage con 401 muestra "Email o contraseña incorrectos" rechazado y limpia la contraseña — validates AC-03 (sad path)
- [ ] `test_home_page_cerrar_sesion_navega_a_login` — HomePage al cerrar sesión navega a /login — validates AC-04
- [ ] `test_login_con_needs_first_admin_redirige_a_setup_y_crea_admin` — /login con needsFirstAdmin true redirige a /setup y FirstAdminPage crea el Admin y navega a /login — validates AC-05
- [ ] `test_first_admin_page_contrasena_de_7_rechazado_en_el_formulario` — FirstAdminPage con contraseña de 7 caracteres es rechazado en el formulario — validates AC-06 (sad path)
- [ ] `test_setup_con_usuarios_existentes_redirige_a_login_y_409_navega_a_login` — /setup con usuarios existentes redirige a /login y un 409 duplicado rechazado navega a /login — validates AC-07 (sad path)
- [ ] `test_home_sin_sesion_redirige_a_login` — / sin sesión es rechazado y redirige a /login — validates AC-08 (sad path)
- [ ] `test_get_session_401_desde_home_sesion_vencida_lleva_a_login` — 401 en getSession desde la pantalla principal (sesión vencida) es rechazado y lleva a /login — validates AC-09 (sad path)
- [ ] `test_login_page_error_de_red_muestra_no_se_pudo_conectar` — error de red en el login muestra "No se pudo conectar con el servidor" (error) — sad path

**Completion criterion**
Los 9 tests pasan con `fetch` simulado, `npm run build -w web` compila sin errores, y con `npm run dev` se puede registrar el primer Admin, iniciar sesión y cerrarla desde el navegador.

## Final verification
- `npm test` (server + web) y `npm run typecheck` pasan; los 12 AC del PRD tienen al menos un test que los nombra.
- `validate_spec.py --tier FEATURE` pasa sobre este documento y `validate_threat.py --spec docs/daw/specs/spec-FEAT-001.md` pasa sobre el threat model.
- Ningún archivo de `server/src/domain/` ni `server/src/application/` importa de `server/src/infrastructure/`.
- `grep` de `password_hash`/`passwordHash` en las respuestas HTTP de los tests: cero apariciones.
