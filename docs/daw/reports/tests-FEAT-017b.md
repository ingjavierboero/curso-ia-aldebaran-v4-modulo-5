# Test run FEAT-017b

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (node 24.11.0) |
| Command | `npx vitest run --coverage --coverage.reporter=text-summary` (suite completa, los tres proyectos) |
| Total | 745 |
| Passed | 745 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 98.19% |
| Branch coverage | 92.87% |
| Function coverage | 97.83% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`, incluye `tsconfig.e2e.json`) — clean, 0 errors |

Por tipo: `npm run test:unit` corre 95 archivos y 471 tests, y `npm run test:integration` 26 archivos
y 274 tests; la suma es la corrida de arriba. Frente a FEAT-017a (735) hay 10 tests nuevos de Vitest:
5 en `e2eConfig.test.ts`, 1 en `testLayout.test.ts` (`test_layout_vitest_no_levanta_e2e`) y 4 en
`ci.test.ts` (`test_ci_e2e_instala_chromium_y_corre_test_e2e`, `test_ci_e2e_sube_evidencia_solo_en_falla`,
`test_ci_evidencia_mal_configurada_rechazada`, `test_ci_instalacion_sin_no_install_rechazada`).
`test_ci_tres_jobs_lint_unit_integration` se renombró a `test_ci_cuatro_jobs_lint_unit_integration_e2e`.

Prueba de punta a punta, corrida aparte con su runner (Playwright 1.65.1, Chromium):
`npm run test:e2e` — `test_e2e_alta_primer_admin_login_e_inicio` pasó (1 passed, 3.9 s incluido el
arranque); no quedó ningún directorio `aldebaran-e2e-*` en tmp. `npm test` no la corre (AC-14).

Una corrida previa con la máquina cargada (load average 111 por procesos ajenos al repo) dio 4 fallos
en tests jsdom de la web (`ClientsPage`, `ProductsPage`, `SettingsPage`) por tiempos de espera; es el
problema conocido de la web bajo carga, no relacionado con el ticket. La corrida registrada acá es la
repetición con la carga en 13.

## Failures
(none)

## Skips
(none)
