# Verification FEAT-008

Verificación cruzada por `daw-module-verifier` (agente que no escribió el código) sobre `8f38fa7`, diff `c4945ac..HEAD`. Suite completa 503/503, los tests sensibles a tiempo corridos 4 veces en verde, `oxlint --type-aware` y `tsc -b` limpios.

| Field | Value |
|---|---|
| Module | recuperación de contraseña por email: server/src (domain/auth, application/auth, infrastructure/db, email, http, logging) y web/src (api, pages, router) |
| Line coverage | 97.51% |
| Branch coverage | 92.21% |
| Function coverage | 95.87% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean; `npm run typecheck` (`tsc -b`) — clean |

Cobertura medida solo sobre los 28 archivos fuente del ticket (json-summary v8). La suite completa con el comando del reporte de tests da 94.65 / 92.23 / 96.15.

## Acceptance criteria
- ✅ AC-01 — `test_request_usuario_activo_envia_url_con_token`, `test_http_pedido_mismo_mensaje_exista_o_no`, `test_login_page_enlace_olvide_mi_contraseña`, `test_forgot_password_muestra_mensaje_fijo` (RequestPasswordReset.ts:execute, routes/passwordReset.ts)
- ✅ AC-02 — `test_http_url_ignora_host_de_la_solicitud`, `test_request_usa_app_url_configurada`, `test_app_url_por_defecto_localhost` (emailConfig.ts:resolveAppUrl)
- ✅ AC-03 — `test_request_email_inexistente_no_envia`, `test_http_pedido_mismo_mensaje_exista_o_no`, `test_http_tiempo_de_respuesta_parejo`
- ✅ AC-04 — `test_request_envio_con_error_registra_fallo`, `test_http_envio_con_error_mismo_mensaje_y_log` (passwordResetLog.ts)
- ✅ AC-05 — `test_reset_token_usable_a_los_9_minutos`, `test_check_token_valido_a_los_9_minutos`, `test_reset_page_token_valido_muestra_formulario`
- ✅ AC-06 — `test_reset_token_vencido_a_los_10_minutos_invalido`, `test_check_token_vencido_invalido`, `test_reset_page_token_invalido_redirige_a_los_5_segundos`
- ✅ AC-07 — `test_reset_token_usado_invalido`, `test_check_token_usado_invalido`, `test_http_token_invalido_rechazado_400`
- ✅ AC-08 — `test_request_nuevo_token_invalida_anterior`, `test_reset_token_anulado_invalido`, `test_reset_token_repo_contrato_invalida_y_purga`
- ✅ AC-09 — `test_reset_token_vencido_invalido_no_cambia`, `test_reset_page_token_vencido_al_confirmar_rechazado` (ResetPasswordWithToken.ts)
- ✅ AC-10 — `test_reset_contraseña_corta_rechazada_token_sigue_valido`, `test_http_confirm_contraseña_corta_rechazada`, `test_reset_page_contraseña_corta_rechazada`
- ✅ AC-11 — `test_reset_cambia_contraseña_y_cierra_sesiones`, `test_http_confirm_cambia_y_cierra_sesiones`, `test_reset_page_exito_redirige_a_login_con_aviso`
- ✅ AC-12 — `test_http_sexto_pedido_rechazado_429`, `test_http_bloqueado_no_cuenta`, `test_http_pedido_body_invalido_rechazado_y_cuenta`
- ✅ AC-13 — `test_can_issue_reset_token_respeta_5_minutos`, `test_request_dentro_de_5_minutos_rechazado_sin_token_nuevo`, `test_http_dos_pedidos_en_3_minutos_un_email`, `test_race_dos_pedidos_simultaneos_un_token`
- ✅ AC-14 — `test_http_sexta_confirmacion_rechazada_con_token_valido`, `test_http_token_valido_no_reinicia_conteo` (app.ts: resetCheckGate, resetConfirmGate)
- ✅ AC-15 — `test_redirect_envia_a_la_direccion_de_desarrollo` y el test de `createEmailSender` con `EMAIL_REDIRECT_TO`
- ✅ AC-16 — `test_http_log_sin_token_ni_contraseña`, `test_password_reset_log_sin_token`

Ningún criterio depende solo del código de estado: cada uno tiene un test que comprueba el cuerpo, el estado persistido o el log.

