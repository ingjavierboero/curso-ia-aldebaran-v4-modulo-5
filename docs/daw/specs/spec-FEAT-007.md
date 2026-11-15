# Spec FEAT-007: Cambio de la propia contraseña

| Field | Value |
|-------|-------|
| Ticket | FEAT-007 |
| PRD | docs/daw/prd/prd-FEAT-007.md |
| Tier | FEATURE |
| Date | 2026-11-15 |
| Spec loops | 1 |
| Loops since last human decision | 1 |

## Summary
Un caso de uso nuevo, `ChangeOwnPassword` (`application/auth`), verifica la contraseña actual con
argon2id fuera de la transacción, hashea la nueva y, dentro de una transacción `IMMEDIATE`, guarda el
hash con compare-and-set y borra las demás sesiones del usuario. Se expone como
`POST /api/auth/password` (con sesión) y registra cada intento en el log de autenticación. En la web,
una pantalla nueva "Mi perfil" (`/perfil`) muestra los datos del usuario en solo lectura y el
formulario de cambio. Tres bloques: dominio y caso de uso, HTTP y log, web. Sin cambios de esquema ni migraciones: el rollback es revertir los commits del ticket, sin datos que deshacer (los hashes guardados siguen siendo argon2id válidos).

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 3 |
| FR-02 | Block 3 |
| FR-03 | Block 1, Block 2, Block 3 |
| FR-04 | Block 1, Block 2 |
| FR-05 | Block 1, Block 2, Block 3 |
| FR-06 | Block 1, Block 2 |
| FR-07 | Block 1 |
| FR-08 | Block 3 |
| FR-09 | Block 2 |
| FR-10 | Block 2, Block 3 |
| NFR-01 | Strategy: la nueva solo se guarda como hash argon2id (`PasswordHasher` existente); el log no recibe contraseñas; la respuesta es 204 sin body. Tests en Block 1 y Block 2 |
| NFR-02 | Strategy: el caso de uso solo recibe el actor de la sesión (`sessionContext`), sin id objetivo en ruta ni body; Block 1 y Block 2 |
| NFR-03 | Strategy: se reutiliza `PasswordPolicy.assert` (8 a 1024), la misma regla del primer Admin y del alta; Block 1 |

| Acceptance criterion | Covered by |
|---|---|
| AC-01, AC-02, AC-10, AC-13, AC-14 | Block 3 |
| AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09 | Block 1 (y Block 2 para AC-05..AC-08 por HTTP) |
| AC-11, AC-12, AC-15 | Block 2 |

## Dependencies between blocks
Block 2 depende de Block 1 (usa `ChangeOwnPassword` y sus errores). Block 3 depende de Block 2 (el
endpoint). Orden: 1 → 2 → 3.

## Block 1 — Dominio y caso de uso

**Files**
- `server/src/domain/user/PasswordPolicy.ts` (modified) — `assertChanged(current: string, next: string): void`, lanza `PasswordUnchanged` si son iguales (FR-06).
- `server/src/domain/user/errors.ts` (modified) — `PasswordUnchanged` ("La contraseña nueva debe ser distinta de la actual").
- `server/src/domain/user/User.ts` (modified) — `withPasswordHash(passwordHash: string): User`, inmutable como `withProfile`.
- `server/src/domain/user/UserRepository.ts` (modified) — `updatePasswordHash(user: User): void`: guarda solo el hash del usuario con ese id; el `update` general sigue sin tocar el hash.
- `server/src/domain/auth/SessionRepository.ts` (modified) — `deleteByUserIdExcept(userId: string, keepSessionId: string): number`.
- `server/src/application/auth/errors.ts` (modified) — `IncorrectCurrentPassword` ("La contraseña actual es incorrecta"), junto a `InvalidCredentials` (resultado de una verificación de application).
- `server/src/application/auth/ChangeOwnPassword.ts` (new) — el caso de uso.
- `server/src/infrastructure/db/DrizzleUserRepository.ts` (modified) — implementa `updatePasswordHash`.
- `server/src/infrastructure/db/DrizzleSessionRepository.ts` (modified) — implementa `deleteByUserIdExcept`.
- `server/test/support/InMemoryUserRepository.ts` (modified) — implementa `updatePasswordHash`, respetando `snapshot()`/`restore()`.
- `server/test/support/InMemorySessionRepository.ts` (modified) — implementa `deleteByUserIdExcept`, respetando `snapshot()`/`restore()`.
- `server/test/support/authContext.ts` (modified) — suma `changeOwnPassword` al contexto de casos de uso.
- `server/test/application/ChangeOwnPassword.test.ts` (new), `server/test/domain/PasswordPolicy.test.ts` (modified), `server/test/domain/User.test.ts` (modified), `server/test/infrastructure/DrizzleUserRepository.test.ts` (modified), `server/test/infrastructure/DrizzleSessionRepository.test.ts` (modified) — tests.

