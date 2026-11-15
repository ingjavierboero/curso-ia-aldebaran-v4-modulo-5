# Verification FEAT-009

Ronda 1, 2026-11-15, sobre `23ce3db` (3 bloques y reportes de CODE). Verificación cruzada por `daw-module-verifier` (agente que no escribió el código): 396/396 tests, lint y typecheck en 0.

| Field | Value |
|---|---|
| Module | server/src/domain/auth/AttemptWindow.ts, server/src/infrastructure/http/rateLimit/, server/src/infrastructure/http/routes/{auth,setup}.ts |
| Line coverage | 96.73% |
| Branch coverage | 89.06% |
| Function coverage | 93.18% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean; `npm run typecheck` (`tsc -b`) — clean |

Cobertura medida solo sobre los archivos de producto modificados por el ticket (`git diff feat/FEAT-007-cambio-de-contrasena...HEAD`, sin tests). `AttemptWindow.ts` y `AttemptTracker.ts` al 100%. Suite completa: 94.3% líneas, 91.35% ramas, 95.97% funciones.

## Acceptance criteria
- ✅ AC-01 — `test_login_quinto_fallo_bloquea_sexto_rechazado`, `test_attempt_window_bloquea_en_el_quinto_fallo`, `test_attempt_window_intento_bloqueado_rechazado_sin_registrar`, `test_attempt_gate_ip_faltante_rechazado`
- ✅ AC-02 — `test_login_desbloquea_a_los_15_minutos`, `test_attempt_window_bloqueo_vence_a_los_15_minutos`
- ✅ AC-03 — `test_login_fallo_fuera_de_ventana_no_cuenta`, `test_attempt_window_fallo_viejo_fuera_de_ventana`
- ✅ AC-04 — `test_login_email_invalido_no_cuenta`
- ✅ AC-05 — `test_password_actual_incorrecta_bloquea_sexto_rechazado`
- ✅ AC-06 — `test_password_nueva_invalida_no_cuenta`
- ✅ AC-07 — `test_first_admin_rechazado_cinco_veces_bloquea`
- ✅ AC-08 — `test_login_bloqueado_no_ejecuta_caso_de_uso`, `test_attempt_gate_bloqueado_rechazado_429`
- ✅ AC-09 — `test_login_bloqueado_mensaje_y_retry_after`, `test_attempt_window_retry_after_redondea_hacia_arriba`
- ✅ AC-10 — `test_login_exito_reinicia_contador`, `test_attempt_tracker_succeed_reinicia`
- ✅ AC-11 — `test_login_bloqueado_no_afecta_cambio_de_contraseña`
- ✅ AC-12 — `test_bloqueo_registrado_en_log_sin_contraseñas`, `test_attempt_gate_body_invalido_registra_bloqueo`
- ✅ AC-13 — `test_login_page_bloqueo_rechazado_muestra_mensaje`, `test_first_admin_page_bloqueo_rechazado_muestra_mensaje`, `test_profile_page_bloqueo_rechazado_muestra_mensaje`
- ✅ AC-14 — `test_reinicio_borra_bloqueo`
- ✅ AC-15 — `test_attempt_tracker_barrido_descarta_inactivas` (barrido al siguiente acceso; interpretación aceptada por el usuario, ver abajo)

NFR-01 (el bloqueado no ejecuta el caso de uso ni argon2), NFR-02 (registros en memoria creados en cada `createApp`) y NFR-03 (barrido amortizado de entradas inactivas) cumplidos.

## Spec blocks
- ✅ Block 1 — regla `AttemptWindow`, registro `AttemptTracker`, compuerta `attemptGate` y dependencia `express-rate-limit` `^8.7.2`; 10 Required tests en verde (commit `f5c3f22`)
- ✅ Block 2 — registros y compuertas dentro de `createApp`, montadas en la firma de las tres rutas, fallo y acierto informados según la spec; 13 Required tests en verde (commit `4e1c924`)
- ✅ Block 3 — tests de las tres pantallas; sin cambios de producto, como preveía la spec; 3 Required tests en verde (commit `7e7f65e`)

## Tests
- ✅ Required tests: los 26 identificadores de la spec existen con el nombre exacto y pasan: `test_attempt_window_bloquea_en_el_quinto_fallo`, `test_attempt_window_bloqueo_vence_a_los_15_minutos`, `test_attempt_window_fallo_viejo_fuera_de_ventana`, `test_attempt_window_intento_bloqueado_rechazado_sin_registrar`, `test_attempt_window_retry_after_redondea_hacia_arriba`, `test_attempt_tracker_succeed_reinicia`, `test_attempt_tracker_barrido_descarta_inactivas`, `test_attempt_gate_bloqueado_rechazado_429`, `test_attempt_gate_body_invalido_registra_bloqueo`, `test_attempt_gate_ip_faltante_rechazado`, `test_login_quinto_fallo_bloquea_sexto_rechazado`, `test_login_desbloquea_a_los_15_minutos`, `test_login_fallo_fuera_de_ventana_no_cuenta`, `test_login_email_invalido_no_cuenta`, `test_password_actual_incorrecta_bloquea_sexto_rechazado`, `test_password_nueva_invalida_no_cuenta`, `test_first_admin_rechazado_cinco_veces_bloquea`, `test_login_bloqueado_no_ejecuta_caso_de_uso`, `test_login_bloqueado_mensaje_y_retry_after`, `test_login_exito_reinicia_contador`, `test_login_bloqueado_no_afecta_cambio_de_contraseña`, `test_bloqueo_registrado_en_log_sin_contraseñas`, `test_reinicio_borra_bloqueo`, `test_login_page_bloqueo_rechazado_muestra_mensaje`, `test_first_admin_page_bloqueo_rechazado_muestra_mensaje`, `test_profile_page_bloqueo_rechazado_muestra_mensaje`; más 4 de apoyo pedidos en las revisiones
- ✅ Sad-path tests: login (email inválido, contraseña incorrecta), cambio (actual incorrecta, nueva de 7 caracteres), primer Admin (409 y body inválido), compuerta (body array o texto, IP ausente) y web (429 en las tres pantallas)
- ✅ Business-logic coverage (W-VER-02): `AttemptWindow` y `AttemptTracker` al 100%

## Decisiones del usuario en esta ronda
- TDD del Block 3: los 3 tests pasaron de entrada porque el comportamiento ya existía; su capacidad de fallar se probó rompiendo las pantallas a propósito. Excepción ratificada por el usuario (tests de caracterización).
- NFR-03 / AC-15: el barrido corre al siguiente acceso a la operación; sin tráfico posterior, las entradas viejas pueden quedar más de 30 minutos, pero la memoria no crece. Interpretación aceptada por el usuario sin barrido periódico.

## Warnings (no bloquean)
- W-1 (W-VER-01) — `attemptGate.ts`: `decrement` y `resetKey` del `Store` (exigidos por la interfaz de express-rate-limit) y el `catch` defensivo de `safeEmailOf` quedan sin ejecutar.
- W-2 (W-VER-03) — `test_login_bloqueado_no_ejecuta_caso_de_uso` mide la cota de 50 ms con tiempo real; la garantía fuerte es el conteo de llamadas del doble. Vigilar en la CI.
- W-3 — FR-02: no hay test HTTP de email inexistente ni de usuario Inactivo contando como fallo; ambos lanzan `InvalidCredentials`, el único error que la ruta cuenta.
- W-4 — con N = 1 el mensaje dice "1 minutos" (literal de la spec).
- W-5 — el cierre de las alertas #2, #3 y #5 de CodeQL se confirma en el escaneo del PR, no localmente.

Result: PASSED
