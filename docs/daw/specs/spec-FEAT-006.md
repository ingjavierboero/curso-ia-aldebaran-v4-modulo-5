# Spec FEAT-006: Usuarios y perfiles

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| PRD | docs/daw/prd/prd-FEAT-006.md |
| Tier | FEATURE |
| Date | 2026-11-15 |
| Spec loops | 1 |
| Loops since last human decision | 1 |

## Summary
La autorización por perfil vive en el dominio (`domain/auth/Authorization.ts`, una tabla perfil →
acciones, deny-by-default) y la aplican los casos de uso de `application/user/`, que reciben al
`Actor` que actúa. El usuario de cada solicitud ya se relee de la base en cada request
(`resolveSession`), así que un cambio de perfil o una baja rigen desde la siguiente acción (FR-12) sin
cambios en la sesión; además, las escrituras vuelven a leer al actor dentro de la transacción. La
gestión corre dentro de la `UnitOfWork` (transacción `IMMEDIATE`, ADR-003): ahí se valida el email
único y la regla del último Admin (una política pura del dominio), y la baja borra las sesiones en la
misma transacción. La API `/api/users` la expone solo a Admin; la web suma la pantalla `/usuarios`
dentro de un layout compartido con la pantalla principal.

Cambios respecto de la versión 0 (revisión de arch-auditor e impact scan en PLAN): `PATCH` sin campos
→ 400 desde la ruta (F1); regla del último Admin como política de dominio (W1); tipo `Actor` (W2);
re-lectura del actor dentro de la transacción (W3); orden 400 antes de 403 (W4); `Authorization` en
`domain/auth` (W5); `USER_ROLES` en el dominio (W6); carpeta `application/user` (W7); UoW en memoria
con rollback de sesiones (W8); alcance real del test de concurrencia (W9); cliente HTTP compartido
`web/src/api/client.ts` con POST y PATCH JSON (W10); `AppLayout` compartido y refresco del store ante
403 (W11); y los archivos de test que faltaban según el impact scan.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 2, Block 3 |
| FR-02 | Block 1, Block 2, Block 3 |
| FR-03 | Block 1, Block 2 |
| FR-04 | Block 1, Block 2 |
| FR-05 | Block 1, Block 2, Block 3 |
| FR-06 | Block 1, Block 2, Block 3 |
| FR-07 | Block 1, Block 2, Block 3 |
| FR-08 | Block 1, Block 2, Block 3 |
| FR-09 | Block 1, Block 2 |
| FR-10 | Block 1, Block 2 |
| FR-11 | Block 1, Block 2 |
| FR-12 | Block 1, Block 2 |
| FR-13 | Block 3 |
| NFR-01 | Strategy: el alta usa el mismo `PasswordHasher` (argon2id) que FEAT-001, hashea fuera de la transacción y solo `passwordHash` llega a la base; `PublicUser` no tiene ese campo y los logs no reciben el body |
| NFR-02 | Strategy: la re-lectura del actor, el conteo de Admin Activos y la escritura corren en la misma `UnitOfWork` `IMMEDIATE`, sin ningún `await` adentro (ADR-003); dos bajas simultáneas quedan serializadas y la segunda ve el estado de la primera |
| NFR-03 | Strategy: el alta reutiliza `parseUserName` (1–100), `Email.create` (≤ 254) y `PasswordPolicy` (8–1024) de FEAT-001 |

## Dependencies between blocks
Block 2 depende de Block 1 (casos de uso, errores y puertos). Block 3 depende de Block 2 (contrato de
`/api/users`). Orden: 1 → 2 → 3.

## Block 1 — Dominio y casos de uso