**Logic**
Implementa FR-03 a FR-07. `ChangeOwnPassword` recibe deps `{ users, uow, hasher, tokens }` (`users`
sin transacción para la primera lectura, como `Login`; `uow` para el control y la escritura) y
`execute({ actor, sessionToken, currentPassword, newPassword }): Promise<void>`, con este único orden:
1. `PasswordPolicy.assert(newPassword)` → `WeakPassword` (FR-05), antes de tocar la base.
2. `users.findById(actor.id)`; inexistente o Inactivo → `Unauthenticated`.
3. `hasher.verify(user.passwordHash, currentPassword)`; falso → `IncorrectCurrentPassword` (FR-04).
4. `PasswordPolicy.assertChanged(currentPassword, newPassword)` → `PasswordUnchanged` (FR-06).
5. `hasher.hash(newPassword)` fuera de la transacción (ADR-003).
6. `uow.run`: busca la sesión actual por `tokens.hash(sessionToken)`; inexistente o de otro usuario
   → `Unauthenticated` (R-05). Relee el usuario: inexistente o Inactivo → `Unauthenticated`;
   `passwordHash` distinto del verificado en el paso 3 → `IncorrectCurrentPassword` (compare-and-set,
   R-04). Luego `users.updatePasswordHash(user.withPasswordHash(newHash))` y
   `sessions.deleteByUserIdExcept(user.id, session.id)` (FR-07).
No hay permiso de `Authorization`: cualquier perfil cambia la propia (RF-13). El caso de uso no
recibe un id objetivo (NFR-02).

**Data model**
- Reutiliza `users` de FEAT-001 — sin cambio de esquema; restricciones como están declaradas: `id` PK, `password_hash` text NOT NULL, `email` UNIQUE. `updatePasswordHash` escribe solo `password_hash` filtrando por `id`.
- Reutiliza `sessions` de FEAT-001 — sin cambio de esquema; restricciones como están declaradas: `id` PK, `user_id` NOT NULL con FK a `users.id`, `token_hash` UNIQUE. `deleteByUserIdExcept` borra `WHERE user_id = ? AND id <> ?`.

**Input validation**
- `newPassword`: string de 8 a 1024 caracteres (`PasswordPolicy.assert`).
- `newPassword` distinta de `currentPassword` (`PasswordPolicy.assertChanged`, comparación exacta).
- `currentPassword`: string; se verifica contra el hash (el tope de 1024 lo aplica la ruta, Block 2).

**Error handling**
- Contraseña nueva de menos de 8 o más de 1024 caracteres — `WeakPassword`; nada cambia.
- Contraseña actual incorrecta — `IncorrectCurrentPassword`; nada cambia y ninguna sesión se cierra.
- Contraseña nueva igual a la actual — `PasswordUnchanged`; nada cambia.
- Usuario inexistente o Inactivo, o sesión inexistente o de otro usuario — `Unauthenticated`; nada cambia.
- La contraseña cambió entre la verificación y la transacción (cambio concurrente) — `IncorrectCurrentPassword`; la transacción no escribe.

