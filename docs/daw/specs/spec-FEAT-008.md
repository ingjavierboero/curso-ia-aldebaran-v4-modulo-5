# Spec FEAT-008: Recuperación de contraseña por email

| Field | Value |
|-------|-------|
| Ticket | FEAT-008 |
| PRD | docs/daw/prd/prd-FEAT-008.md |
| Tier | FEATURE |
| Date | 2026-11-16 |
| Spec loops | 1 |
| Loops since last human decision | 1 |

## Summary
Un token de recuperación aleatorio (256 bits, reusando `SessionTokenGenerator` en una instancia
propia) se guarda solo como hash en la tabla nueva `password_reset_tokens`. Tres casos de uso
(`RequestPasswordReset`, `CheckPasswordResetToken`, `ResetPasswordWithToken`) aplican las reglas de
vencimiento, uso único, anulación y enfriamiento dentro de la Unit of Work IMMEDIATE (ADR-003). El
email sale por un puerto `EmailSender` con nodemailer por SMTP y decoradores para la redirección de
desarrollo y la falta de credenciales (ADR-007); el envío no se espera en el camino de la respuesta y
su resultado lo registra un puerto `PasswordResetLog`. Tres rutas públicas con las compuertas de
FEAT-009 (ADR-006, D-05) y dos pantallas web nuevas completan el flujo.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 5 |
| FR-02 | Block 2, Block 3, Block 4 |
| FR-03 | Block 2, Block 3, Block 4 |
| FR-04 | Block 2, Block 4, Block 5 |
| FR-05 | Block 2, Block 4 |
| FR-06 | Block 1, Block 2 |
| FR-07 | Block 1, Block 2 |
| FR-08 | Block 1, Block 2 |
| FR-09 | Block 2, Block 4, Block 5 |
| FR-10 | Block 2, Block 5 |
| FR-11 | Block 5 |
| FR-12 | Block 2, Block 4, Block 5 |
| FR-13 | Block 2, Block 4, Block 5 |
| FR-14 | Block 4 |
| FR-15 | Block 1, Block 2, Block 4 |
| FR-16 | Block 4 |
| FR-17 | Block 3 |
| FR-18 | Block 2, Block 3, Block 4 |
| NFR-01 | Strategy: `CryptoSessionTokenGenerator` (32 bytes de `crypto.randomBytes`, base64url) y solo el SHA-256 hex en `token_hash`; el token nunca entra en el log ni en la API salvo en el body de check/confirm; test que recorre filas y log; Block 1, Block 2, Block 4 |
| NFR-02 | Strategy: `ResetPasswordWithToken` usa el `PasswordHasher` argon2id existente (ADR-002); test que recorre filas, log y respuestas; Block 2, Block 4 |
| NFR-03 | Strategy: el envío del email se dispara sin esperarlo, así la respuesta no depende de SMTP; las ramas con y sin usuario hacen una lectura y, con usuario, una transacción corta; test con `FakeEmailSender` de 500 ms que compara medianas; Block 2, Block 4 |
| NFR-04 | Strategy: `resolveGmailCredentials(env = process.env)` lee `GMAIL_USER`/`GMAIL_APP_PASSWORD` solo del entorno; nodemailer con `logger: false` y `debug: false`; SAST de secretos en CODE; Block 3 |

| Acceptance criterion | Covered by |
|---|---|
| AC-01 | Block 2, Block 4, Block 5 |
| AC-02 | Block 3, Block 4 |
| AC-03, AC-04 | Block 2, Block 4 |
| AC-05, AC-06, AC-07, AC-09 | Block 1, Block 2, Block 5 |
| AC-08, AC-10, AC-11, AC-13 | Block 2, Block 4 |
| AC-12, AC-14, AC-16 | Block 4 |
| AC-15 | Block 3 |

## Dependencies between blocks
Block 2 depende de Block 1 (entidad, repositorio y Unit of Work). Block 3 depende de Block 2 (puertos
`EmailSender` y `PasswordResetLog`). Block 4 depende de Block 2 y Block 3 (casos de uso y armado).
Block 5 depende de Block 4 (las rutas reales). Orden: 1 → 2 → 3 → 4 → 5.

## Block 1 — Token de recuperación: dominio y persistencia