**Files**
- `server/src/domain/auth/Authorization.ts` (new) — `type Action = 'users.read' | 'users.manage'` (crece por módulo); `PERMISSIONS: Record<UserRole, ReadonlySet<Action>>` (admin: ambas; editor y consulta: ninguna); `can(role, action)` y `assertCan(role, action)`, que lanza `Forbidden`.
- `server/src/domain/auth/errors.ts` (new) — `Forbidden`.
- `server/src/domain/user/errors.ts` (modified) — `EmailAlreadyInUse`, `LastActiveAdmin`, `UserNotFound`, `InvalidRole`.
- `server/src/domain/user/User.ts` (modified) — `USER_ROLES` y `USER_STATUSES` como constantes del dominio (y `UserRole`/`UserStatus` derivados); `parseUserRole(raw)` (si no, `InvalidRole`); métodos inmutables `withProfile({ name, email, role })`, `deactivated()`, `reactivated()`; `isActiveAdmin()`.
- `server/src/domain/user/AdminPolicy.ts` (new) — `assertKeepsAnActiveAdmin(before: User, after: User, activeAdmins: number)`: si `before` es Admin Activo, `after` deja de serlo y `activeAdmins <= 1`, lanza `LastActiveAdmin`.
- `server/src/domain/user/UserRepository.ts` (modified) — `listAll(): User[]` (por nombre), `countActiveAdmins(): number`, `update(user: User): void`. `insert` y `update` lanzan `EmailAlreadyInUse` ante el UNIQUE de email.
- `server/src/domain/auth/SessionRepository.ts` (modified) — `deleteByUserId(userId: string): number`.
- `server/src/application/shared/Actor.ts` (new) — `type Actor = { id: string; role: UserRole }`; `PublicUser` lo cumple estructuralmente.
- `server/src/application/shared/UnitOfWork.ts` (modified) — `TransactionalRepositories` suma `sessions: SessionRepository`.
- `server/src/application/user/ListUsers.ts` (new) — `execute(actor)`: `assertCan(actor.role, 'users.read')`, devuelve `PublicUser[]`.
- `server/src/application/user/CreateUser.ts` (new) — `execute(actor, { name, email, role, password })`.
- `server/src/application/user/UpdateUser.ts` (new) — `execute(actor, id, { name?, email?, role? })`.
- `server/src/application/user/DeactivateUser.ts` (new) — `execute(actor, id)`; borra las sesiones del usuario en la misma transacción.
- `server/src/application/user/ReactivateUser.ts` (new) — `execute(actor, id)`.
- `server/src/application/user/requireActor.ts` (new) — dentro de `uow.run`: relee al actor por id, exige que exista y esté Activo y repite `assertCan` con su rol actual; si no, `Forbidden`.
- `server/src/application/auth/RegisterFirstAdmin.ts` (modified) — dentro de su `uow.run`, `EmailAlreadyInUse` se traduce a `FirstAdminAlreadyExists` (antes lo hacía el repositorio).
- `server/test/support/InMemoryUserRepository.ts` (modified) — métodos nuevos; `insert` y `update` lanzan `EmailAlreadyInUse` ante un email repetido.
- `server/test/support/InMemorySessionRepository.ts` (modified) — `deleteByUserId`, `snapshot()` y `restore()`.
- `server/test/support/InMemoryUnitOfWork.ts` (modified) — recibe usuarios y sesiones y revierte las dos ante un error.
- `server/test/support/InMemoryUnitOfWork.test.ts` (modified) — constructor nuevo y rollback de sesiones.
- `server/test/support/authContext.ts` (modified) — pasa sesiones a la UoW y arma los 5 casos de uso para los tests.
- `server/test/domain/Authorization.test.ts`, `server/test/domain/AdminPolicy.test.ts` (new), `server/test/domain/User.test.ts` (modified), `server/test/application/user/*.test.ts` (new), `server/test/application/RegisterFirstAdmin.test.ts` (modified) — tests del bloque.