**Required tests**
- [ ] `test_password_policy_assert_changed_igual_rechazado` — lanza `PasswordUnchanged` con la misma contraseña y no lanza con una distinta (sad path) — validates AC-08
- [ ] `test_user_with_password_hash_no_muta_el_original` — devuelve un usuario con el hash nuevo y el resto igual — validates AC-03
- [ ] `test_change_own_password_guarda_la_nueva` — después del cambio la nueva verifica y la anterior no — validates AC-03
- [ ] `test_change_own_password_perfil_consulta` — un usuario Consulta cambia la propia — validates AC-04
- [ ] `test_change_own_password_actual_incorrecta_rechazado` — `IncorrectCurrentPassword`, el hash no cambia y las 2 sesiones siguen (sad path) — validates AC-05
- [ ] `test_change_own_password_nueva_corta_rechazado` — 7 caracteres → `WeakPassword`, sin cambios (sad path) — validates AC-06
- [ ] `test_change_own_password_nueva_larga_rechazado` — 1025 caracteres → `WeakPassword`, sin cambios (sad path) — validates AC-07
- [ ] `test_change_own_password_igual_a_la_actual_rechazado` — `PasswordUnchanged`, sin cambios (sad path) — validates AC-08
- [ ] `test_change_own_password_cierra_las_demas_sesiones` — con 2 sesiones, la otra se borra y la actual sigue — validates AC-09
- [ ] `test_change_own_password_usuario_inactivo_no_autorizado` — `Unauthenticated` si el usuario fue dado de baja durante el hash (sad path) — validates AC-15
- [ ] `test_change_own_password_sesion_de_otro_usuario_rechazado` — `Unauthenticated` si la sesión no es del actor; nada cambia (sad path) — validates NFR-02
- [ ] `test_change_own_password_cambio_concurrente_rechazado` — si el hash cambió antes de la transacción, `IncorrectCurrentPassword` y no escribe (sad path) — validates AC-05
- [ ] `test_drizzle_update_password_hash_solo_cambia_el_hash` — nombre, email, perfil y estado quedan igual — validates AC-03
- [ ] `test_drizzle_delete_by_user_id_except_conserva_la_actual` — borra las demás sesiones del usuario, conserva la indicada y no toca las de otros usuarios — validates AC-09

**Completion criterion**
Los 14 tests pasan, `npm run typecheck` pasa con los dobles en memoria actualizados y
`ChangeOwnPassword` no importa nada de `infrastructure/`.

## Block 2 — HTTP y log

**Files**
- `server/src/infrastructure/http/sessionContext.ts` (new) — `sessionContext(req): { actor, email, sessionToken }`, lanza `Unauthenticated` si falta `req.user` o `req.sessionToken`; reemplaza la guarda privada `actorOf` de `routes/users.ts`.
- `server/src/infrastructure/http/routes/users.ts` (modified) — usa `sessionContext` en lugar de `actorOf`.
- `server/src/infrastructure/http/routes/auth.ts` (modified) — `POST /auth/password`.
- `server/src/infrastructure/http/authLog.ts` (modified) — `AuthEvent` + `'password_change'`; `AuthOutcome` + `'wrong_current'`; docstring de `logAuthAttempt` actualizado.
- `server/src/infrastructure/http/errorHandler.ts` (modified) — `IncorrectCurrentPassword` y `PasswordUnchanged` → 400 `{ error }`.
- `server/src/infrastructure/http/app.ts` (modified) — `AppDeps` suma `changeOwnPassword`.
- `server/src/main.ts` (modified) — crea `new ChangeOwnPassword({ users, uow, hasher, tokens })`.
- `server/test/support/testApp.ts` (modified) — suma `changeOwnPassword` al `AppDeps` de test.
- `server/test/http/auth.test.ts` (modified) — tests del endpoint y del log.

**Logic**
Implementa FR-03 a FR-06, FR-09 y FR-10 por HTTP. La ruta, dentro de un `try` que registra el intento:
parsea el body (`bodyObject`, `requiredString`), toma `{ actor, email, sessionToken }` de
`sessionContext(req)` y llama `changeOwnPassword.execute`. Registra con
`logAuthAttempt(logger, clock, req, 'password_change', outcome, email)`: `ok` si se cambió;
`wrong_current` ante `IncorrectCurrentPassword`; `invalid` ante `WeakPassword`, `PasswordUnchanged` o
`InvalidBody`; `error` ante cualquier otro (incluido `Unauthenticated` por baja concurrente). El email
es el de la sesión; nunca se pasan contraseñas. `IncorrectCurrentPassword` responde 400 y no 401,
porque la web toma cualquier 401 como sesión perdida y navega al login.