## Spec blocks
- ✅ Block 1 — 10/10 Required tests presentes y en verde: `test_reset_token_usable_a_los_9_minutos`, `test_reset_token_vencido_a_los_10_minutos_invalido`, `test_reset_token_usado_invalido`, `test_reset_token_anulado_invalido`, `test_can_issue_reset_token_respeta_5_minutos`, `test_reset_token_repo_contrato_invalida_y_purga`, `test_reset_token_hash_duplicado_rechazado`, `test_reset_token_usuario_inexistente_rechazado`, `test_migracion_password_reset_tokens`, `test_uow_error_revierte_reset_tokens`
- ✅ Block 2 — 20/20 Required tests presentes y en verde: `test_request_usuario_activo_envia_url_con_token`, `test_request_usa_app_url_configurada`, `test_request_email_inexistente_no_envia`, `test_request_usuario_inactivo_no_envia`, `test_request_email_invalido_no_envia`, `test_request_envio_con_error_registra_fallo`, `test_request_dentro_de_5_minutos_rechazado_sin_token_nuevo`, `test_request_nuevo_token_invalida_anterior`, `test_request_no_espera_el_envio`, `test_check_token_valido_a_los_9_minutos`, `test_check_token_vencido_invalido`, `test_check_token_usado_invalido`, `test_check_token_formato_invalido`, `test_check_usuario_inactivo_invalido`, `test_reset_cambia_contraseña_y_cierra_sesiones`, `test_reset_contraseña_corta_rechazada_token_sigue_valido`, `test_reset_contraseña_larga_rechazada`, `test_reset_token_vencido_invalido_no_cambia`, `test_race_dos_pedidos_simultaneos_un_token`, `test_race_dos_confirmaciones_una_rechazada`
- ✅ Block 3 — 9/9 Required tests presentes y en verde: `test_app_url_por_defecto_localhost`, `test_app_url_configurada_sin_barra_final`, `test_app_url_invalida_rechazada`, `test_email_redirect_invalido_rechazado`, `test_redirect_envia_a_la_direccion_de_desarrollo`, `test_credenciales_faltantes_sender_sin_configurar`, `test_smtp_error_rechaza_sin_registrar_mensaje`, `test_smtp_opciones_de_transporte`, `test_password_reset_log_sin_token`
- ✅ Block 4 — 15/15 Required tests presentes y en verde: `test_http_pedido_mismo_mensaje_exista_o_no`, `test_http_url_ignora_host_de_la_solicitud`, `test_http_envio_con_error_mismo_mensaje_y_log`, `test_http_pedido_body_invalido_rechazado_y_cuenta`, `test_http_sexto_pedido_rechazado_429`, `test_http_dos_pedidos_en_3_minutos_un_email`, `test_http_confirm_cambia_y_cierra_sesiones`, `test_http_confirm_contraseña_corta_rechazada`, `test_http_token_invalido_rechazado_400`, `test_http_sexta_confirmacion_rechazada_con_token_valido`, `test_http_token_valido_no_reinicia_conteo`, `test_http_bloqueado_no_cuenta`, `test_http_log_sin_token_ni_contraseña`, `test_http_tiempo_de_respuesta_parejo`, `test_middleware_rutas_de_recuperacion_publicas`
- ✅ Block 5 — 12/12 Required tests presentes y en verde: `test_login_page_enlace_olvide_mi_contraseña`, `test_forgot_password_muestra_mensaje_fijo`, `test_forgot_password_email_invalido_rechazado`, `test_reset_page_token_valido_muestra_formulario`, `test_reset_page_token_invalido_redirige_a_los_5_segundos`, `test_reset_page_token_vencido_al_confirmar_rechazado`, `test_reset_page_contraseñas_distintas_rechazado`, `test_reset_page_contraseña_corta_rechazada`, `test_reset_page_exito_redirige_a_login_con_aviso`, `test_reset_page_bloqueo_429_error_muestra_mensaje`, `test_reset_page_quita_token_de_la_barra`, `test_auth_api_funciones_de_recuperacion`

Los 66 identificadores aparecen en los archivos de test; ninguno falta. Desvíos y supuestos aprobados en `docs/daw/specs/decisions-FEAT-008.md`.

## Tests
- ✅ Sad-path tests: cada endpoint y función con entrada tiene casos inválidos — body sin email (400, cuenta), token con formato inválido o inexistente (400), contraseña de 7 y 1025 caracteres (400), 429 en las tres rutas, `APP_URL` y `EMAIL_REDIRECT_TO` inválidos, SMTP que rechaza o vence, hash duplicado y FK inexistente, y en la web email inválido, contraseñas distintas, contraseña corta, 429 y caída de red.

## Warnings
- ⚠️ W-VER-03 — `test_http_tiempo_de_respuesta_parejo` mide con reloj real (sender de 500 ms); mitigado con calentamiento, orden rotado, p90 y diferencia de medianas; 4/4 corridas en verde, puede ser inestable en un CI cargado.
- ⚠️ W-VER-03 — los tests de `ResetPasswordPage.test.tsx` con timers falsos dependen de vueltas de microtareas (`settle`/`settleUntil`), justificado en el test; 4/4 corridas en verde.
- ℹ️ AC-08 y AC-15 se verifican por partes (aplicación + web; decorador + `createEmailSender`), no con un test HTTP de punta a punta.
- ℹ️ `SmtpEmailSender.ts` y `schema.ts` tienen funciones al 66.66% individualmente (fábrica real de nodemailer y lambda de la FK); el agregado del ticket supera el piso.
- ℹ️ Sin código muerto ni imports sin usar (W-VER-01). Deuda registrada en decisions: 500 como oráculo de enumeración con la base degradada, `/check` sin línea de log, `InvalidResetToken` reconocido por texto en la web, comentario de `AuthCard.tsx`, umbral de purga duplicado.

Result: PASSED