**Logic**
Implements FR-01..FR-12 en el núcleo. Cada caso de uso empieza con `assertCan(actor.role, …)`: lectura
`users.read`, escrituras `users.manage` (FR-11). Las escrituras, dentro de `uow.run`, llaman a
`requireActor` antes de tocar nada, así un Admin degradado o dado de baja en el medio (por ejemplo,
durante el hash del alta) no completa la acción (FR-12). `CreateUser` valida nombre, email, perfil y
contraseña antes de hashear (FR-02, FR-04, NFR-03), hashea fuera de la transacción y dentro de
`uow.run` verifica `findByEmail` e inserta con estado `activo` (FR-03). `UpdateUser` busca el usuario
(`UserNotFound`), verifica que el email nuevo no sea de otro usuario (FR-03, sin distinguir mayúsculas
por `Email`), y llama a `assertKeepsAnActiveAdmin` con `countActiveAdmins()` (FR-09). `DeactivateUser`
aplica la misma política, guarda `deactivated()` y llama `sessions.deleteByUserId` (FR-07). Dar de baja
a un Inactivo o reactivar a un Activo no cambia nada y devuelve el usuario (idempotente). Todo lo que
se devuelve pasa por `toPublicUser` (FR-10). La regla "al menos un campo" del `PATCH` es de forma del
body y la valida la ruta (Block 2).

**Data model**
- Reuses `users` and `sessions` from FEAT-001 — no schema change; constraints as declared there: `users.email` NOT NULL UNIQUE (normalizado a minúsculas), `users.role` NOT NULL con CHECK `admin|editor|consulta`, `users.status` NOT NULL default `activo` con CHECK `activo|inactivo`, `sessions.user_id` NOT NULL FK a `users.id` con índice `sessions_user_id_idx`. `schema.ts` pasa a importar `USER_ROLES` y `USER_STATUSES` del dominio; el CHECK no cambia.
- Rollback: no hay migración; revertir los commits del ticket deja el schema igual. Los usuarios creados quedan en la tabla y siguen siendo válidos para el código anterior (mismas columnas y CHECKs).

**Input validation**
- `name`: string, trim, 1 a 100 caracteres (`parseUserName`).
- `email`: string, formato `local@dominio.tld`, hasta 254 caracteres, normalizado a minúsculas (`Email.create`).
- `role`: uno de `USER_ROLES` (`parseUserRole`).
- `password` (solo alta): string de 8 a 1024 caracteres (`PasswordPolicy`).

**Error handling**
- Perfil sin permiso para la acción, o actor que dejó de ser Admin Activo — `Forbidden`; nada cambia y no se devuelve ningún dato de usuarios.
- Email ya usado por otro usuario — `EmailAlreadyInUse`; no se crea ni modifica nada.
- Contraseña inicial de menos de 8 caracteres — `WeakPassword`; no se crea el usuario.
- Nombre, email o perfil inválidos — `InvalidName`, `InvalidEmail`, `InvalidRole`; no se crea ni modifica nada.
- Usuario inexistente en modificar, dar de baja o reactivar — `UserNotFound`.
- Baja o cambio de perfil del último Admin Activo — `LastActiveAdmin`; el usuario sigue Activo y Admin.

