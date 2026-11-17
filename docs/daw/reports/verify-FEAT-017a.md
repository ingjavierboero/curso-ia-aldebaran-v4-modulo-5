# Verification FEAT-017a

| Field | Value |
|---|---|
| Module | `.github/workflows/ci.yml`, configs de Vitest, `server/test/unit/**`, `server/test/integration/**` |
| Line coverage | 98.17% |
| Branch coverage | 92.81% |
| Function coverage | 97.81% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean |

Ronda 1, 2026-11-17. Verificación cruzada independiente (daw-module-verifier), con corridas propias:
`npm run test:unit` 94 archivos / 461 tests, `npm run test:integration` 26 archivos / 274 tests, la
suite de `main` en un worktree temporal 119 archivos / 719 tests. La cobertura es la de toda la suite:
el ticket no tiene código de producción nuevo y los cuerpos de los tests no cambiaron, así que la
cobertura es por construcción la de `main`; el riesgo propio de la mudanza lo mide AC-16.

## Acceptance criteria
- ✅ AC-02 — `ci.yml`: `unit` con `needs: lint`, `integration` con `needs: unit`, sin `if:` ni la clave que ignora el resultado de un paso (vetada por el test extra de Block 2, ver abajo); `test_ci_cadena_needs`, `test_ci_tres_jobs_lint_unit_integration`, `test_ci_if_que_saltea_cadena_rechazado`. La ejecución real se confirma sobre el PR en CLOSEOUT.
- ✅ AC-03 — el job `lint` corre `npm ci`, `npm run lint` y `npm run typecheck`; `test_ci_lint_corre_lint_y_typecheck`.
- ✅ AC-04 — 73 archivos en `server/test/unit/` y 26 en `server/test/integration/`; `test_layout_todo_test_en_unit_o_integration`, `test_layout_unit_sin_base_ni_http` (también exige que cada test de integración toque base, HTTP o red).
- ✅ AC-05 — el job `unit` corre solo `npm run test:unit` y nada pisa su resultado; `test_ci_unit_corre_test_unit` y el test extra de Block 2.
- ✅ AC-06 — `include` de `server-unit` disjunto con el de integración; `test_layout_proyectos_disjuntos_y_no_vacios`, `test_ci_unit_corre_test_unit`.
- ✅ AC-07 — el job `integration` corre solo `npm run test:integration`; `test_ci_integration_corre_test_integration` y el test extra de Block 2.
- ✅ AC-08 — `include` de `server-integration` disjunto; `test_layout_proyectos_disjuntos_y_no_vacios`, `test_ci_integration_corre_test_integration`.
- ✅ AC-13 — scripts `test:unit` y `test:integration` en `package.json` y en `AGENTS.md`; `test_layout_scripts_por_tipo`, y los dos comandos se corrieron.
- ✅ AC-15 — `env: MOCK_MODE: "true"` global, una sola vez; sin `secrets`, `github.token`, `ANTHROPIC` ni `API_KEY`; `test_ci_mock_mode_global`, `test_ci_sin_secretos_rechazado`, `test_ci_dispara_en_pull_request`.
- ✅ AC-16 — comparación de nombres completos con `vitest run --reporter=json` en `main` y en la rama: 716 sin cambios, 3 reescritos declarados (`test_ci_orden_de_pasos`, `test_ci_node_24_y_timeout`, `test_ci_mock_mode_en_tests`), 19 nuevos (9 en `testLayout.test.ts`, 10 en `ci.test.ts`); 719 − 3 + 19 = 735; a nivel archivo, `test_layout_mudanza_conserva_los_98_archivos`.

## Spec blocks
- ✅ Block 1 — todos los archivos de la spec presentes (mudanza, configs, `server/tsconfig.json`, `.oxlintrc.json`, scripts, `AGENTS.md`, lista previa); evidencia TDD 9/9 en rojo antes de implementar.
- ✅ Block 2 — workflow en tres jobs con las garantías de FEAT-002; evidencia TDD reproducida: 13 de 15 en rojo contra el `ci.yml` de `main` (los 2 verdes fijan garantías que ya se cumplían). Test extra fuera de la spec, registrado en `decisions-FEAT-017a.md`: el que veta `continue-on-error` a nivel job y paso (refuerza los criterios de la cadena y de las etapas unit e integration).

## Tests
- ✅ test_layout_todo_test_en_unit_o_integration
- ✅ test_layout_unit_sin_base_ni_http
- ✅ test_layout_proyectos_disjuntos_y_no_vacios
- ✅ test_layout_scripts_por_tipo
- ✅ test_layout_test_fuera_de_carpeta_rechazado
- ✅ test_layout_import_prohibido_en_unit_rechazado
- ✅ test_layout_proyecto_vacio_rechazado
- ✅ test_layout_mudanza_conserva_los_98_archivos
- ✅ test_layout_archivo_previo_faltante_rechazado
- ✅ test_ci_dispara_en_pull_request
- ✅ test_ci_tres_jobs_lint_unit_integration
- ✅ test_ci_cadena_needs
- ✅ test_ci_lint_corre_lint_y_typecheck
- ✅ test_ci_unit_corre_test_unit
- ✅ test_ci_integration_corre_test_integration
- ✅ test_ci_mock_mode_global
- ✅ test_ci_node_24_y_timeout_por_job
- ✅ test_ci_if_que_saltea_cadena_rechazado
- ✅ test_ci_action_sin_sha_rechazada
- ✅ test_ci_sin_secretos_rechazado
- ✅ test_ci_permisos_escritura_rechazado
- ✅ test_ci_pull_request_target_rechazado
- ✅ test_ci_checkout_sin_persist_credentials_rechazado
- ✅ Sad-path tests: Block 1 tiene 4 (fuera de carpeta, import vetado, proyecto vacío o doble, archivo previo faltante) y Block 2 tiene 7 (`if:`, `continue-on-error`, action sin SHA, secretos, permisos, `pull_request_target`, `persist-credentials`), cada uno sobre una variante que de verdad cambia la entrada.

## Warnings (no bloquean)
- W-01 (W-VER-03) — `test_ci_action_sin_sha_rechazada` exige exactamente 6 `uses:`; FEAT-017b, al sumar acciones, tiene que actualizar ese número. Registrado en `decisions-FEAT-017a.md`.
- W-02 (W-VER-03) — la lista fija de 98 archivos queda como restricción permanente; borrar o renombrar uno obliga a actualizarla en el mismo commit. Registrado en `decisions-FEAT-017a.md`.
- W-03 — `docs/daw/reports/tests-FEAT-017a.md` cuenta 22 nuevos con 3 "casos parametrizados por job" que no existen: son un artefacto de `vitest list`. Los números de `vitest run` son los de AC-16 arriba (19 nuevos, 3 reescritos, 716 sin cambios). La conclusión, 0 tests perdidos, no cambia.
- W-04 — `forbiddenInUnit` no sigue imports hacia `server/src/`; límite ya asumido en ADR-010.

## No verificable localmente (se confirma en CLOSEOUT, sobre el PR)
- Que el PR muestre los checks `lint`, `unit` e `integration`, y que una etapa roja frene las siguientes.
- NFR-05 en el runner (localmente unit tarda ~8 s e integration ~2 s; `timeout-minutes: 10` está fijado por test).

Result: PASSED
