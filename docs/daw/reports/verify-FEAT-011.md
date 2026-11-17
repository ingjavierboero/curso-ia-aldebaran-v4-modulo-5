# Verification FEAT-011

Verificación cruzada por `daw-module-verifier` (agente que no escribió el código) sobre `ecc36ce`, diff `41f5bb8..HEAD`. Suite completa 714/714, `oxlint --type-aware` y `tsc -b` limpios.

| Field | Value |
|---|---|
| Module | configuración de facturación: server/src (domain/settings, domain/shared, application/settings, infrastructure/db, infrastructure/http) y web/src (api, pages, router, components) |
| Line coverage | 91.72% |
| Branch coverage | 94.62% |
| Function coverage | 94.62% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean; `npm run typecheck` (`tsc -b`) — clean |

Cobertura medida solo sobre los 38 archivos fuente nuevos o modificados del ticket (json-summary v8). La suite completa con el comando del reporte de tests da 96.32 / 93.21 / 97.19.

## Acceptance criteria
- ✅ AC-01 — `test_billing_settings_defaults_hora_11`, `test_settings_repo_sin_fila_devuelve_defaults`, `test_get_billing_settings_tres_perfiles`, `test_http_get_settings_recien_instalado`, `test_web_configuracion_muestra_valores_y_obligatorios`, `test_http_get_settings_rapido` (BillingSettings.ts:defaults, DrizzleSettingsRepository.ts:get, routes/settings.ts GET)
- ✅ AC-02 — `test_billing_hour_valida_2359`, `test_settings_repo_guardar_y_releer`, `test_update_billing_settings_admin_guarda`, `test_http_patch_hora_y_punto_de_venta`, `test_web_admin_guarda_configuracion` (BillingHour.ts:parse)
- ✅ AC-03 — `test_billing_hour_invalida_rechazada`, `test_http_patch_hora_invalida_rechazada`, `test_web_hora_invalida_rechazada`
- ✅ AC-04 — `test_point_of_sale_valido_5`, `test_update_billing_settings_admin_guarda`, `test_http_patch_hora_y_punto_de_venta` (PointOfSale.ts:of)
- ✅ AC-05 — `test_point_of_sale_invalido_rechazado`, `test_http_patch_punto_de_venta_invalido_rechazado` (body.ts:optionalInteger para 2.5)
- ✅ AC-06 — `test_activity_start_hoy_y_bisiesto_validos`, `test_billing_settings_with_changes_conserva_no_enviados`, `test_http_patch_emisor_completo`, `test_web_admin_guarda_configuracion`
- ✅ AC-07 — `test_issuer_iva_condition_responsable_inscripto_rechazada`, `test_http_patch_condicion_iva_emisor_invalida_rechazada`, `test_web_valor_rechazado_por_server_muestra_error` (IssuerIvaCondition.ts:of)
- ✅ AC-08 — `test_activity_start_fecha_inexistente_o_futura_rechazada`, `test_argentina_date_borde_medianoche`, `test_update_billing_settings_fecha_futura_rechazada_hora_argentina`, `test_http_patch_fecha_inicio_invalida_rechazada` (ActivityStartDate.ts:parse, argentinaDate.ts)
- ✅ AC-09 — `test_iibb_trim_y_largo_invalido_rechazado`, `test_http_patch_iibb_invalido_rechazado_y_trim` (issuerText.ts:parseIibb)
- ✅ AC-10 — `test_billing_settings_missing_required_en_orden`, `test_update_billing_settings_guarda_con_faltantes`, `test_http_patch_con_faltantes_devuelve_missing`, `test_web_aviso_faltantes_y_desaparece`
- ✅ AC-11 — `test_update_billing_settings_completa_ultimo_faltante`, `test_http_patch_emisor_completo`, `test_web_aviso_faltantes_y_desaparece`
- ✅ AC-12 — `test_billing_settings_missing_required_en_orden`, `test_http_patch_con_faltantes_devuelve_missing`, `test_web_configuracion_muestra_valores_y_obligatorios`
- ✅ AC-13 — `test_authorization_permisos_de_configuracion`, `test_update_billing_settings_editor_consulta_forbidden`, `test_http_patch_editor_consulta_forbidden`, `test_web_editor_consulta_solo_lectura`, `test_web_ruta_configuracion_sin_sesion_no_autorizado` (Authorization.ts, UpdateBillingSettings.ts:execute)
- ✅ AC-14 — `test_update_billing_settings_invalido_no_guarda_nada`, `test_http_patch_mixto_invalido_no_cambia_nada` (UpdateBillingSettings.ts:toChanges antes de uow.run)
- ✅ AC-15 — `test_settings_persisten_tras_reiniciar` (DrizzleSettingsRepository.ts, archivo real con reapertura)

Los tests HTTP comparan el body completo y la fila de `settings` leída de la base; ninguno verifica solo el status.