**Required tests**
- [ ] test_authorization_admin_puede_leer_y_gestionar_usuarios — validates AC-01
- [ ] test_authorization_editor_y_consulta_sin_permiso_rechazado — Editor y Consulta no pueden `users.read` ni `users.manage` (sad path) — validates AC-13, AC-14
- [ ] test_admin_policy_ultimo_admin_rechazado — baja o cambio de perfil del único Admin Activo lanza `LastActiveAdmin`; con 2 Admin Activos no lanza (sad path) — validates AC-10, AC-11
- [ ] test_list_users_devuelve_activos_e_inactivos_sin_hash — validates AC-01, AC-12
- [ ] test_list_users_editor_no_autorizado — `Forbidden` para Editor y Consulta (sad path) — validates AC-13
- [ ] test_create_user_queda_activo_con_perfil — validates AC-02
- [ ] test_create_user_email_duplicado_rechazado — `Ana@Empresa.com` con `ana@empresa.com` existente (sad path) — validates AC-03
- [ ] test_create_user_contrasena_corta_rechazado — 7 caracteres, `WeakPassword`, sin hashear (sad path) — validates AC-05
- [ ] test_create_user_nombre_o_email_invalido_rechazado — nombre vacío, de 101 caracteres, email inválido, perfil desconocido (sad path) — validates AC-19
- [ ] test_create_user_consulta_no_autorizado — `Forbidden` y nada se crea (sad path) — validates AC-14
- [ ] test_create_user_actor_degradado_durante_el_hash_rechazado — el actor deja de ser Admin entre el chequeo y la transacción: `Forbidden` y nada se crea (sad path) — validates AC-07
- [ ] test_update_user_cambia_nombre_y_email — validates AC-06
- [ ] test_update_user_email_duplicado_rechazado — conserva su email (sad path) — validates AC-04
- [ ] test_update_user_cambia_perfil — validates AC-07
- [ ] test_update_user_inexistente_rechazado — `UserNotFound` (sad path)
- [ ] test_update_user_ultimo_admin_rechazado — cambiar a Editor al único Admin Activo (sad path) — validates AC-10
- [ ] test_deactivate_user_cierra_todas_sus_sesiones — validates AC-08
- [ ] test_deactivate_user_ultimo_admin_rechazado — sigue Activo y Admin (sad path) — validates AC-10
- [ ] test_deactivate_user_con_dos_admins_se_realiza — validates AC-11
- [ ] test_reactivate_user_vuelve_a_activo — validates AC-09
- [ ] test_in_memory_uow_error_revierte_usuarios_y_sesiones — un error dentro de `run` deja usuarios y sesiones como estaban (sad path)
- [ ] test_register_first_admin_email_duplicado_sigue_siendo_ya_existe — la traducción de `EmailAlreadyInUse` (sad path)

**Completion criterion**
Los 22 tests pasan, los tests de FEAT-001 siguen en verde, y `npm run lint` y `npm run typecheck`
terminan sin errores.

## Block 2 — API `/api/users` e infraestructura

**Files**
- `server/src/infrastructure/db/schema.ts` (modified) — importa `USER_ROLES` y `USER_STATUSES` del dominio.
- `server/src/infrastructure/db/DrizzleUserRepository.ts` (modified) — `listAll` (orden por nombre), `countActiveAdmins`, `update`; el UNIQUE de email lanza `EmailAlreadyInUse` en `insert` y `update`; deja de importar `FirstAdminAlreadyExists`.
- `server/src/infrastructure/db/DrizzleSessionRepository.ts` (modified) — `deleteByUserId`.
- `server/src/infrastructure/db/DrizzleUnitOfWork.ts` (modified) — pasa `sessions` dentro de la transacción.
- `server/src/infrastructure/http/routes/users.ts` (new) — las 5 rutas; parsea el body con `bodyObject`/`requiredString` y un `optionalString` nuevo; un `PATCH` sin `name`, `email` ni `role` lanza `InvalidBody`.
- `server/src/infrastructure/http/body.ts` (modified) — `optionalString`.
- `server/src/infrastructure/http/errorHandler.ts` (modified) — `Forbidden` → 403, `UserNotFound` → 404, `EmailAlreadyInUse` y `LastActiveAdmin` → 409, `InvalidRole` → 400.
- `server/src/infrastructure/http/app.ts`, `server/src/main.ts`, `server/test/support/testApp.ts` (modified) — wiring de los 5 casos de uso.
- `server/test/http/users.test.ts` (new), `server/test/infrastructure/DrizzleUserRepository.test.ts` (modified: sus tests de duplicado pasan de `FirstAdminAlreadyExists` a `EmailAlreadyInUse`), `server/test/infrastructure/DrizzleSessionRepository.test.ts` (modified), `server/test/infrastructure/DrizzleUnitOfWork.test.ts` (modified) — tests del bloque.

