# Verification FEAT-007

Ronda 1, 2026-11-15, sobre `5e814df` (3 bloques y reportes de CODE). Verificación cruzada por `daw-module-verifier` (agente que no escribió el código): 366/366 tests, lint y typecheck en 0.

| Field | Value |
|---|---|
| Module | server/src/application/auth/ChangeOwnPassword.ts, server/src/infrastructure/http/routes/auth.ts, web/src/pages/ProfilePage.tsx |
| Line coverage | 90.27% |
| Branch coverage | 86.97% |
| Function coverage | 93.95% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean; `npm run typecheck` (`tsc -b`) — clean |

Cobertura medida solo sobre los archivos de producto modificados por el ticket (`git diff main...HEAD`, sin tests), con `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text --coverage.include=<cada archivo>`. Incluye `main.ts` (composition root, 0% como en los tickets anteriores). Suite completa: 94.11% líneas, 91.15% ramas, 96.3% funciones. `ChangeOwnPassword.ts` y `PasswordPolicy.ts` al 100%.

## Acceptance criteria
- ✅ AC-01 — `test_layout_muestra_mi_perfil_para_los_tres_perfiles` (web/src/components/AppLayout.tsx, botón "Mi perfil"; Admin, Editor y Consulta navegan a `/perfil`)
- ✅ AC-02 — `test_profile_page_muestra_datos_solo_lectura` (web/src/pages/ProfilePage.tsx, `Descriptions` sin campos editables)
- ✅ AC-03 — `test_change_own_password_guarda_la_nueva`, `test_post_password_cambia_y_responde_204`, `test_user_with_password_hash_no_muta_el_original`, `test_drizzle_update_password_hash_solo_cambia_el_hash`, `test_auth_api_change_password_envia_post`
- ✅ AC-04 — `test_change_own_password_perfil_consulta`
- ✅ AC-05 — `test_change_own_password_actual_incorrecta_rechazado`, `test_change_own_password_cambio_concurrente_rechazado`, `test_post_password_actual_incorrecta_400_rechazado`
- ✅ AC-06 — `test_change_own_password_nueva_corta_rechazado`, `test_post_password_nueva_corta_400_rechazado`
- ✅ AC-07 — `test_change_own_password_nueva_larga_rechazado`, `test_post_password_nueva_larga_400_rechazado`
- ✅ AC-08 — `test_password_policy_assert_changed_igual_rechazado`, `test_change_own_password_igual_a_la_actual_rechazado`, `test_post_password_igual_a_la_actual_400_rechazado`
- ✅ AC-09 — `test_change_own_password_cierra_las_demas_sesiones`, `test_drizzle_delete_by_user_id_except_conserva_la_actual`
- ✅ AC-10 — `test_profile_page_repeticion_no_coincide_rechazado`
- ✅ AC-11 — `test_post_password_log_actual_incorrecta_sin_contraseñas`, `test_post_password_body_invalido_400`
- ✅ AC-12 — `test_post_password_log_ok_sin_contraseña_nueva`, `test_post_password_error_interno_500`
- ✅ AC-13 — `test_profile_page_cambio_exitoso_confirma_y_vacia`
- ✅ AC-14 — `test_profile_page_actual_incorrecta_muestra_error_rechazado`, `test_post_password_actual_incorrecta_400_rechazado`
- ✅ AC-15 — `test_post_password_sin_sesion_401_no_autorizado`, `test_change_own_password_usuario_inactivo_no_autorizado`

NFR-01 (argon2id, 204 sin body, log sin contraseñas), NFR-02 (sin id objetivo; `test_change_own_password_sesion_de_otro_usuario_rechazado`) y NFR-03 (`PasswordPolicy.assert` reutilizado) cumplidos.

## Spec blocks
- ✅ Block 1 — 13/13 archivos; orden de 6 pasos de `ChangeOwnPassword` respetado; sin imports de `infrastructure/`; 14 Required tests presentes y en verde (commit `59deeed`)
- ✅ Block 2 — 9/9 archivos; `actorOf` reemplazado por `sessionContext`; mapeo de resultados del log según la spec; 10 Required tests presentes y en verde (commit `0e3e1b5`)
- ✅ Block 3 — 7/7 archivos; `ROLE_LABELS` en `userRules.ts`; `sessionLoader` en `/` y `/perfil`; 8 Required tests presentes y en verde (commit `d505e46`)

