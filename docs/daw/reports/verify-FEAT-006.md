# Verification FEAT-006

Verificación cruzada PRD ↔ spec ↔ código ↔ tests hecha por `daw-module-verifier` (agente que no escribió el código), ronda 1 sobre `0a50644`; ronda 2 (vuelta corta por W-2) sobre `2494548`, sin cambios de código de producto. `npx vitest run` 333/333 en 56 archivos.

| Field | Value |
|---|---|
| Module | server/src/domain/{auth,user}, server/src/application/{user,shared}, server/src/infrastructure/{db,http}, web/src/{api,components,pages,router.tsx} |
| Line coverage | 93.74% |
| Branch coverage | 90.73% |
| Function coverage | 96.07% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean |

## Acceptance criteria
- ✅ AC-01 — `test_list_users_devuelve_activos_e_inactivos_sin_hash`, `test_users_admin_lista_activos_e_inactivos_sin_hash`, `test_users_page_lista_usuarios_con_perfil_y_estado` (ListUsers.execute; routes/users.ts GET)
- ✅ AC-02 — `test_create_user_queda_activo_con_perfil`, `test_users_alta_201_y_el_nuevo_usuario_inicia_sesion`, `test_users_page_alta_recarga_el_listado` (CreateUser.execute)
- ✅ AC-03 — `test_create_user_email_duplicado_rechazado`, `test_users_alta_email_duplicado_409`, `test_users_page_email_duplicado_muestra_error_rechazado` (CreateUser; DrizzleUserRepository.insert)
- ✅ AC-04 — `test_update_user_email_duplicado_rechazado`, `test_users_modificar_email_duplicado_409`, `test_user_repository_email_duplicado_lanza_email_already_in_use` (UpdateUser; DrizzleUserRepository.update)
- ✅ AC-05 — `test_create_user_contrasena_corta_rechazado`, `test_users_alta_contrasena_corta_400` (PasswordPolicy en CreateUser)
- ✅ AC-06 — `test_update_user_cambia_nombre_y_email`, `test_users_modificar_nombre_email_y_login_con_email_nuevo` (UpdateUser)
- ✅ AC-07 — `test_update_user_cambia_perfil`, `test_users_cambio_de_perfil_rige_en_la_siguiente_solicitud`, `test_create_user_actor_degradado_durante_el_hash_rechazado` (resolveSession relee al usuario; requireActor)
- ✅ AC-08 — `test_deactivate_user_cierra_todas_sus_sesiones`, `test_users_baja_cierra_las_dos_sesiones_y_rechaza_login`, `test_users_page_baja_y_reactivacion` (DeactivateUser + sessions.deleteByUserId)
- ✅ AC-09 — `test_reactivate_user_vuelve_a_activo`, `test_users_reactivar_permite_login`, `test_users_page_baja_y_reactivacion` (ReactivateUser)
- ✅ AC-10 — `test_admin_policy_ultimo_admin_rechazado`, `test_update_user_ultimo_admin_rechazado`, `test_deactivate_user_ultimo_admin_rechazado`, `test_users_ultimo_admin_baja_o_cambio_de_perfil_409`, `test_users_page_ultimo_admin_muestra_conflicto_rechazado` (assertKeepsAnActiveAdmin)
- ✅ AC-11 — `test_deactivate_user_con_dos_admins_se_realiza`, `test_users_con_dos_admins_la_baja_se_realiza`
- ✅ AC-12 — `test_list_users_devuelve_activos_e_inactivos_sin_hash`, `test_users_admin_lista_activos_e_inactivos_sin_hash` (toPublicUser)
- ✅ AC-13 — `test_authorization_editor_y_consulta_sin_permiso_rechazado`, `test_list_users_editor_no_autorizado`, `test_users_editor_y_consulta_no_autorizado_403_sin_datos` (Authorization.assertCan)
- ✅ AC-14 — `test_create_user_consulta_no_autorizado`, `test_users_editor_y_consulta_no_autorizado_403_sin_datos`
- ✅ AC-15 — `test_users_baja_cierra_las_dos_sesiones_y_rechaza_login` (resolveSession rechaza Inactivos; sesiones borradas)
- ✅ AC-16 — `test_home_muestra_acceso_a_usuarios_solo_a_admin`, `test_users_page_lista_usuarios_con_perfil_y_estado`, `test_users_page_alta_recarga_el_listado`, `test_users_page_baja_y_reactivacion` (AppLayout; UsersPage)
- ✅ AC-17 — `test_home_muestra_acceso_a_usuarios_solo_a_admin`, `test_router_usuarios_con_perfil_editor_rechazado_redirige` (AppLayout; usersLoader)
- ✅ AC-18 — `test_users_bajas_simultaneas_entre_dos_admins_conflicto_rechazado` (UoW IMMEDIATE síncrona; exactamente una baja y 1 Admin Activo)
- ✅ AC-19 — `test_create_user_nombre_o_email_invalido_rechazado`, `test_users_alta_body_invalido_400` (parseUserName, Email.create, parseUserRole)