**API contract**
- Method + path: `POST /api/auth/password`
- Request: `{ currentPassword: string, newPassword: string }` (JSON, `Content-Type: application/json`)
- Response: `204` sin body
- Error codes: `400` (`{ error }`: body inválido, contraseña nueva inválida, contraseña actual incorrecta, nueva igual a la actual), `401` sin sesión o sesión no válida, `415` sin JSON, `500` error interno
- Auth: exige sesión (`authMiddleware`, la ruta no está en `PUBLIC_ROUTES`); cualquier perfil; actúa siempre sobre el usuario de la sesión

**Data model**
- Reutiliza `users` y `sessions` de FEAT-001 a través de Block 1 — sin cambio de esquema; restricciones como están declaradas: `users.id` PK, `users.password_hash` NOT NULL, `sessions.user_id` NOT NULL con FK, `sessions.token_hash` UNIQUE.

**Input validation**
- `currentPassword`: string obligatorio, máximo 1024 caracteres (`requiredString`, acota el costo de `verify`, R-03).
- `newPassword`: string obligatorio, sin tope de forma en la ruta (el body ya está acotado a 10 kb); el largo de 8 a 1024 lo valida `PasswordPolicy` y responde `WeakPassword` con su mensaje ("La contraseña debe tener entre 8 y 1024 caracteres").

**Error handling**
- Body inválido (campo faltante, no string, `currentPassword` de más de 1024) — 400 `InvalidBody`; se registra como `invalid`.
- Contraseña nueva inválida (largo) o igual a la actual — 400 con el mensaje del error; se registra como `invalid`.
- Contraseña actual incorrecta — 400 "La contraseña actual es incorrecta"; se registra como `wrong_current`.
- Sin sesión o sesión no válida — 401 por `authMiddleware`, sin llegar a la ruta.
- Error inesperado — 500 "Error interno"; se registra como `error`.

**Required tests**
- [ ] `test_post_password_cambia_y_responde_204` — con sesión y datos válidos responde 204 y el login con la nueva funciona — validates AC-03
- [ ] `test_post_password_actual_incorrecta_400_rechazado` — 400 con "La contraseña actual es incorrecta" (sad path) — validates AC-05, AC-14
- [ ] `test_post_password_nueva_corta_400_rechazado` — 7 caracteres → 400 con el mensaje de `WeakPassword` (sad path) — validates AC-06
- [ ] `test_post_password_nueva_larga_400_rechazado` — 1025 caracteres → 400 con el mensaje de `WeakPassword` (sad path) — validates AC-07
- [ ] `test_post_password_igual_a_la_actual_400_rechazado` — 400 con el mensaje de `PasswordUnchanged` (sad path) — validates AC-08
- [ ] `test_post_password_body_invalido_400` — campo faltante → 400 y queda en el log como `invalid` (sad path) — validates AC-11
- [ ] `test_post_password_sin_sesion_401_no_autorizado` — sin cookie → 401 y la contraseña no cambia (sad path) — validates AC-15
- [ ] `test_post_password_log_actual_incorrecta_sin_contraseñas` — registra `password_change`/`wrong_current` con el email y sin ninguna de las contraseñas — validates AC-11
- [ ] `test_post_password_log_ok_sin_contraseña_nueva` — registra `password_change`/`ok`; ni el log ni la respuesta contienen la contraseña nueva (error interno → `error` se cubre con un caso de uso que lanza) — validates AC-12
- [ ] `test_post_password_error_interno_500` — si el caso de uso lanza un error inesperado, 500 "Error interno" y queda en el log como `error` (sad path) — validates AC-12

**Completion criterion**
Los 10 tests pasan, `routes/users.ts` usa `sessionContext` sin regresiones en `users.test.ts`, y
`npm run lint` y `npm run typecheck` pasan.

## Block 3 — Web: Mi perfil

**Files**
- `web/src/api/authApi.ts` (modified) — `changePassword({ currentPassword, newPassword }): Promise<void>` → `POST /api/auth/password`.
- `web/src/api/userRules.ts` (modified) — `USER_PASSWORD_MAX_LENGTH = 1024` y `ROLE_LABELS` (movido desde `UsersPage.tsx`).
- `web/src/pages/UsersPage.tsx` (modified) — importa `ROLE_LABELS` de `userRules.ts`.
- `web/src/pages/ProfilePage.tsx` (new) — la pantalla "Mi perfil".
- `web/src/router.tsx` (modified) — ruta `/perfil`; `homeLoader` se renombra `sessionLoader` y lo usan `/` y `/perfil`.
- `web/src/components/AppLayout.tsx` (modified) — botón "Mi perfil" para los tres perfiles.
- `web/src/pages/ProfilePage.test.tsx` (new), `web/src/api/authApi.test.ts` (modified), `web/src/router.test.tsx` (modified) — tests.