## Tests
- ✅ Required tests: los 32 identificadores de la spec existen una vez cada uno con el nombre exacto y pasan: `test_password_policy_assert_changed_igual_rechazado`, `test_user_with_password_hash_no_muta_el_original`, `test_change_own_password_guarda_la_nueva`, `test_change_own_password_perfil_consulta`, `test_change_own_password_actual_incorrecta_rechazado`, `test_change_own_password_nueva_corta_rechazado`, `test_change_own_password_nueva_larga_rechazado`, `test_change_own_password_igual_a_la_actual_rechazado`, `test_change_own_password_cierra_las_demas_sesiones`, `test_change_own_password_usuario_inactivo_no_autorizado`, `test_change_own_password_sesion_de_otro_usuario_rechazado`, `test_change_own_password_cambio_concurrente_rechazado`, `test_drizzle_update_password_hash_solo_cambia_el_hash`, `test_drizzle_delete_by_user_id_except_conserva_la_actual`, `test_post_password_cambia_y_responde_204`, `test_post_password_actual_incorrecta_400_rechazado`, `test_post_password_nueva_corta_400_rechazado`, `test_post_password_nueva_larga_400_rechazado`, `test_post_password_igual_a_la_actual_400_rechazado`, `test_post_password_body_invalido_400`, `test_post_password_sin_sesion_401_no_autorizado`, `test_post_password_log_actual_incorrecta_sin_contraseñas`, `test_post_password_log_ok_sin_contraseña_nueva`, `test_post_password_error_interno_500`, `test_layout_muestra_mi_perfil_para_los_tres_perfiles`, `test_profile_page_muestra_datos_solo_lectura`, `test_profile_page_cambio_exitoso_confirma_y_vacia`, `test_profile_page_repeticion_no_coincide_rechazado`, `test_profile_page_actual_incorrecta_muestra_error_rechazado`, `test_profile_page_sin_servidor_error`, `test_router_perfil_sin_sesion_no_autorizado`, `test_auth_api_change_password_envia_post`
- ✅ Sad-path tests: caso de uso (actual incorrecta, 7 y 1025 caracteres, igual a la actual, usuario inactivo, sesión ajena, cambio concurrente), endpoint (400 en cada rechazo, body inválido, 401 sin sesión, 500) y formulario (repetición distinta, 400 del server, sin servidor)
- ✅ Dead code (W-VER-01): sin imports sin uso ni código muerto; `actorOf` eliminado sin referencias
- ✅ Business-logic coverage (W-VER-02): `ChangeOwnPassword` y `PasswordPolicy` al 100%
- ✅ Fragile tests (W-VER-03): los timestamps vienen de un reloj falso inyectado; los tests que recrean la app usan `beforeEach`/`afterEach`

## Warnings (no bloquean)
- W-1 — Block 1: 11 de los 15 rojos previos fueron por el símbolo faltante (`ctx.changeOwnPassword`) y no por aserción; aceptado por el verificador del bloque (decisions-FEAT-007.md). Blocks 2 y 3 usaron esqueleto.
- W-2 — AC-09: no hay un test HTTP de punta a punta donde la otra cookie reciba 401; se verifica a nivel de caso de uso con `authenticateSession`, la misma pieza que usa el middleware.
- W-3 — AC-12 "ni la base": ningún test consulta la tabla `users` buscando la nueva en texto plano; evidencia indirecta: login real con argon2 y valor guardado distinto del texto plano.
- W-4 — Web: las reglas de largo 8–1024 y de campos obligatorios del formulario no tienen test propio (la spec no lo exigía).
- W-5 — Web: solo se prueba el 400 por contraseña actual incorrecta; los 400 por largo e igual a la actual pasan por el mismo `errorText` sin test propio.
- W-6 — `ProfilePage.tsx:61`: rama con `user` nulo sin cubrir (trivial).
- W-7 — `authLog.ts`: 40% de ramas, previo a FEAT-007; el ticket no agrega ramas ahí.

Result: PASSED
