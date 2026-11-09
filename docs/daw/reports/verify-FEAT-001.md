# Verification FEAT-001

Ronda 2 de VERIFY, sobre `3408463` (rama `feat/FEAT-001-login`), con fecha 2026-11-09. Viene después del bucle correctivo VERIFY → CODE → PLAN → CODE que abrió F-VER-06 en la ronda 1; esa ronda está registrada al final de este documento. Referencias: `docs/daw/prd/prd-FEAT-001.md` y `docs/daw/specs/spec-FEAT-001.md` (con los Required tests ya como identificadores, `9caff23`).

Desde la ronda 1 solo cambiaron los títulos de los 50 Required tests. El diff de `3408463` cambia únicamente la línea del título de cada uno y le agrega encima un comentario con la frase anterior. Lo de fondo de la ronda 1 sigue vigente: la verificación cruzada de `daw-module-verifier`, que no escribió el código, dio 0 FAIL. En esta ronda se volvió a comprobar que los 50 identificadores de la spec existan en el código, una vez cada uno, y que la suite siga en verde.

| Field | Value |
|---|---|
| Module | `server/src` (domain, application, infrastructure) y `web/src` |
| Line coverage | 90.44% |
| Branch coverage | 86.49% |
| Function coverage | 94.48% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run typecheck` (`tsc -b`) — clean, 0 errors; no hay linter configurado (sin ESLint, Biome, oxlint, Prettier ni script `lint`) |
| Tests | 130/130 en verde (28 archivos); corrida completa con cobertura, la de `docs/daw/reports/tests-FEAT-001.md` |

## Acceptance criteria
- ✅ AC-01 — `Login.ts:Login.execute`, `routes/auth.ts`, `LoginPage.tsx:onFinish` → `test_login_credenciales_correctas_usuario_activo_devuelve_token_y_public_user`, `test_post_login_credenciales_validas_200_public_user_y_cookie_segura`, `test_login_page_credenciales_validas_navega_a_la_pantalla_principal`
- ✅ AC-02 — `Email.ts:Email.create`, `DrizzleUserRepository.findByEmail` → `test_login_con_email_en_mayusculas_encuentra_al_usuario`, `test_post_login_email_en_mayusculas_inicia_sesion`, `test_drizzle_user_repository_inserta_y_encuentra_por_email_normalizado`
- ✅ AC-03 — `Login.ts` (hash dummy, `InvalidCredentials`), `errorHandler.ts` → `test_login_contrasena_incorrecta_rechazado_invalid_credentials`, `test_login_email_inexistente_rechazado_y_verifica_contra_hash_dummy`, `test_login_usuario_inactivo_rechazado_invalid_credentials`, `test_post_login_credenciales_invalidas_401_con_el_mismo_mensaje`, `test_login_page_401_muestra_mensaje_y_limpia_la_contrasena`
- ✅ AC-04 — `Logout.ts`, `routes/auth.ts`, `HomePage.tsx:onLogout` → `test_logout_borra_la_sesion_y_authenticate_session_posterior_es_rechazado`, `test_post_logout_y_get_session_con_la_misma_cookie_rechazado_401`, `test_home_page_cerrar_sesion_navega_a_login`, `test_drizzle_session_repository_touch_actualiza_y_delete_elimina`
- ✅ AC-05 — `RegisterFirstAdmin.ts`, `GetSetupStatus.ts`, `routes/setup.ts`, `router.tsx`, `FirstAdminPage.tsx` → `test_register_first_admin_sistema_vacio_crea_admin_activo_que_hace_login`, `test_setup_status_sin_usuarios_y_first_admin_con_8_caracteres_crea_admin_que_hace_login`, `test_login_con_needs_first_admin_redirige_a_setup_y_crea_admin`
- ✅ AC-06 — `PasswordPolicy.assert`, regla `min` de `FirstAdminPage.tsx` → `test_register_first_admin_contrasena_de_7_rechazado_weak_password_sin_crear_usuario`, `test_post_first_admin_contrasena_de_7_rechazado_400_sin_crear_usuario`, `test_first_admin_page_contrasena_de_7_rechazado_en_el_formulario`
- ✅ AC-07 — `RegisterFirstAdmin.ts` (pre-check y re-check en `uow.run`), `DrizzleUnitOfWork` (IMMEDIATE), `setupLoader` → `test_register_first_admin_con_usuario_existente_rechazado_conflict_sin_hash`, `test_post_first_admin_con_usuario_existente_rechazado_409`, `test_dos_post_first_admin_simultaneos_un_201_un_409_y_un_solo_usuario`, `test_setup_con_usuarios_existentes_redirige_a_login_y_409_navega_a_login`, `test_drizzle_unit_of_work_revierte_la_transaccion_si_fn_lanza`
- ✅ AC-08 — `authMiddleware.ts` (deny-by-default), `router.tsx:homeLoader` → `test_get_session_sin_cookie_rechazado_401_sin_datos`, `test_home_sin_sesion_redirige_a_login`
- ✅ AC-09 — `Session.isExpired`, `AuthenticateSession.ts`, `HomePage.tsx` (revalidación por foco) → `test_authenticate_session_24h_sin_actividad_rechazado_y_borra_la_sesion`, `test_get_session_24h_despues_de_la_ultima_actividad_rechazado_401`, `test_get_session_401_desde_home_sesion_vencida_lleva_a_login`
- ✅ AC-10 — `AuthenticateSession` → `touch(now)` → `test_authenticate_session_23h_devuelve_usuario_y_actualiza_last_activity_at`, `test_get_session_23h_despues_responde_200`
- ✅ AC-11 — `dto/PublicUser.ts:toPublicUser` → `test_public_user_no_tiene_password_hash`, `test_ninguna_respuesta_contiene_password_hash`
- ✅ AC-12 — `Argon2PasswordHasher.ts` (argon2id 19456/2/1) → `test_argon2_parametros_de_produccion_guarda_hash_argon2id_sin_contrasena` (el cableado en `main.ts` no tiene test; ver Warnings)

Ninguno se limita al status code: todos comprueban el body, la cookie, las filas persistidas o la navegación.

## Spec blocks
- ✅ Block 1 — tareas y archivos completos; `test_migrate_crea_tablas_users_y_sessions_con_indices_unicos`, `test_createdb_crea_directorio_0700_y_archivo_0600`, `test_createdb_con_ruta_no_creable_lanza_error_con_la_ruta`, `test_get_api_inexistente_responde_404_json_con_headers_de_seguridad`
- ✅ Block 2 — tareas y archivos completos; sus 15 Required tests están en verde (los de AC-01 a AC-11 de arriba, más `test_register_first_admin_email_invalido_rechazado_invalid_email`, `test_register_first_admin_nombre_faltante_rechazado_invalid_name` y `test_authenticate_session_token_inexistente_rechazado`)
- ✅ Block 3 — tareas y archivos completos; sus 6 Required tests están en verde, incluidos `test_drizzle_user_repository_email_duplicado_rechazado_first_admin_already_exists` y `test_argon2_verify_con_hash_invalido_devuelve_false`
- ✅ Block 4 — tareas y archivos completos; sus 16 Required tests están en verde, incluidos `test_post_login_campo_faltante_rechazado_400`, `test_post_login_sin_content_type_json_rechazado_415`, `test_error_inesperado_en_caso_de_uso_responde_500_sin_stack` y `test_auth_log_registra_el_intento_de_login_sin_la_contrasena`
- ✅ Block 5 — tareas y archivos completos; sus 9 Required tests están en verde, incluido `test_login_page_error_de_red_muestra_no_se_pudo_conectar`

Final verification de la spec:
- `npm test` y `npm run typecheck` en verde, y los 12 AC nombrados por al menos un test.
- `validate_spec.py` y `validate_threat.py` dan PASSED.
- Ningún import de `infrastructure/` desde `server/src/domain/` ni desde `server/src/application/`.
- Ninguna respuesta HTTP incluye `password_hash`/`passwordHash`.

La evidencia de TDD por bloque está en `.daw-work/review-block-1.md` … `review-block-5.md`.

## Tests
- ✅ Sad-path tests: cada endpoint y cada formulario tiene al menos un test con entrada inválida.
  - `POST /api/auth/login`: 400, 401, 413 y 415.
  - `POST /api/auth/logout`: 415.
  - `GET /api/auth/session`: 401 sin cookie, con cookie inventada, vencida y tras el logout.
  - `POST /api/setup/first-admin`: 400, 409, carrera y 415.
  - Web: 401, red, 5xx, 415, contraseña de 7 caracteres, 400 y 409.
  - Dominio: `Email`, `PasswordPolicy`, `parseUserName` y `parsePort` con entrada inválida.
- ✅ F-VER-06: los 50 identificadores que promete la spec existen en el código como título de test exactamente una vez cada uno; se cruzó la spec con `server/test` y `web/src` sin que faltara ni sobrara ninguno. Pasan los 130 tests de la corrida.

## Warnings
Son los mismos de la ronda 1. Ninguno bloquea.
- ⚠️ W-VER-02:
  - `server/src/domain/user/Email.ts`: 80 % de líneas y 50 % de funciones, porque `equals`/`toString` no se usan.
  - `server/src/domain/user/User.ts`: 83.33 % de ramas; falta probar `parseUserName` con un valor que no es string.
- ⚠️ W-VER-01:
  - `Email.equals`/`Email.toString` y métodos de los dobles de test sin uso (deuda aceptada en el Block 2).
  - Un test duplicado de JSON mal formado en `server/test/http/auth.test.ts`.
- ⚠️ W-VER-03: `web/src/pages/HomePage.test.tsx` espera la respuesta tardía con un `setTimeout` fijo de 50 ms, así que la cobertura de ramas de `HomePage.tsx` varía entre corridas.
- ⚠️ Criterios de completitud que quedan para la prueba manual: que `npm run dev -w server` arranque (con `NODE_ENV=development`), migre y responda 401 sin cookie, y el recorrido en el navegador: registrar el primer Admin, iniciar sesión y cerrarla.
- ⚠️ Sad paths secundarios sin ejercitar:
  - un body que no es objeto (`body.ts:9`);
  - un logout de la web que vuelve con 5xx o sin red;
  - la revalidación exitosa;
  - las validaciones de cliente del email en el login.
- ⚠️ `server/src/main.ts` y `web/src/main.tsx` tienen 0 % de cobertura (composition root).

Result: PASSED

---

## Historial — ronda 1 (bloqueada)

La ronda 1 se hizo sobre `a08b5f5`. La verificación cruzada de `daw-module-verifier` no encontró defectos de fondo: dejó los 12 criterios de aceptación cubiertos, los 5 bloques completos, cobertura de 90.44 % de líneas, 86.49 % de ramas y 94.48 % de funciones, sad paths y typecheck limpio, y los mismos 6 avisos de arriba. `validate_verify.py` rechazó la regla F-VER-06 porque no pudo leer ningún nombre de test en la spec: solo reconoce identificadores `test[\w-]+`, y la spec los nombraba con frases (que `validate_spec.py` sí había aceptado en F-SPEC-06). El usuario eligió el bucle correctivo VERIFY → CODE → PLAN: la spec se corrigió en `9caff23` y los tests se renombraron en `3408463`. Más detalle en `docs/daw/specs/decisions-FEAT-001.md`, sección "Bucle correctivo VERIFY → CODE → PLAN → CODE (F-VER-06)".