**Logic**
Implements FR-01..FR-12 por HTTP. Las rutas no tienen lógica de negocio: validan la forma del body
(400), pasan `req.user` como `Actor` al caso de uso, que autoriza (403), y responden. Orden fijado: la
forma del body se valida antes que el permiso, así que un Editor con body mal formado recibe 400; con
body válido recibe 403. Las rutas exigen sesión (no están en `PUBLIC_ROUTES`); `authMiddleware` relee
el usuario en cada solicitud, así que un perfil cambiado o una baja rigen desde la siguiente (FR-12,
AC-07, AC-15). El test de bajas simultáneas prueba que no hay un `await` entre el conteo de Admin y la
escritura (las dos solicitudes no intercalan sus transacciones); la serialización entre procesos la
da `IMMEDIATE` (ADR-003), que este test no distingue de `DEFERRED`.

**API contract**
- Method + path: `GET /api/users`; `POST /api/users`; `PATCH /api/users/:id`; `POST /api/users/:id/deactivate`; `POST /api/users/:id/reactivate`.
- Request: `POST /api/users` `{ name: string, email: string, role: "admin"|"editor"|"consulta", password: string }`; `PATCH /api/users/:id` `{ name?: string, email?: string, role?: string }` (al menos uno); deactivate y reactivate `{}`. Escrituras con `Content-Type: application/json` (R-07 de FEAT-001).
- Response: `GET` 200 `{ users: PublicUser[] }`; `POST` 201 `{ user: PublicUser }`; `PATCH`, deactivate y reactivate 200 `{ user: PublicUser }`. `PublicUser` = `{ id, name, email, role, status }`, nunca `passwordHash`.
- Error codes: 400 (body inválido o `PATCH` sin campos; nombre, email, perfil o contraseña inválidos), 401 (sin sesión o sesión de un usuario dado de baja), 403 (perfil sin permiso), 404 (usuario inexistente), 409 (email ya usado; último Admin Activo), 415 (Content-Type no JSON).
- Auth: sesión obligatoria (cookie `aldebaran_sid`); solo perfil Admin; Editor y Consulta reciben 403 sin datos.

**Data model**
- Reuses `users` and `sessions` from Block 1 — no schema change; constraints as declared there: `users.email` NOT NULL UNIQUE, `users.role` NOT NULL CHECK, `users.status` NOT NULL default `activo` CHECK, `sessions.user_id` NOT NULL FK con índice `sessions_user_id_idx`.

**Input validation**
- Body: objeto JSON de hasta 10 kB (límite existente); `name` hasta 100, `email` hasta 254, `password` hasta 1024, `role` hasta 20 caracteres antes de llegar al dominio.
- `PATCH`: al menos uno de `name`, `email`, `role`.
- `:id`: string; si no existe el usuario, 404.

**Error handling**
- Body que no es objeto, campo con tipo incorrecto o `PATCH` sin campos — 400 nombrando el problema; nada cambia.
- Editor o Consulta con body válido en cualquier ruta de usuarios — 403 `{ error }`, sin datos de usuarios.
- Email ya usado (incluida la carrera que resuelve el UNIQUE) — 409; nada cambia.
- Último Admin Activo — 409; el usuario sigue Activo y Admin.
- Usuario inexistente — 404.
- Sesión de un usuario dado de baja — 401 en la siguiente solicitud.