**Files**
- `server/src/domain/auth/PasswordResetToken.ts` (new) — entidad y reglas puras: `RESET_TOKEN_TTL_MS = 10 * 60_000`, `RESET_EMAIL_COOLDOWN_MS = 5 * 60_000`, `PasswordResetToken.issue({ id, userId, tokenHash, now })`, `isUsable(now)`, `canIssueResetToken(latestCreatedAt: Date | null, now: Date)`.
- `server/src/domain/auth/PasswordResetTokenRepository.ts` (new) — puerto síncrono.
- `server/src/application/shared/UnitOfWork.ts` (modified) — `TransactionalRepositories.resetTokens`.
- `server/src/infrastructure/db/schema.ts` (modified) — tabla `passwordResetTokens` y su entrada en `export const schema`.
- `server/drizzle/0002_*.sql`, `server/drizzle/meta/0002_snapshot.json` (new) y `server/drizzle/meta/_journal.json` (modified) — generados con `npm run db:generate -w server`.
- `server/src/infrastructure/db/DrizzlePasswordResetTokenRepository.ts` (new) y `server/src/infrastructure/db/DrizzleUnitOfWork.ts` (modified).
- `server/test/support/InMemoryPasswordResetTokenRepository.ts` (new, con `snapshot()`/`restore()`), `server/test/support/InMemoryUnitOfWork.ts` (modified, 3.er parámetro opcional con un repositorio nuevo por defecto, para que `RegisterFirstAdmin.test.ts` e `InMemoryUnitOfWork.test.ts` sigan compilando), `server/test/support/authContext.ts` (modified).
- `server/test/domain/PasswordResetToken.test.ts` (new), `server/test/support/PasswordResetTokenRepository.contract.test.ts` (new, patrón de `JobRunRepository.contract.test.ts`, corre contra la versión en memoria y la Drizzle), `server/test/infrastructure/migrate.test.ts`, `server/test/infrastructure/DrizzleUnitOfWork.test.ts` e `server/test/support/InMemoryUnitOfWork.test.ts` (modified).

**Logic**
Implementa la base de FR-06, FR-07, FR-08 y FR-15. `issue` fija `expiresAt = now + RESET_TOKEN_TTL_MS`.
`isUsable(now)`: `usedAt === null && invalidatedAt === null && now < expiresAt` (a los 10 minutos
exactos ya no sirve). `canIssueResetToken(latest, now)`: `latest === null || now - latest >= RESET_EMAIL_COOLDOWN_MS`.
Repositorio: `insert(token)`, `findByTokenHash(hash)`, `latestCreatedAtForUser(userId)`,
`invalidateAllForUser(userId, now)` (pone `invalidated_at` a los que no tienen `used_at` ni
`invalidated_at`), `markUsed(id, now)`, `deleteExpiredForUser(userId, now)` (borra los vencidos hace
más de `RESET_EMAIL_COOLDOWN_MS`, para no perder el dato del enfriamiento). `used_at` significa "se
cambió la contraseña con él"; `invalidated_at`, "lo anuló otro token o el cambio de contraseña".

**Data model**
- Tabla `password_reset_tokens`: `id` text PK; `user_id` text NOT NULL FK → `users.id` ON DELETE CASCADE; `token_hash` text NOT NULL UNIQUE (SHA-256 hex, 64 caracteres); `created_at` text NOT NULL (ISO); `expires_at` text NOT NULL (ISO); `used_at` text NULL; `invalidated_at` text NULL; índice `password_reset_tokens_user_id_idx` sobre `user_id`.

**Input validation**
- `tokenHash`: lo calcula el server (64 hex); el repositorio no recibe texto del cliente.
- `userId`: viene de un `User` ya leído; la FK rechaza uno inexistente.

**Error handling**
- `token_hash` duplicado — la restricción UNIQUE lanza y la transacción se revierte (prácticamente imposible con 256 bits; se prueba con un hash forzado).
- `user_id` inexistente — la FK lanza y no queda fila.
- Error dentro de la Unit of Work — los cambios de `resetTokens` se revierten junto con los demás repositorios.

**Required tests**
- [ ] `test_reset_token_usable_a_los_9_minutos` — validates AC-05
- [ ] `test_reset_token_vencido_a_los_10_minutos_invalido` — a los 10 y a los 11 minutos `isUsable` es falso (sad path) — validates AC-06
- [ ] `test_reset_token_usado_invalido` — con `usedAt` no es usable (sad path) — validates AC-07
- [ ] `test_reset_token_anulado_invalido` — con `invalidatedAt` no es usable (sad path) — validates AC-08
- [ ] `test_can_issue_reset_token_respeta_5_minutos` — 4 min 59 s → falso; 5 min → verdadero; sin token → verdadero — validates AC-13
- [ ] `test_reset_token_repo_contrato_invalida_y_purga` — contrato en memoria y Drizzle: `invalidateAllForUser` no toca los usados, `deleteExpiredForUser` conserva los recientes, `latestCreatedAtForUser` — validates AC-08
- [ ] `test_reset_token_hash_duplicado_rechazado` — insertar dos veces el mismo hash lanza (sad path)
- [ ] `test_reset_token_usuario_inexistente_rechazado` — FK rechaza un `user_id` que no existe (sad path)
- [ ] `test_migracion_password_reset_tokens` — la tabla existe con UNIQUE, índice por usuario y borrar el usuario borra sus tokens
- [ ] `test_uow_error_revierte_reset_tokens` — un error dentro de `run` deja `resetTokens` sin cambios, en Drizzle y en memoria (sad path)

