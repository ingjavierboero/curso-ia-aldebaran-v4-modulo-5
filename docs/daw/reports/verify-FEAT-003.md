# Verification FEAT-003

Verificación del módulo completo en `feat/FEAT-003-chequeo-de-salud` (HEAD `e8a25f3`, árbol limpio), contra `docs/daw/prd/prd-FEAT-003.md` (corregido en `b0dd93f`) y `docs/daw/specs/spec-FEAT-003.md` (corregido en `e3c4f34`). Verificador independiente: `daw-module-verifier`, que no escribió el código. Ronda 2: la ronda 1 dio PASSED con avisos en AC-03, AC-05 y AC-12, y por decisión del usuario se corrigió el PRD y se sumó el test de la pantalla principal.

| Field | Value |
|---|---|
| Module | dominio y aplicación `health`, `job_runs`, `SqliteDatabaseProbe`, `PeekSession`, `GET`/`HEAD /api/health`, `HealthBanner` en la pantalla principal |
| Line coverage | 91.44% |
| Branch coverage | 88.44% |
| Function coverage | 94.76% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 findings; `npm run typecheck` (`tsc -b`) — clean |

## Acceptance criteria
- ✅ AC-01 — `test_health_sin_sesion_ok_200_solo_status`, `test_todo_sano_estado_ok`, `test_health_variantes_de_ruta_no_autorizado_401` (`server/src/infrastructure/http/routes/health.ts:42`)
- ✅ AC-02 — `test_health_sin_sesion_degradado_503_solo_status`, `test_health_head_responde_codigo_sin_body`
- ✅ AC-03 — `test_get_health_detalle_por_proceso`, `test_health_con_sesion_trae_detalle`, `test_peek_session_no_renueva_last_activity` (sesión válida y base disponible)
- ✅ AC-04 — `test_peek_session_token_invalido_rechazado_devuelve_null`, `test_health_cookie_invalida_rechazada_responde_anonimo_sin_401`
- ✅ AC-05 — `test_health_base_caida_503_en_menos_de_un_segundo`, `test_health_base_caida_con_cookie_503_anonimo_en_menos_de_un_segundo`, `test_get_health_con_base_caida_no_consulta_corridas`, `test_base_no_disponible_degrada_y_omite_corridas`, `test_banner_degradado_sin_detalle_nombra_base_de_datos`, `test_home_muestra_banner_con_estado_degradado`
- ✅ AC-06 — `test_ultima_corrida_con_error_degrada`, `test_run_tracked_job_error_del_job_se_graba_y_se_relanza`
- ✅ AC-07 — `test_nombre_duplicado_rechazado`, `test_run_tracked_job_nombre_no_registrado_rechazado`
- ✅ AC-08 — `test_intervalo_invalido_rechazado` (0, -1, 1.5, NaN, Infinity; 1 como límite válido)
- ✅ AC-09 — `test_run_tracked_job_graba_inicio_fin_y_resultado`, `test_repositorio_guarda_y_devuelve_ultima_corrida`, `test_outcome_invalido_rechazado_por_la_base`, `test_run_tracked_job_falla_de_grabacion_no_oculta_error_del_job`
- ✅ AC-10 — `test_job_atrasado_tras_dos_intervalos_sin_exito` (borde estricto: 2 intervalos no atrasa, 2 intervalos + 1 ms sí)
- ✅ AC-11 — `test_job_sin_corridas_cuenta_desde_el_arranque`
- ✅ AC-12 — `test_banner_visible_con_estado_degradado_nombra_lo_degradado`, `test_banner_se_actualiza_cada_60_segundos`, `test_home_muestra_banner_con_estado_degradado` (nivel pantalla principal)
- ✅ AC-13 — `test_banner_oculto_con_estado_ok`, `test_banner_error_de_red_conserva_ultimo_estado`, `test_banner_respuesta_tardia_rechazada_tras_desmontar`
- ✅ AC-14 — `test_probe_base_bloqueada_no_disponible_en_menos_de_un_segundo` y los dos tests HTTP con lock real (~540 ms medidos, con y sin cookie)