## Spec blocks
- ✅ Block 1 — 14/14 Required tests presentes y en verde: `test_billing_hour_valida_2359`, `test_billing_hour_invalida_rechazada`, `test_point_of_sale_valido_5`, `test_point_of_sale_invalido_rechazado`, `test_issuer_iva_condition_responsable_inscripto_rechazada`, `test_activity_start_fecha_inexistente_o_futura_rechazada`, `test_activity_start_hoy_y_bisiesto_validos`, `test_argentina_date_borde_medianoche`, `test_iibb_trim_y_largo_invalido_rechazado`, `test_issuer_text_invalido_rechazado`, `test_billing_settings_defaults_hora_11`, `test_billing_settings_missing_required_en_orden`, `test_billing_settings_with_changes_conserva_no_enviados`, `test_authorization_permisos_de_configuracion`
- ✅ Block 2 — 7/7 Required tests presentes y en verde: `test_settings_repo_sin_fila_devuelve_defaults`, `test_settings_repo_guardar_y_releer`, `test_settings_repo_upsert_idempotente`, `test_settings_repo_fila_corrupta_invalida_rechazada`, `test_migracion_settings_check_invalido_rechazado`, `test_uow_error_revierte_settings`, `test_settings_persisten_tras_reiniciar`
- ✅ Block 3 — 8/8 Required tests presentes y en verde: `test_get_billing_settings_tres_perfiles`, `test_update_billing_settings_admin_guarda`, `test_update_billing_settings_editor_consulta_forbidden`, `test_update_billing_settings_admin_inactivo_no_autorizado`, `test_update_billing_settings_invalido_no_guarda_nada`, `test_update_billing_settings_guarda_con_faltantes`, `test_update_billing_settings_completa_ultimo_faltante`, `test_update_billing_settings_fecha_futura_rechazada_hora_argentina`
- ✅ Block 4 — 14/14 Required tests presentes y en verde: `test_http_get_settings_recien_instalado`, `test_http_patch_hora_y_punto_de_venta`, `test_http_patch_hora_invalida_rechazada`, `test_http_patch_punto_de_venta_invalido_rechazado`, `test_http_patch_emisor_completo`, `test_http_patch_condicion_iva_emisor_invalida_rechazada`, `test_http_patch_fecha_inicio_invalida_rechazada`, `test_http_patch_iibb_invalido_rechazado_y_trim`, `test_http_patch_con_faltantes_devuelve_missing`, `test_http_patch_editor_consulta_forbidden`, `test_http_patch_mixto_invalido_no_cambia_nada`, `test_http_patch_body_vacio_invalido`, `test_http_settings_sin_sesion_no_autorizado`, `test_http_get_settings_rapido`
- ✅ Block 5 — 9/9 Required tests presentes y en verde: `test_web_configuracion_muestra_valores_y_obligatorios`, `test_web_admin_guarda_configuracion`, `test_web_hora_invalida_rechazada`, `test_web_aviso_faltantes_y_desaparece`, `test_web_valor_rechazado_por_server_muestra_error`, `test_web_editor_consulta_solo_lectura`, `test_web_guardado_forbidden_muestra_error`, `test_web_respuesta_invalida_error_generico`, `test_web_ruta_configuracion_sin_sesion_no_autorizado`

Los 52 identificadores aparecen en los archivos de test; ninguno falta. Desvíos y supuestos aprobados en `docs/daw/specs/decisions-FEAT-011.md`.

## Tests
- ✅ Sad-path tests: GET sin sesión (401) y con actor Inactivo (Forbidden); PATCH con 19 bodies de forma inválida (400 con mensaje exacto), valores rechazados por el dominio (hora, punto de venta, condición del emisor, fecha inexistente o futura, IIBB, razón social en blanco), 401, 403 de Editor y Consulta y envío mixto inválido sin cambios; fila corrupta → InvalidStoredValue por columna; en la web hora, punto de venta, fecha futura, IIBB de 51, guardar sin cambios, 400, 403 y respuesta con forma inválida.

## Warnings
- ⚠️ W-VER-01 — `BillingHour.toString()` y `ActivityStartDate.toString()` sin uso; `equals()` de los value objects y `BillingSettings.toData()` usados solo en tests; fallback `?? ''` inalcanzable en `argentinaDate.ts:15`.
- ⚠️ W-VER-02 — lógica central bajo 90% en algún eje por archivo: `ActivityStartDate.ts` (funciones 83.33), `IvaCondition.ts` (ramas 87.5, heredado), `BillingHour.ts` (funciones 75) y `argentinaDate.ts` (ramas 50), por los métodos y el fallback de W-VER-01. El resto de `domain/settings` y `application/settings` al 100%.
- ⚠️ W-VER-03 — `test_http_get_settings_rapido` mide tiempo real (umbral 200 ms, mediana de 5); `test_http_patch_con_faltantes_devuelve_missing` reasigna la app de test a mitad del caso.
- ℹ️ `test_web_respuesta_invalida_error_generico` repite el identificador de un test de FEAT-010 (`ClientsPage.test.tsx`).
- ℹ️ 401 al cargar o guardar en `SettingsPage.tsx` sin test de página (cubierto por el loader del router y el cliente HTTP).
- ℹ️ AC-07, AC-08 y AC-09 por HTTP comprueban "mantener el valor anterior" contra la base vacía; con un valor ya guardado lo prueban AC-03, AC-05, AC-14 y la razón social en blanco.
- ℹ️ Evidencia TDD: Block 2 con rojos mayormente por stub (compensado con 22/23 mutaciones) y Block 5 con aserción documentada en 2 tests (compensado con 19/19 mutaciones).

Result: PASSED