**Completion criterion**
Los 10 tests pasan, `PasswordResetToken.ts` no importa nada fuera de `domain/`, la migración se
aplica desde cero con `migrate.ts`, y `npm run typecheck` y `npm run lint` pasan.

## Block 2 — Casos de uso de la recuperación

**Files**
- `server/src/application/shared/EmailSender.ts` (new) — `interface EmailSender { send(message: { to: string; subject: string; text: string }): Promise<void> }`.
- `server/src/application/auth/PasswordResetLog.ts` (new) — puerto síncrono, nunca lanza: `delivered({ userId, email })`, `deliveryFailed({ userId, email, errorCode })`.
- `server/src/application/auth/RequestPasswordReset.ts` (new), `CheckPasswordResetToken.ts` (new), `ResetPasswordWithToken.ts` (new).
- `server/src/application/auth/errors.ts` (modified) — `InvalidResetToken` ("El enlace no es válido o venció").
- `server/test/support/FakeEmailSender.ts` (new — guarda los enviados; falla o demora programables con un diferido), `server/test/support/RecordingPasswordResetLog.ts` (new).
- `server/test/application/RequestPasswordReset.test.ts`, `CheckPasswordResetToken.test.ts`, `ResetPasswordWithToken.test.ts` (new); `server/test/application/passwordResetRace.test.ts` (new, sobre SQLite real con `sqliteTestDb.ts`).

**Logic**
`RequestPasswordReset` (deps `users`, `uow`, `resetTokenGenerator`, `ids`, `clock`, `emailSender`,
`resetLog`, `appUrl`) — `execute(rawEmail): 'issued' | 'no_user' | 'throttled'`:
1. `Email.create(rawEmail)`; si es inválido o no hay usuario Activo con ese email → `no_user` (no envía, FR-05).
2. Si `!canIssueResetToken(latestCreatedAtForUser, now)` → `throttled` (FR-15).
3. Genera el token y en `uow.run` vuelve a controlar el enfriamiento sobre el repositorio de la transacción (si ya hay uno reciente → `throttled`), purga vencidos, `invalidateAllForUser` (FR-08) e inserta el nuevo.
4. Dispara `emailSender.send({ to: user.email, subject: 'Recuperación de contraseña de Aldebaran', text })` sin esperarlo (`void promise.then(…, …)`), con el texto: la URL `${appUrl}/recuperar/${token}` (FR-03) y "El enlace vence en 10 minutos. Si no pediste el cambio, ignorá este email." Al resolver llama `resetLog.delivered`; al rechazar, `resetLog.deliveryFailed` con `errorCode` = `err.code` si es string, si no `err.name` (nunca el mensaje ni el texto del email). Devuelve `issued`.

`CheckPasswordResetToken` — `execute(token)`: valida formato (`/^[A-Za-z0-9_-]{43}$/`), calcula el hash, busca; si no existe, `!isUsable(now)` o el usuario no está Activo → `InvalidResetToken` (FR-09, FR-10).

`ResetPasswordWithToken` — `execute({ token, newPassword })`: `PasswordPolicy.assert(newPassword)`
primero (WeakPassword deja el token válido, AC-10); después el mismo chequeo que `Check`; `hasher.hash`
fuera de la transacción; en `uow.run` relee el token (si ya no es usable → `InvalidResetToken`) y el
usuario Activo, `users.updatePasswordHash(user.withPasswordHash(hash))`, `resetTokens.markUsed`,
`invalidateAllForUser` y `sessions.deleteByUserId` (FR-07, FR-13, D-01).

**Data model**
- Reutiliza `password_reset_tokens` de Block 1 — sin cambio de esquema; restricciones como están declaradas ahí: `token_hash` NOT NULL UNIQUE, `user_id` NOT NULL FK ON DELETE CASCADE, `expires_at` NOT NULL, índice por usuario. Reutiliza `users.password_hash` y `sessions` sin cambios.