## Spec blocks
- ✅ Block 1 — 22/22; Required tests: `test_authorization_admin_puede_leer_y_gestionar_usuarios`, `test_authorization_editor_y_consulta_sin_permiso_rechazado`, `test_admin_policy_ultimo_admin_rechazado`, `test_list_users_devuelve_activos_e_inactivos_sin_hash`, `test_list_users_editor_no_autorizado`, `test_create_user_queda_activo_con_perfil`, `test_create_user_email_duplicado_rechazado`, `test_create_user_contrasena_corta_rechazado`, `test_create_user_nombre_o_email_invalido_rechazado`, `test_create_user_consulta_no_autorizado`, `test_create_user_actor_degradado_durante_el_hash_rechazado`, `test_update_user_cambia_nombre_y_email`, `test_update_user_email_duplicado_rechazado`, `test_update_user_cambia_perfil`, `test_update_user_inexistente_rechazado`, `test_update_user_ultimo_admin_rechazado`, `test_deactivate_user_cierra_todas_sus_sesiones`, `test_deactivate_user_ultimo_admin_rechazado`, `test_deactivate_user_con_dos_admins_se_realiza`, `test_reactivate_user_vuelve_a_activo`, `test_in_memory_uow_error_revierte_usuarios_y_sesiones`, `test_register_first_admin_email_duplicado_sigue_siendo_ya_existe`
- ✅ Block 2 — 19/19; Required tests: `test_users_admin_lista_activos_e_inactivos_sin_hash`, `test_users_editor_y_consulta_no_autorizado_403_sin_datos`, `test_users_alta_201_y_el_nuevo_usuario_inicia_sesion`, `test_users_alta_email_duplicado_409`, `test_users_alta_contrasena_corta_400`, `test_users_alta_body_invalido_400`, `test_users_modificar_sin_campos_invalido_400`, `test_users_modificar_nombre_email_y_login_con_email_nuevo`, `test_users_modificar_email_duplicado_409`, `test_users_cambio_de_perfil_rige_en_la_siguiente_solicitud`, `test_users_baja_cierra_las_dos_sesiones_y_rechaza_login`, `test_users_reactivar_permite_login`, `test_users_ultimo_admin_baja_o_cambio_de_perfil_409`, `test_users_con_dos_admins_la_baja_se_realiza`, `test_users_bajas_simultaneas_entre_dos_admins_conflicto_rechazado`, `test_users_inexistente_404`, `test_user_repository_email_duplicado_lanza_email_already_in_use`, `test_session_repository_delete_by_user_id_borra_solo_las_suyas`, `test_drizzle_uow_error_revierte_baja_y_sesiones`
- ✅ Block 3 — 12/12; Required tests: `test_client_patch_envia_json_con_content_type`, `test_users_page_lista_usuarios_con_perfil_y_estado`, `test_users_page_alta_recarga_el_listado`, `test_users_page_email_duplicado_muestra_error_rechazado`, `test_users_page_baja_y_reactivacion`, `test_users_page_ultimo_admin_muestra_conflicto_rechazado`, `test_users_page_error_de_red_conserva_listado`, `test_users_page_403_no_autorizado_refresca_y_vuelve_al_inicio`, `test_users_page_401_tras_darse_de_baja_lleva_al_login`, `test_home_muestra_acceso_a_usuarios_solo_a_admin`, `test_router_usuarios_con_perfil_editor_rechazado_redirige`, `test_users_api_respuesta_invalida_es_network_error`

## Tests
- ✅ Sad-path tests: cada ruta y caso de uso tiene entrada inválida probada — 400 de forma (`test_users_alta_body_invalido_400`, `test_users_modificar_sin_campos_invalido_400`), 403 (`test_users_editor_y_consulta_no_autorizado_403_sin_datos`), 404 (`test_users_inexistente_404`), 409 (`test_users_alta_email_duplicado_409`, `test_users_ultimo_admin_baja_o_cambio_de_perfil_409`), 415; en la web, red y forma inválida (`test_users_page_error_de_red_conserva_listado`, `test_users_api_respuesta_invalida_es_network_error`).
- ✅ TDD: reconstrucción independiente contra `main` — 52/53 Required tests en rojo (39 por módulo inexistente, 13 por aserción); el 53.º (`test_user_repository_email_duplicado_lanza_email_already_in_use`) queda verde contra main por un artefacto de import, y su rojo se demostró por mutación en Block 2. 15 mutaciones sobre HEAD: 12 detectadas.

## Ronda 2
- ✅ W-2 de la ronda 1 cerrado: `test_update_user_actor_desactualizado_rechazado` y `test_reactivate_user_actor_desactualizado_rechazado` (commit `063bda1`) fallan con `requireActor` quitado de `UpdateUser.ts:38` o `ReactivateUser.ts:23` y pasan con el código real; el verificador lo reprodujo de forma independiente. `git diff eba741c..HEAD -- server/src web/src` vacío.

## Warnings (no bloquean)
- ⚠️ W-1: AC-07 se prueba Admin→Editor por HTTP; el caso literal Editor→Consulta no es observable hoy porque ambos perfiles tienen los mismos permisos.
- ⚠️ W-3: helpers de `UsersPage.test.tsx` atados al DOM de antd (`.ant-modal-title`, `closest('tr')`) y un `setTimeout(50)` para una aserción negativa (deuda aceptada en decisions-FEAT-006.md).
- ⚠️ W-4: artefacto de reconstrucción TDD del test de email duplicado del repositorio (informativo).

Result: PASSED