## Spec blocks
- ✅ Block 1 — dominio de salud y `job_runs`: 9 Required tests (`687dc4a`)
- ✅ Block 2 — casos de uso, sondeo y `PeekSession`: 9 Required tests (`900a558`)
- ✅ Block 3 — endpoint `/api/health`: 8 Required tests (`609f1f8`)
- ✅ Block 4 — banner en la pantalla principal: 7 Required tests (`b3c8889`, `7927608`)

## Tests
- ✅ `test_job_atrasado_tras_dos_intervalos_sin_exito`
- ✅ `test_job_sin_corridas_cuenta_desde_el_arranque`
- ✅ `test_ultima_corrida_con_error_degrada`
- ✅ `test_base_no_disponible_degrada_y_omite_corridas`
- ✅ `test_todo_sano_estado_ok`
- ✅ `test_intervalo_invalido_rechazado`
- ✅ `test_nombre_duplicado_rechazado`
- ✅ `test_outcome_invalido_rechazado_por_la_base`
- ✅ `test_repositorio_guarda_y_devuelve_ultima_corrida`
- ✅ `test_get_health_con_base_caida_no_consulta_corridas`
- ✅ `test_get_health_detalle_por_proceso`
- ✅ `test_run_tracked_job_graba_inicio_fin_y_resultado`
- ✅ `test_run_tracked_job_nombre_no_registrado_rechazado`
- ✅ `test_run_tracked_job_error_del_job_se_graba_y_se_relanza`
- ✅ `test_run_tracked_job_falla_de_grabacion_no_oculta_error_del_job`
- ✅ `test_probe_base_bloqueada_no_disponible_en_menos_de_un_segundo`
- ✅ `test_peek_session_token_invalido_rechazado_devuelve_null`
- ✅ `test_peek_session_no_renueva_last_activity`
- ✅ `test_health_sin_sesion_ok_200_solo_status`
- ✅ `test_health_sin_sesion_degradado_503_solo_status`
- ✅ `test_health_con_sesion_trae_detalle`
- ✅ `test_health_cookie_invalida_rechazada_responde_anonimo_sin_401`
- ✅ `test_health_base_caida_503_en_menos_de_un_segundo`
- ✅ `test_health_base_caida_con_cookie_503_anonimo_en_menos_de_un_segundo`
- ✅ `test_health_variantes_de_ruta_no_autorizado_401`
- ✅ `test_health_head_responde_codigo_sin_body`
- ✅ `test_banner_visible_con_estado_degradado_nombra_lo_degradado`
- ✅ `test_banner_degradado_sin_detalle_nombra_base_de_datos`
- ✅ `test_banner_oculto_con_estado_ok`
- ✅ `test_banner_se_actualiza_cada_60_segundos`
- ✅ `test_banner_error_de_red_conserva_ultimo_estado`
- ✅ `test_banner_respuesta_tardia_rechazada_tras_desmontar`
- ✅ `test_home_muestra_banner_con_estado_degradado`
- ✅ Sad-path tests: entrada inválida cubierta en `JobDefinition`, `JobCatalog`, `RunTrackedJob`, `PeekSession`, el sondeo, la ruta (cookie, variantes, `PeekSession` que lanza) y `healthApi` (status y body con forma inválida)
- Suite completa: 211/211 (41 archivos) en 3 corridas, 0 skipped

## TDD evidence
Registrada por bloque en `.daw-work/review-block-{1,2,3,4}.md`, revisada por un `daw-module-verifier` distinto en cada bloque: rojo a nivel de aserción antes de implementar en los 33 Required tests (en el Block 3 el test con cookie se mostró en rojo a 5696 ms antes del arreglo; en el Block 4 el test de la pantalla principal se mostró en rojo quitando `<HealthBanner />`).

## Warnings
- W-VER-03: los tres tests con lock real afirman menos de 1000 ms y miden ~540 ms; margen acotado en una CI cargada. Los tests del banner dependen de `settle()` (50 vueltas de microtareas).
- La evidencia TDD está resumida por bloque, no test por test; coincide con los archivos en disco.

Result: PASSED