**Input validation**
- `rawEmail`: string; formato con `Email.create` (trim, minúsculas); inválido → `no_user`, sin error visible.
- `token`: string de exactamente 43 caracteres base64url; cualquier otro → `InvalidResetToken`.
- `newPassword`: string de 8 a 1024 caracteres (`PasswordPolicy`), FR-12.

**Error handling**
- Email inválido o sin usuario Activo — `no_user`, sin email ni token (FR-05).
- Pedido dentro de los 5 minutos — `throttled`, sin email ni token nuevo (FR-15).
- Falla del envío — `deliveryFailed` en el log; el resultado del pedido sigue siendo `issued` (FR-04, D-03).
- Token inexistente, con formato inválido, vencido, usado, anulado o de usuario Inactivo — `InvalidResetToken`.
- Contraseña nueva fuera de 8–1024 — `WeakPassword`, el token sigue válido.
- Token consumido por otra confirmación entre la lectura y la transacción — `InvalidResetToken`, la contraseña no cambia.

**Required tests**
- [ ] `test_request_usuario_activo_envia_url_con_token` — un email a `user.email`, asunto fijo, URL `${appUrl}/recuperar/<token>` y aviso de 10 minutos; en la base solo el hash — validates AC-01
- [ ] `test_request_usa_app_url_configurada` — con `appUrl = https://aldebaran.empresa.com` la URL empieza así — validates AC-02
- [ ] `test_request_email_inexistente_no_envia` — `no_user`, 0 emails, 0 tokens — validates AC-03
- [ ] `test_request_usuario_inactivo_no_envia` — usuario Inactivo → `no_user`, 0 emails (sad path)
- [ ] `test_request_email_invalido_no_envia` — "no-es-email" → `no_user` (sad path)
- [ ] `test_request_envio_con_error_registra_fallo` — `FakeEmailSender` que rechaza con `code: 'EAUTH'`: resultado `issued` y `deliveryFailed` con `errorCode: 'EAUTH'`, sin el texto del email (sad path) — validates AC-04
- [ ] `test_request_dentro_de_5_minutos_rechazado_sin_token_nuevo` — a los 3 minutos `throttled`, 1 email y el primer token sigue usable (sad path) — validates AC-13
- [ ] `test_request_nuevo_token_invalida_anterior` — a los 6 minutos el primer token deja de ser usable y el segundo sirve — validates AC-08
- [ ] `test_request_no_espera_el_envio` — con un envío que nunca resuelve, `execute` devuelve `issued` igual — validates AC-01
- [ ] `test_check_token_valido_a_los_9_minutos` — validates AC-05
- [ ] `test_check_token_vencido_invalido` — 11 minutos → `InvalidResetToken` (sad path) — validates AC-06
- [ ] `test_check_token_usado_invalido` — después de un cambio exitoso → `InvalidResetToken` (sad path) — validates AC-07
- [ ] `test_check_token_formato_invalido` — 10 caracteres o con `/` → `InvalidResetToken` (sad path)
- [ ] `test_check_usuario_inactivo_invalido` — usuario desactivado después del pedido → `InvalidResetToken` (sad path)
- [ ] `test_reset_cambia_contraseña_y_cierra_sesiones` — 2 sesiones → 0, la nueva verifica con el hasher, el token queda usado — validates AC-11
- [ ] `test_reset_contraseña_corta_rechazada_token_sigue_valido` — 7 caracteres → `WeakPassword`, hash sin cambios, `Check` sigue OK (sad path) — validates AC-10
- [ ] `test_reset_contraseña_larga_rechazada` — 1025 caracteres → `WeakPassword` (sad path)
- [ ] `test_reset_token_vencido_invalido_no_cambia` — vence con la pantalla abierta: `InvalidResetToken` y el hash no cambia (sad path) — validates AC-09
- [ ] `test_race_dos_pedidos_simultaneos_un_token` — SQLite real: dos `execute` concurrentes para el mismo usuario dejan 1 token y 1 email (sad path: conflict)
- [ ] `test_race_dos_confirmaciones_una_rechazada` — SQLite real: una cambia la contraseña y la otra lanza `InvalidResetToken` (sad path: conflict)

**Completion criterion**
Los 20 tests pasan, los casos de uso solo dependen de puertos (`domain/` y `application/`), y
`npm run typecheck` y `npm run lint` pasan (sin promesas flotantes).

## Block 3 — Envío de emails, configuración y log del envío