**Required tests**
- [ ] test_users_admin_lista_activos_e_inactivos_sin_hash — validates AC-01, AC-12
- [ ] test_users_editor_y_consulta_no_autorizado_403_sin_datos — en las 5 rutas, con bodies válidos (sad path) — validates AC-13, AC-14
- [ ] test_users_alta_201_y_el_nuevo_usuario_inicia_sesion — validates AC-02
- [ ] test_users_alta_email_duplicado_409 — `Ana@Empresa.com` (sad path) — validates AC-03
- [ ] test_users_alta_contrasena_corta_400 — 7 caracteres (sad path) — validates AC-05
- [ ] test_users_alta_body_invalido_400 — nombre vacío, de 101 caracteres, email inválido, perfil desconocido, campo faltante (sad path) — validates AC-19
- [ ] test_users_modificar_sin_campos_invalido_400 — `PATCH` con `{}` (sad path)
- [ ] test_users_modificar_nombre_email_y_login_con_email_nuevo — validates AC-06
- [ ] test_users_modificar_email_duplicado_409 — (sad path) — validates AC-04
- [ ] test_users_cambio_de_perfil_rige_en_la_siguiente_solicitud — un Admin pasa a Editor y su siguiente `GET /api/users` recibe 403 sin volver a iniciar sesión — validates AC-07
- [ ] test_users_baja_cierra_las_dos_sesiones_y_rechaza_login — validates AC-08, AC-15
- [ ] test_users_reactivar_permite_login — validates AC-09
- [ ] test_users_ultimo_admin_baja_o_cambio_de_perfil_409 — (sad path) — validates AC-10
- [ ] test_users_con_dos_admins_la_baja_se_realiza — validates AC-11
- [ ] test_users_bajas_simultaneas_entre_dos_admins_conflicto_rechazado — 2 solicitudes en paralelo; como mucho una baja se realiza y queda al menos 1 Admin Activo (sad path) — validates AC-18
- [ ] test_users_inexistente_404 — (sad path)
- [ ] test_user_repository_email_duplicado_lanza_email_already_in_use — `insert` y `update` contra SQLite real (sad path)
- [ ] test_session_repository_delete_by_user_id_borra_solo_las_suyas — y devuelve la cantidad
- [ ] test_drizzle_uow_error_revierte_baja_y_sesiones — un error después de `deleteByUserId` deja las sesiones (sad path)

**Completion criterion**
Los 19 tests pasan con la base SQLite de test, la suite completa sigue en verde, y `npm run lint` y
`npm run typecheck` terminan sin errores.

## Block 3 — Pantalla de usuarios (web)

**Files**
- `web/src/api/client.ts` (new) — `request`, `ApiError`, `NetworkError`, `setUnauthorizedHandler` y `errorText` extraídos de `authApi.ts` y exportados; `request` admite `GET`, `POST` y `PATCH`, y POST y PATCH llevan `Content-Type: application/json` y body JSON.
- `web/src/api/authApi.ts` (modified) — usa `client.ts`; reexporta lo que hoy exporta para no romper a sus llamadores.
- `web/src/api/client.test.ts` (new), `web/src/api/authApi.test.ts` (modified) — tests del cliente.
- `web/src/api/usersApi.ts` (new) — `listUsers`, `createUser`, `updateUser`, `deactivateUser`, `reactivateUser`; valida la forma de cada respuesta (`isPublicUser`) y una forma inválida es `NetworkError`.
- `web/src/api/types.ts` (modified) — `UserRole`, `CreateUserInput`, `UpdateUserInput`.
- `web/src/components/AppLayout.tsx` (new) — header compartido (marca, nombre, botón "Usuarios" solo si `user.role === 'admin'`, "Cerrar sesión") con el `HealthBanner`; lo usan `HomePage` y `UsersPage`.
- `web/src/pages/HomePage.tsx` (modified) — usa `AppLayout`; mantiene la revalidación al volver a la pestaña.
- `web/src/pages/UsersPage.tsx` (new) — tabla antd con nombre, email, perfil y estado; modal con formulario de alta y de modificación (nombre, email, perfil; contraseña solo en el alta); acciones "Dar de baja" (con confirmación) y "Reactivar"; los errores del server se muestran con su mensaje.
- `web/src/router.tsx` (modified) — ruta `/usuarios` con loader que exige sesión y perfil Admin; sin sesión → `/login`; con otro perfil → `/`.
- `web/src/api/usersApi.test.ts`, `web/src/pages/UsersPage.test.tsx`, `web/src/pages/HomePage.test.tsx`, `web/src/router.test.tsx` (new/modified) — tests del bloque.

