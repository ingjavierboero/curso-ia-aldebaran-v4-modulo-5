# Test run FEAT-017a

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (node 24.11.0) |
| Command | `npx vitest run --coverage --coverage.reporter=text-summary` (suite completa, los tres proyectos); además `npm run test:unit` y `npm run test:integration` por separado |
| Total | 735 |
| Passed | 735 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 98.17% |
| Branch coverage | 92.81% |
| Function coverage | 97.81% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

Por tipo: `npm run test:unit` corre 94 archivos y 461 tests (73 de `server-unit` y 21 de `web`), y
`npm run test:integration` corre 26 archivos y 274 tests. La suma, 120 archivos y 735 tests, es la
corrida completa de arriba. La cobertura es la de toda la suite sobre `server/src` y `web/src`; este
ticket no cambia código de producción.

## Comparación de nombres de tests contra `main` (NFR-06, AC-16)

Lista de `main` tomada antes de mover nada (`npx vitest list --json`, `archivo sin ruta > describe > it`):
679 nombres. Lista de la rama con el mismo comando: 698 nombres. `vitest list` reporta menos que
`vitest run` (735) porque no expande igual los tests parametrizados, y la diferencia ya existía en `main`;
se usó el mismo comando en los dos lados.

- **Sin cambios:** 676 nombres. Ninguno de los 98 archivos movidos perdió ni renombró un test.
- **Reescritos (FEAT-002 → FEAT-017a), 3:** `test_ci_orden_de_pasos` pasa a `test_ci_lint_corre_lint_y_typecheck`, `test_ci_unit_corre_test_unit` y `test_ci_integration_corre_test_integration`; `test_ci_node_24_y_timeout` pasa a `test_ci_node_24_y_timeout_por_job`; `test_ci_mock_mode_en_tests` pasa a `test_ci_mock_mode_global`.
- **Nuevos, 22:** los 9 de `testLayout.test.ts` y 13 en `ci.test.ts`. Los de `ci.test.ts` son 9 Required tests con nombre nuevo, `test_ci_continue_on_error_rechazado` y 3 casos parametrizados por job (`lint`, `unit`, `integration`). Los otros 5 Required tests del Block 2 conservan el nombre que ya tenían en FEAT-002: `test_ci_dispara_en_pull_request`, `test_ci_action_sin_sha_rechazada`, `test_ci_sin_secretos_rechazado`, `test_ci_permisos_escritura_rechazado` y `test_ci_pull_request_target_rechazado`.

A nivel archivo, `test_layout_mudanza_conserva_los_98_archivos` verifica que cada una de las 98 rutas de
`main` exista exactamente una vez bajo `unit/` o `integration/`.

## Failures
(none)

## Skips
(none)