**Files**
- `server/package.json` y `package-lock.json` (raíz) (modified) — `nodemailer` y `@types/nodemailer` (ADR-007).
- `server/src/infrastructure/email/SmtpEmailSender.ts` (new) — `nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 15_000, logger: false, debug: false })`, `from: GMAIL_USER`.
- `server/src/infrastructure/email/RedirectingEmailSender.ts` (new) — decorador: reemplaza `to` por la dirección de redirección.
- `server/src/infrastructure/email/UnconfiguredEmailSender.ts` (new) — `send` rechaza con un `Error` de `name = 'EmailUnconfigured'`.
- `server/src/infrastructure/email/emailConfig.ts` (new) — `resolveAppUrl(env = process.env)`, `resolveEmailRedirect(env = process.env)`, `resolveGmailCredentials(env = process.env)`.
- `server/src/infrastructure/logging/passwordResetLog.ts` (new) — adaptador de `PasswordResetLog` sobre el `Logger`: `{ event: 'password_reset_request', outcome: 'sent' | 'send_failed', email, errorCode?, at }`.
- `server/src/main.ts` (modified) — arma el sender (`Redirecting(Smtp | Unconfigured)`), registra `email_unconfigured` o `email_redirect_active` al arrancar, crea la instancia `resetTokenGenerator` y los tres casos de uso, y corta con `startup_failed` si la configuración es inválida.
- `server/test/infrastructure/emailConfig.test.ts`, `RedirectingEmailSender.test.ts`, `UnconfiguredEmailSender.test.ts`, `SmtpEmailSender.test.ts`, `passwordResetLog.test.ts` (new).

**Logic**
Implementa FR-02 (envío real), FR-03 (dirección configurada), FR-17 y la parte de log de FR-18.
`resolveAppUrl`: sin `APP_URL` (o vacía) → `http://localhost:5173`; con valor, `new URL()` con
protocolo `http:`/`https:`, sin usuario/contraseña, sin query ni fragment; devuelve `origin + pathname`
sin barra final; inválida → lanza `InvalidConfig('APP_URL')`. `resolveEmailRedirect`: vacía → `null`;
con valor, `Email.create` (inválido → `InvalidConfig('EMAIL_REDIRECT_TO')`). `resolveGmailCredentials`:
las dos presentes → `{ user, pass }`; falta alguna → `null`. `SmtpEmailSender` se prueba con un
transporte inyectado (sin red). Ningún adaptador registra el mensaje ni las credenciales.

**Input validation**
- `APP_URL`: URL absoluta http/https, sin credenciales, query ni fragment; máx. 2048 caracteres.
- `EMAIL_REDIRECT_TO`: email válido según `Email.create`.
- `GMAIL_USER` / `GMAIL_APP_PASSWORD`: strings no vacíos; se usan solo si están las dos.

**Error handling**
- `APP_URL` inválida — `InvalidConfig`, el server no arranca (`startup_failed`).
- `EMAIL_REDIRECT_TO` inválido — `InvalidConfig`, el server no arranca.
- Credenciales faltantes — arranca con `UnconfiguredEmailSender`, log `email_unconfigured`; cada envío falla con `EmailUnconfigured`.
- SMTP rechaza o no responde (timeout de 15 s) — `send` rechaza; el caso de uso lo registra como `send_failed`.

**Required tests**
- [ ] `test_app_url_por_defecto_localhost` — sin variable → `http://localhost:5173` — validates AC-02
- [ ] `test_app_url_configurada_sin_barra_final` — `https://aldebaran.empresa.com/` → `https://aldebaran.empresa.com` — validates AC-02
- [ ] `test_app_url_invalida_rechazada` — `ftp://x`, `https://u:p@x`, `https://x/?a=1` y `no-url` lanzan `InvalidConfig` (sad path)
- [ ] `test_email_redirect_invalido_rechazado` — `no-es-email` lanza `InvalidConfig` (sad path)
- [ ] `test_redirect_envia_a_la_direccion_de_desarrollo` — con `dev@empresa.com`, el `to` del sender interno es `dev@empresa.com` — validates AC-15
- [ ] `test_credenciales_faltantes_sender_sin_configurar` — solo `GMAIL_USER` → `null`; `UnconfiguredEmailSender.send` rechaza con `EmailUnconfigured` (sad path)
- [ ] `test_smtp_error_rechaza_sin_registrar_mensaje` — transporte que falla (incluido un timeout): `send` rechaza y el logger no recibió el texto (sad path)
- [ ] `test_smtp_opciones_de_transporte` — host, puerto 465, `secure`, timeouts de 15 s, `logger`/`debug` en false y `from` = `GMAIL_USER`
- [ ] `test_password_reset_log_sin_token` — `delivered`/`deliveryFailed` escriben `sent`/`send_failed` con email y `errorCode`, sin token ni URL — validates AC-16