**Logic**
Implements FR-13 y la parte visible de FR-01, FR-02 y FR-05..FR-08. La guarda de la ruta y el botón son
UX: la autorización real es la de Block 2. Después de cada acción se recarga el listado. Ante un 403
(el perfil cambió con la pantalla abierta) se refresca el usuario con `getSession()` y `setUser` antes
de volver a `/`, para que el botón "Usuarios" desaparezca. Si un Admin se da de baja a sí mismo, la
siguiente solicitud recibe 401 y el handler del cliente lleva al login.

**Data model**
- Reuses `users` from Block 1 — no schema change; la web solo consume `PublicUser` (`id`, `name`, `email`, `role` ∈ `admin|editor|consulta`, `status` ∈ `activo|inactivo`); constraints as declared there: `users.email` NOT NULL UNIQUE, `users.role` NOT NULL CHECK, `users.status` NOT NULL default `activo` CHECK.

**Input validation**
- Formulario: nombre obligatorio (máx. 100), email obligatorio con formato válido (máx. 254), perfil de una lista fija, contraseña obligatoria en el alta con mínimo 8 caracteres. El server valida igual (Block 2).

**Error handling**
- Respuesta 400 o 409 del server — se muestra el mensaje `{ error }` en el formulario o en un aviso, y el listado no cambia.
- Respuesta 403 — aviso de acceso denegado, refresco del usuario y vuelta a `/`.
- Respuesta 401 (por ejemplo, el Admin se dio de baja a sí mismo) — el cliente lleva al login.
- Error de red o respuesta con forma inválida — aviso "No se pudo conectar con el servidor"; el listado anterior se conserva.

**Required tests**
- [ ] test_client_patch_envia_json_con_content_type — PATCH y POST mandan `Content-Type: application/json` y body
- [ ] test_users_page_lista_usuarios_con_perfil_y_estado — validates AC-01, AC-16
- [ ] test_users_page_alta_recarga_el_listado — validates AC-02, AC-16
- [ ] test_users_page_email_duplicado_muestra_error_rechazado — 409 con su mensaje (sad path) — validates AC-03
- [ ] test_users_page_baja_y_reactivacion — validates AC-08, AC-09, AC-16
- [ ] test_users_page_ultimo_admin_muestra_conflicto_rechazado — 409 (sad path) — validates AC-10
- [ ] test_users_page_error_de_red_conserva_listado — (sad path)
- [ ] test_users_page_403_no_autorizado_refresca_y_vuelve_al_inicio — sin el botón "Usuarios" después (sad path)
- [ ] test_users_page_401_tras_darse_de_baja_lleva_al_login — (sad path)
- [ ] test_home_muestra_acceso_a_usuarios_solo_a_admin — Admin lo ve; Editor y Consulta no — validates AC-16, AC-17
- [ ] test_router_usuarios_con_perfil_editor_rechazado_redirige — (sad path) — validates AC-17
- [ ] test_users_api_respuesta_invalida_es_network_error — forma inválida (sad path)

**Completion criterion**
Los 12 tests pasan, la suite de `web` sigue en verde (incluidos los tests existentes de `authApi`,
`HomePage` y `router`), y `npm run lint` y `npm run typecheck` terminan sin errores.

## Final verification
`validate_spec.py --tier FEATURE` pasa sobre este documento; un Admin gestiona usuarios desde
`/usuarios`; Editor y Consulta no ven el acceso y la API les responde 403; nunca queda el sistema sin
un Admin Activo.