**Logic**
Implementa FR-01, FR-02, FR-08 y FR-10 (y FR-03/FR-05 del lado de la web). `ProfilePage`, dentro de
`AppLayout`, muestra nombre, email y perfil del usuario del store (`ROLE_LABELS`) como texto, sin
campos editables. Debajo, un `Form` de antd con `Input.Password` para la actual, la nueva y la
repetición: reglas de requerido, largo de 8 a 1024 en la nueva y un validador que exige que la
repetición coincida (dependencia de la nueva); mientras no coincidan no se envía. Al enviar llama
`changePassword` con el botón en carga; si responde, muestra un `Alert` de éxito y `resetFields`; ante
`ApiError` muestra un `Alert` de error con el mensaje del server; ante otro error, `errorText`.

**API contract**
- Method + path: `POST /api/auth/password` (consumido; lo define Block 2)
- Request: `{ currentPassword: string, newPassword: string }` vía `request` de `client.ts` con `Content-Type: application/json` y la cookie de sesión
- Response: `204` sin body → `changePassword` resuelve `void`
- Error codes: `400` → `ApiError` con el mensaje del server; `401` → el `client` lleva a `/login`; `5xx` o sin red → `NetworkError`
- Auth: cookie de sesión `aldebaran_sid` (`credentials: 'include'`); la pantalla exige sesión en `sessionLoader`

**Input validation**
- Contraseña actual: obligatoria.
- Contraseña nueva: obligatoria, de `USER_PASSWORD_MIN_LENGTH` (8) a `USER_PASSWORD_MAX_LENGTH` (1024) caracteres.
- Repetición: obligatoria e igual a la nueva.

**Error handling**
- Repetición que no coincide — el formulario no se envía y muestra "Las contraseñas no coinciden".
- Rechazo del server (400) — `Alert` de error con el mensaje recibido (actual incorrecta, largo, igual a la actual); el formulario conserva lo ingresado.
- Sin servidor o 5xx — `Alert` de error con "No se pudo conectar con el servidor".
- Sesión vencida (401) — el `client` lleva a `/login` como en el resto de la app.

**Required tests**
- [ ] `test_layout_muestra_mi_perfil_para_los_tres_perfiles` — Admin, Editor y Consulta ven el botón "Mi perfil" — validates AC-01
- [ ] `test_profile_page_muestra_datos_solo_lectura` — "Ana Pérez", ana@empresa.com y "Editor", sin campos de nombre, email ni perfil — validates AC-02
- [ ] `test_profile_page_cambio_exitoso_confirma_y_vacia` — envía `POST /api/auth/password`, muestra la confirmación y vacía el formulario — validates AC-13
- [ ] `test_profile_page_repeticion_no_coincide_rechazado` — no envía nada y muestra "Las contraseñas no coinciden" (sad path) — validates AC-10
- [ ] `test_profile_page_actual_incorrecta_muestra_error_rechazado` — ante 400 muestra "La contraseña actual es incorrecta" (sad path) — validates AC-14
- [ ] `test_profile_page_sin_servidor_error` — ante un fallo de red muestra "No se pudo conectar con el servidor" (sad path) — validates FR-10
- [ ] `test_router_perfil_sin_sesion_no_autorizado` — `/perfil` sin sesión redirige a `/login` (sad path) — validates FR-01
- [ ] `test_auth_api_change_password_envia_post` — `changePassword` hace `POST /api/auth/password` con los dos campos y resuelve con 204 — validates AC-03

**Completion criterion**
Los 8 tests pasan, `UsersPage.test.tsx` sigue en verde con `ROLE_LABELS` movido, y
`npm run lint` y `npm run typecheck` pasan.

## Final verification
`npm test`, `npm run lint` y `npm run typecheck` en verde; los 32 Required tests presentes con sus
identificadores `test_...`; un usuario de cada perfil entra a "Mi perfil", cambia su contraseña, la
otra sesión queda cerrada y la actual sigue abierta; el log muestra `password_change` sin contraseñas.