**Completion criterion**
Los 9 tests pasan, `git grep` no encuentra credenciales en el repo, y `npm run typecheck` y
`npm run lint` pasan con la dependencia instalada.

## Block 4 — Rutas públicas, límites y log de autenticación

**Files**
- `server/src/infrastructure/http/routes/passwordReset.ts` (new) — las tres rutas.
- `server/src/infrastructure/http/app.ts` (modified) — `AppDeps` suma `requestPasswordReset`, `checkPasswordResetToken`, `resetPasswordWithToken`; `createApp` crea `resetRequestTracker`, `resetConfirmTracker` y sus compuertas (`resetRequestGate`, `resetCheckGate`, `resetConfirmGate`) con nombre propio, como en FEAT-009.
- `server/src/infrastructure/http/authMiddleware.ts` (modified) — `PUBLIC_ROUTES` suma `POST /api/auth/password-reset`, `POST /api/auth/password-reset/check`, `POST /api/auth/password-reset/confirm`.
- `server/src/infrastructure/http/authLog.ts` (modified) — `AuthEvent` suma `password_reset_request` y `password_reset_confirm`; `AuthOutcome` suma `sent`, `no_user`, `throttled`, `send_failed`, `invalid_token`.
- `server/src/infrastructure/http/errorHandler.ts` (modified) — `InvalidResetToken` → 400.
- `server/test/support/testApp.ts` (modified) — arma los casos de uso con dobles (`FakeEmailSender`, `RecordingPasswordResetLog` o el adaptador real sobre el logger de prueba).
- `server/test/http/passwordReset.test.ts` (new), `server/test/http/middleware.test.ts` (modified).

**Logic**
Implementa FR-02 a FR-05, FR-09, FR-12 a FR-16 y FR-18 en HTTP.
- `POST /api/auth/password-reset`: `resetRequestGate` → handler que llama **primero** a `resetRequestTracker.fail(attemptKey(req))` (cuenta todo pedido que pasó la compuerta, incluso con body inválido; nunca `succeed`; con D-05 el 5.º bloquea y el 6.º recibe 429), después parsea `{ email }` y llama al caso de uso. Responde siempre 200 `{ message: 'Si el email corresponde a un usuario activo, te enviamos un enlace para definir una nueva contraseña. Revisá tu casilla.' }`. Log: `no_user`/`throttled` al responder (`logAuthAttempt`); con `issued` no registra en la ruta, porque lo hace `PasswordResetLog` al terminar el envío (una línea por pedido).
- `POST /api/auth/password-reset/check`: `resetCheckGate` → `{ token }` → 204; `InvalidResetToken` → `resetConfirmTracker.fail` y 400.
- `POST /api/auth/password-reset/confirm`: `resetConfirmGate` → `{ token, newPassword }` → 204 y log `ok`; `InvalidResetToken` → `fail`, log `invalid_token`, 400; `WeakPassword` → log `invalid`, 400, sin contar.
- `resetCheckGate` y `resetConfirmGate` comparten `resetConfirmTracker`, que nunca llama a `succeed` (un token válido propio no reinicia el conteo). El email de la confirmación en el log es `''` (queda `null`).

**API contract**
- Method + path: `POST /api/auth/password-reset`, `POST /api/auth/password-reset/check`, `POST /api/auth/password-reset/confirm`
- Request: `{ email: string }`; `{ token: string }`; `{ token: string, newPassword: string }` (JSON)
- Response: 200 `{ message: string }`; 204 sin cuerpo; 204 sin cuerpo
- Error codes: `400` (`InvalidBody`, `InvalidResetToken` "El enlace no es válido o venció", `WeakPassword`), `415`, `429` "Demasiados intentos. Probá de nuevo en N minutos." con `Retry-After`, `500`
- Auth: públicas (sin sesión), en `PUBLIC_ROUTES`; límite por IP con `createAttemptGate` (ADR-006)

**Data model**
- Reutiliza `password_reset_tokens` de Block 1 — sin cambio de esquema; restricciones como están declaradas ahí: `token_hash` NOT NULL UNIQUE, `user_id` NOT NULL FK ON DELETE CASCADE, índice por usuario. Los registros de intentos viven en memoria como en FEAT-009 (clave `ipKeyGenerator`, sin persistencia).

