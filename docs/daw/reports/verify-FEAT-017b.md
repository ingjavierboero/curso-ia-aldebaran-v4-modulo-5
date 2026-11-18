# Verification FEAT-017b

| Field | Value |
|---|---|
| Module | `e2e/`, `playwright.config.ts`, `.github/workflows/ci.yml` (job `e2e`), tests de tooling |
| Line coverage | 100% |
| Branch coverage | 96.55% |
| Function coverage | 100% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`, alcanza `playwright.config.ts` y `e2e/`) — clean; `npm run typecheck` (`tsc -b` con `tsconfig.e2e.json`) — clean |

Ronda 1, 2026-11-17. Verificación cruzada independiente (daw-module-verifier) con corridas propias:
`test:unit` 471/471, `test:integration` 274/274, `test:e2e` 1/1, suite con cobertura 745/745.

Cobertura: la del código nuevo, `e2e/e2eSettings.ts`, medida con
`npx vitest run --project server-unit server/test/unit/tooling/e2eConfig.test.ts --coverage --coverage.include='**/e2eSettings.ts' --coverage.allowExternal`:
100% líneas, 96.55% ramas (sin test: la etiqueta `#index` de `webServerProblems`, línea 106), 100%
funciones. La suite completa sigue en 98.19% / 92.87% / 97.83% (el reporte general no instrumenta
`e2e/`). `e2e/globalTeardown.ts` se ejercita en cada corrida e2e, que deja tmp sin directorios
`aldebaran-e2e-*`.

## Acceptance criteria
- ✅ AC-01 — job `e2e` con `needs: integration`; `test_ci_cuatro_jobs_lint_unit_integration_e2e`, `test_ci_cadena_needs`. Los cuatro checks separados se confirman sobre el PR.
- ✅ AC-09 — `e2e/smoke.e2e.ts`; `test_e2e_alta_primer_admin_login_e_inicio` recorre en Chromium el alta del primer Admin, el login y "Hola, Admin E2E"; corrida local en verde.
- ✅ AC-10 — `serverEnv`/`webServers` en `e2e/e2eSettings.ts` y `playwright.config.ts`; `test_e2e_config_levanta_server_y_web_en_modo_prueba`, `test_ci_e2e_instala_chromium_y_corre_test_e2e`.
- ✅ AC-11 — `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'` en `test-results/e2e/` y el paso de upload; `test_e2e_config_solo_chromium_y_evidencia_en_falla`, `test_ci_e2e_sube_evidencia_solo_en_falla`, `test_ci_evidencia_mal_configurada_rechazada`. Comprobado localmente forzando un timeout corto: quedaron captura, `trace.zip` y contexto en el `path` del upload.
- ✅ AC-12 — el upload es el único paso con `if:`, y es `failure()`; `test_ci_e2e_sube_evidencia_solo_en_falla`, `test_ci_if_que_saltea_cadena_rechazado`. Con la prueba en verde, `test-results/e2e/` queda solo con `.last-run.json`.
- ✅ AC-14 — `test` sigue siendo `vitest run` y ningún proyecto de Vitest incluye `e2e/`; `test_layout_scripts_por_tipo`, `test_layout_vitest_no_levanta_e2e`.

## Spec blocks
- ✅ Block 1 — 12 archivos de la spec; ajustes registrados en `decisions-FEAT-017b.md` (`assertRunDir`, `ANTHROPIC_API_KEY` vacía, `WEB_URL`/`SERVER_URL`).
- ✅ Block 2 — job `e2e` con los 6 pasos y los valores de upload de la spec; 9 `uses:` fijados por SHA.

## Tests
- ✅ test_e2e_alta_primer_admin_login_e_inicio
- ✅ test_e2e_config_levanta_server_y_web_en_modo_prueba
- ✅ test_e2e_config_solo_chromium_y_evidencia_en_falla
- ✅ test_layout_scripts_por_tipo
- ✅ test_layout_vitest_no_levanta_e2e
- ✅ test_e2e_base_fuera_de_tmp_rechazada
- ✅ test_e2e_reuso_de_server_existente_rechazado
- ✅ test_e2e_arranque_sin_respuesta_timeout_definido
- ✅ test_ci_cuatro_jobs_lint_unit_integration_e2e
- ✅ test_ci_cadena_needs
- ✅ test_ci_e2e_instala_chromium_y_corre_test_e2e
- ✅ test_ci_e2e_sube_evidencia_solo_en_falla
- ✅ test_ci_node_24_y_timeout_por_job
- ✅ test_ci_action_sin_sha_rechazada
- ✅ test_ci_if_que_saltea_cadena_rechazado
- ✅ test_ci_evidencia_mal_configurada_rechazada
- ✅ test_ci_instalacion_sin_no_install_rechazada
- ✅ Sad-path tests: `assertTempDatabasePath` (relativa, vacía, `data/`, prefijo sin separador, `..`, tmp mismo), `assertRunDir` (9 rutas rechazadas), `webServerProblems` (reuso, sin timeout, sin la clave) y las variantes del workflow (`if:`, evidencia, instalación sin bloqueo, SHA, secretos, permisos).

## Warnings (no bloquean)
- W-1 — el reporte general de cobertura no instrumenta `e2e/`; se midió aparte (arriba). Una rama de `webServerProblems` (línea 106) sin test.
- W-2 (W-VER-03) — dependencias frágiles aceptadas: puertos fijos 3000/5173 con `strictPort` (a propósito, para no tomar un server de desarrollo), variantes de `ci.test.ts` atadas a la indentación del YAML, regex sobre `playwright.config.ts` (deuda W-05 en decisions).
- W-3 — la evidencia de rojo-antes está en los resúmenes de `.daw-work/review-block-1.md` y `review-block-2.md` y en los reportes de los implementadores en la conversación; coincide con el código en disco.
- W-4 — en la ronda 2 del Block 1 una parte de `e2eConfig.test.ts` se escribió desde la shell, fuera del hook de escritura; registrado en la revisión del bloque y contenido revisado.
- W-5 — tests jsdom de la web con timeouts bajo carga alta de la máquina (procesos ajenos al repo); preexistente, el ticket no toca `web/`; repetidos, 471/471.

## Se confirma sobre el PR (CLOSEOUT)
- Los checks `lint`, `unit`, `integration` y `e2e` separados, con `e2e` después de `integration`, y el job `e2e` en verde en ubuntu-latest.
- La duración real del job `e2e` frente a `timeout-minutes: 10` (W-03 de decisions).
- Pendiente del usuario, fuera del código: sumar `e2e` a los checks exigidos del ruleset `proteger-main`.

Result: PASSED
