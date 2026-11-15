# Verification FEAT-004

Verificación cruzada PRD ↔ spec ↔ código ↔ tests hecha por `daw-module-verifier` (agente que no escribió el código), sobre `12158bc`. `npx vitest run` 236/236 en 44 archivos.

| Field | Value |
|---|---|
| Module | server/src/{domain,application}/health, server/src/infrastructure/{logging/healthEventLog,db/parseIsoDate,http/routes/health}.ts, web/src/api/{authApi,healthApi,types}.ts, web/src/components/HealthBanner.tsx |
| Line coverage | 91.66% |
| Branch coverage | 88.99% |
| Function coverage | 94.9% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean |

## Acceptance criteria
- ✅ AC-01 — `test_banner_degradado_sin_detalle_confirma_sesion_una_vez` (web/src/components/HealthBanner.tsx: `check` → `lacksDetail` → `confirmSession`)
- ✅ AC-02 — `test_banner_sesion_no_autorizada_lleva_al_login_sin_banner` (HealthBanner.tsx: `confirmSession`, 401 → sin banner; navegación por `request` en web/src/api/authApi.ts)
- ✅ AC-03 — `test_banner_sesion_valida_nombra_base_de_datos`, `test_home_muestra_banner_con_estado_degradado` (HealthBanner.tsx: `confirmSession`)
- ✅ AC-04 — `test_banner_confirmacion_error_de_red_conserva_ultimo` (HealthBanner.tsx: `NetworkError` sin status)
- ✅ AC-05 — `test_banner_no_confirma_sesion_con_ok_ni_con_detalle` (HealthBanner.tsx: `check`)
- ✅ AC-06 — `test_evaluacion_lectura_fallida_degrada_el_proceso`, `test_evaluacion_lectura_fallida_sin_corrida_ni_atraso`, `test_get_health_lectura_fallida_marca_solo_ese_proceso`, `test_health_lectura_fallida_responde_503_con_read_failed` (server/src/application/health/GetHealth.ts: `readRuns`; server/src/domain/health/HealthEvaluation.ts: `evaluateJob`)
- ✅ AC-07 — `test_get_health_lectura_fallida_marca_solo_ese_proceso` (GetHealth.ts: `readRuns` por proceso)
- ✅ AC-08 — `test_get_health_lectura_fallida_registra_nombre_y_tipo_de_error`, `test_health_fecha_invalida_registra_invalid_stored_date`, `test_parse_iso_date_invalida_lanza_invalid_stored_date` (server/src/infrastructure/logging/healthEventLog.ts, server/src/infrastructure/db/parseIsoDate.ts)
- ✅ AC-09 — `test_get_health_lectura_fallida_no_registra_mensaje_de_error`, `test_health_lectura_fallida_respuesta_sin_texto_de_error`, `test_health_lectura_fallida_anonima_solo_status`
- ✅ AC-10 — `test_banner_nombra_proceso_con_lectura_fallida` (HealthBanner.tsx: `degradedNames`)
- ✅ AC-11 — `test_health_event_log_registro_sin_datos_de_sesion` (healthEventLog.ts: registro `{event, job, errorType, at}`)
- ✅ AC-12 — `test_banner_confirmacion_error_del_servidor_nombra_base_de_datos`, `test_network_error_5xx_lleva_status` (HealthBanner.tsx: `NetworkError` con status; authApi.ts: `request`)

## Spec blocks
- ✅ Block 1 — 6/6 archivos; Required tests: `test_evaluacion_lectura_fallida_degrada_el_proceso`, `test_evaluacion_lectura_fallida_sin_corrida_ni_atraso`, `test_get_health_lectura_fallida_marca_solo_ese_proceso`, `test_get_health_lectura_fallida_registra_nombre_y_tipo_de_error`, `test_get_health_lectura_fallida_no_registra_mensaje_de_error`, `test_get_health_log_que_lanza_error_no_rompe_el_reporte`, `test_get_health_base_no_disponible_no_lee_corridas`
- ✅ Block 2 — 8/8 archivos; Required tests: `test_health_lectura_fallida_responde_503_con_read_failed`, `test_health_lectura_fallida_respuesta_sin_texto_de_error`, `test_health_lectura_fallida_anonima_solo_status`, `test_health_fecha_invalida_registra_invalid_stored_date`, `test_health_event_log_registro_sin_datos_de_sesion`, `test_health_event_log_error_de_escritura_no_lanza`, `test_parse_iso_date_invalida_lanza_invalid_stored_date`
- ✅ Block 3 — 7/7 archivos; Required tests: `test_banner_degradado_sin_detalle_confirma_sesion_una_vez`, `test_banner_sesion_no_autorizada_lleva_al_login_sin_banner`, `test_banner_sesion_valida_nombra_base_de_datos`, `test_banner_confirmacion_error_de_red_conserva_ultimo`, `test_banner_confirmacion_error_del_servidor_nombra_base_de_datos`, `test_banner_no_confirma_sesion_con_ok_ni_con_detalle`, `test_banner_nombra_proceso_con_lectura_fallida`, `test_banner_respuesta_sin_read_failed_invalida_conserva_ultimo`, `test_banner_confirmacion_tardia_tras_desmontar_se_descarta`, `test_network_error_5xx_lleva_status`, `test_home_muestra_banner_con_estado_degradado`

## Tests
- ✅ Sad-path tests: `GetHealth.execute` (sondeo en false, valor lanzado que no es Error, log que lanza, fila corrupta real), `createHealthEventLog` (logger que lanza), `GET /api/health` (con y sin sesión, fecha ilegible), `isHealthJob` (`readFailed` ausente y no booleano), `confirmSession` (401, 5xx, red), `NetworkError` (5xx y fetch rechazado)
- ✅ TDD: reconstrucción independiente del verificador — con el código de `main`, los 25 Required tests fallan (20 en una aserción, 2 por el módulo nuevo inexistente, 3 en aserción tras agregar el puerto); coincide con lo que declararon los implementadores por bloque.

## Warnings (no bloquean)
- ⚠️ W-1: `test_banner_confirmacion_tardia_tras_desmontar_se_descarta` no detecta la guarda de abort de `confirmSession` (HealthBanner.tsx:54 y :58): una mutación que quita ambas guardas deja los 16 tests del banner en verde; la rama de la línea 58 queda sin cubrir. El código cumple la spec; el test es débil.
- ⚠️ W-2: sin test para una confirmación que responde un `ApiError` distinto de 401 (403, 429).
- ⚠️ W-3: sin test para un fallo solo en `findLatestSuccess`.
- ⚠️ W-4: `health.test.ts` usa `vi.spyOn` sin `vi.restoreAllMocks()` (deuda aceptada en decisions-FEAT-004.md).
- ⚠️ W-5: los 2 tests de `healthEventLog.test.ts` estuvieron en rojo por el módulo inexistente, no por una aserción.

Result: PASSED