**Input validation**
- Body: objeto JSON (`bodyObject`); si no → 400 `InvalidBody`.
- `email`: string requerido (`requiredString`), máx. 254 caracteres; el formato lo resuelve el caso de uso sin revelar nada.
- `token`: string requerido, máx. 64 caracteres antes de llegar al caso de uso.
- `newPassword`: string requerido; largo 8–1024 en el caso de uso.

**Error handling**
- Body inválido en el pedido — 400 `InvalidBody`, y el pedido cuenta para el límite.
- Token inválido en check o confirm — 400 y cuenta para el límite de confirmaciones.
- Contraseña nueva inválida — 400 `WeakPassword`, no cuenta y el token sigue válido.
- IP bloqueada — 429 con `Retry-After`, sin ejecutar el caso de uso ni validar el token; no cuenta.
- Error inesperado — 500 genérico de `errorHandler`, sin token en el log.

**Required tests**
- [ ] `test_http_pedido_mismo_mensaje_exista_o_no` — usuario Activo e inexistente: mismo 200 y mismo cuerpo; 1 email solo para el existente — validates AC-01, AC-03
- [ ] `test_http_url_ignora_host_de_la_solicitud` — con `Host: otro-sitio.com` y `APP_URL` configurada, la URL del email empieza con `https://aldebaran.empresa.com` — validates AC-02
- [ ] `test_http_envio_con_error_mismo_mensaje_y_log` — sender que falla: 200 igual y una línea `send_failed` (sad path) — validates AC-04
- [ ] `test_http_pedido_body_invalido_rechazado_y_cuenta` — body sin email → 400 y cuenta para el límite (sad path)
- [ ] `test_http_sexto_pedido_rechazado_429` — 6 pedidos desde la misma IP: el 6.º da 429 con los minutos y `Retry-After` (sad path) — validates AC-12
- [ ] `test_http_dos_pedidos_en_3_minutos_un_email` — mismo mensaje, 1 email, la URL sigue válida — validates AC-13
- [ ] `test_http_confirm_cambia_y_cierra_sesiones` — 2 sesiones → 401 en ambas, login con la nueva 200 — validates AC-11
- [ ] `test_http_confirm_contraseña_corta_rechazada` — 400 y el check posterior da 204 (sad path) — validates AC-10
- [ ] `test_http_token_invalido_rechazado_400` — check y confirm con token inexistente → 400 "El enlace no es válido o venció" (sad path) — validates AC-07
- [ ] `test_http_sexta_confirmacion_rechazada_con_token_valido` — 5 tokens inválidos y después uno válido → 429 sin validar (sad path) — validates AC-14
- [ ] `test_http_token_valido_no_reinicia_conteo` — 4 inválidos, 1 check válido, 1 inválido → el siguiente da 429 (sad path)
- [ ] `test_http_bloqueado_no_cuenta` — los 429 no extienden el bloqueo — validates AC-12
- [ ] `test_http_log_sin_token_ni_contraseña` — pedido + confirmación: el log tiene `password_reset_request` (`sent`) y `password_reset_confirm` (`ok`); ni el log ni las filas contienen el token ni la contraseña — validates AC-16
- [ ] `test_http_tiempo_de_respuesta_parejo` — sender de 500 ms; 20 pedidos de cada clase (existe, no existe, enfriamiento): diferencia de medianas < 100 ms y ninguno tarda ≥ 500 ms — validates AC-03
- [ ] `test_middleware_rutas_de_recuperacion_publicas` — las 3 rutas pasan sin sesión; variantes con otro método → 401 (sad path: unauthorized)

**Completion criterion**
Los 15 tests pasan, los tests HTTP existentes siguen en verde, y `npm run typecheck` y
`npm run lint` pasan.

## Block 5 — Web: "Olvidé mi contraseña" y cambio con el enlace

**Files**
- `web/src/api/authApi.ts` (modified) — `requestPasswordReset(email)`, `checkResetToken(token)`, `confirmPasswordReset(token, newPassword)`; `web/src/api/authApi.test.ts` (modified).
- `web/src/pages/LoginPage.tsx` (modified) — enlace "Olvidé mi contraseña" a `/recuperar`; `web/src/pages/LoginPage.test.tsx` (modified).
- `web/src/pages/ForgotPasswordPage.tsx` (new) y `ForgotPasswordPage.test.tsx` (new) — `/recuperar`.
- `web/src/pages/ResetPasswordPage.tsx` (new) y `ResetPasswordPage.test.tsx` (new) — `/recuperar/:token`.
- `web/src/router.tsx` (modified) — `/recuperar` (sin loader) y `/recuperar/:token` (con `resetTokenLoader`), antes del comodín `*`; `web/src/router.test.tsx` (modified).
- `web/index.html` (modified) — `<meta name="referrer" content="no-referrer">`.

**Logic**
Implementa FR-01, FR-04, FR-09 a FR-13 en la web. `ForgotPasswordPage`: formulario con email
(requerido, formato) → `requestPasswordReset` → muestra el mensaje del server y un enlace a `/login`.
`resetTokenLoader`: llama una vez por navegación a `checkResetToken` (con `navigateOnUnauthorized:
false`) y devuelve `{ status: 'valid' | 'invalid' | 'blocked', message? }`. `ResetPasswordPage`:
apenas monta hace `history.replaceState` a `/recuperar` (el token deja la barra); con `invalid` o
`blocked` muestra el mensaje y a los 5 s navega a `/login` (timer limpiado al desmontar); con `valid`,
formulario con nueva contraseña y repetición (`USER_PASSWORD_MIN_LENGTH`/`MAX_LENGTH` de
`userRules.ts`, deben coincidir); éxito → `/login` con `loginNoticeState({ type: 'success', text:
'Contraseña cambiada. Iniciá sesión con la nueva.' })`; `InvalidResetToken` al confirmar → mensaje y
redirección a los 5 s; otro 400 o 429 → mensaje en pantalla conservando el formulario.

**API contract**
- Method + path: `POST /api/auth/password-reset`, `POST /api/auth/password-reset/check`, `POST /api/auth/password-reset/confirm` (consumidos; los define Block 4)
- Request: `{ email }`, `{ token }`, `{ token, newPassword }` vía `request` de `client.ts`
- Response: 200 `{ message }`; 204; 204 — errores como `ApiError(status, mensaje)`
- Error codes: `400`, `429`, `500`
- Auth: públicas; sin cookie de sesión requerida

**Input validation**
- Email: requerido, formato de email (regla de antd), máx. 254.
- Nueva contraseña: requerida, 8–1024 caracteres.
- Repetición: requerida e igual a la nueva.

**Error handling**
- Token inválido al entrar — mensaje "El enlace no es válido o venció" y redirección a `/login` a los 5 s.
- Token inválido al confirmar — el mismo mensaje y redirección a los 5 s.
- Contraseñas que no coinciden o fuera de largo — error en el formulario, sin llamar a la API.
- 429 o error de red — mensaje en pantalla; el formulario conserva lo ingresado.

**Required tests**
- [ ] `test_login_page_enlace_olvide_mi_contraseña` — el enlace lleva a `/recuperar` — validates AC-01
- [ ] `test_forgot_password_muestra_mensaje_fijo` — envía el email y muestra el mensaje del server — validates AC-01, AC-03
- [ ] `test_forgot_password_email_invalido_rechazado` — "no-es-email" no llama a la API (sad path)
- [ ] `test_reset_page_token_valido_muestra_formulario` — loader `valid` → dos campos de contraseña — validates AC-05
- [ ] `test_reset_page_token_invalido_redirige_a_los_5_segundos` — loader `invalid` → mensaje; con timers falsos, a los 4,9 s sigue y a los 5 s está en `/login` (sad path) — validates AC-06, AC-07
- [ ] `test_reset_page_token_vencido_al_confirmar_rechazado` — confirm 400 → mensaje y `/login` a los 5 s (sad path) — validates AC-09
- [ ] `test_reset_page_contraseñas_distintas_rechazado` — no llama a la API (sad path)
- [ ] `test_reset_page_contraseña_corta_rechazada` — 7 caracteres no llama a la API (sad path) — validates AC-10
- [ ] `test_reset_page_exito_redirige_a_login_con_aviso` — 204 → `/login` con el aviso de éxito — validates AC-11
- [ ] `test_reset_page_bloqueo_429_error_muestra_mensaje` — confirm 429 → mensaje y formulario intacto (sad path)
- [ ] `test_reset_page_quita_token_de_la_barra` — después de montar, `location.pathname` es `/recuperar`
- [ ] `test_auth_api_funciones_de_recuperacion` — las tres funciones llaman al método, ruta y body correctos

**Completion criterion**
Los 12 tests pasan, la suite web sigue en verde y `npm run typecheck` y `npm run lint` pasan.

## Final verification
`npm test`, `npm run lint` y `npm run typecheck` en verde; los 66 Required tests presentes con sus
identificadores `test_...`; la migración 0002 se aplica sobre una base existente de FEAT-009; en el PR,
el escaneo de CodeQL no abre alertas `js/missing-rate-limiting` sobre `/api/auth/password-reset*`;
rollback: revertir los commits del ticket (la tabla nueva queda sin uso y no afecta a las demás).
