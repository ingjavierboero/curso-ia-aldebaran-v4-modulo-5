# Spec FEAT-017a: Tests separados en unit e integration, y CI en lint → unit → integration

| Field | Value |
|-------|-------|
| Ticket | FEAT-017a |
| PRD | docs/daw/prd/prd-FEAT-017a.md |
| Tier | FEATURE |
| Date | 2026-11-17 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Los 98 tests de `server/test/` se mueven con `git mv` a `server/test/unit/` (72) o
`server/test/integration/` (26) según lo que tocan (D-02), conservando la subcarpeta de capa. Vitest
pasa de un proyecto `server` a dos (`server-unit`, `server-integration`), cada uno con su archivo de
config, más `web` sin cambios; `package.json` declara `test:unit` y `test:integration`. Un test nuevo
(`testLayout.test.ts`) fija la regla de carpetas y que los proyectos no se pisen ni queden vacíos.
El workflow pasa de un job `ci` a tres jobs encadenados con `needs:` (lint → unit → integration),
conservando las garantías de FEAT-002, y `ci.test.ts` se reescribe para fijarlas en cada job.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 2 |
| FR-02 | Block 2 |
| FR-03 | Block 1 |
| FR-04 | Block 1, Block 2 |
| FR-05 | Block 1, Block 2 |
| FR-06 | Block 1 |
| NFR-01 | Strategy: el workflow no referencia `secrets.*`, `github.token`, `ANTHROPIC` ni `API_KEY`; lo verifica `test_ci_sin_secretos_rechazado` |
| NFR-02 | Strategy: `env: MOCK_MODE: "true"` a nivel workflow (aplica a los tres jobs) y sin claves del proveedor; lo verifican `test_ci_mock_mode_global` y `test_ci_sin_secretos_rechazado` |
| NFR-03 | Strategy: `node-version: 24` en el `setup-node` de cada job; lo verifica `test_ci_node_24_y_timeout_por_job` |
| NFR-04 | Strategy: `permissions: contents: read` global y ningún job con `permissions` propias; lo verifica `test_ci_permisos_escritura_rechazado` |
| NFR-05 | Strategy: `timeout-minutes: 10` en cada job; lo verifica `test_ci_node_24_y_timeout_por_job` |
| NFR-06 | Strategy: la lista de nombres completos de tests (`archivo sin ruta > describe > it`) de `main` y de la rama se compara en CODE y la diferencia (debe ser exactamente los tests nuevos de este ticket) queda en `docs/daw/reports/tests-FEAT-017a.md` |

## Dependencies between blocks
Block 2 depends on Block 1: los jobs llaman a `npm run test:unit` y `npm run test:integration`, que
Block 1 crea, y `ci.test.ts` se reescribe en su ubicación nueva (`server/test/unit/tooling/`).
Orden: Block 1 → Block 2.

## Block 1 — Mudanza de los tests y proyectos de Vitest por tipo

**Files**
- `server/test/unit/**` (moved) — 72 archivos: `domain/*` (24), `application/*` salvo las dos carreras (30, con sus subcarpetas `client/`, `product/`, `settings/`, `user/`), `http/parsePort.test.ts`, `http/sessionCookie.test.ts`, `infrastructure/` (AttemptTracker, createEmailSender, emailConfig, healthEventLog, parseIsoDate, passwordResetLog, RedirectingEmailSender, resolve-database-path, SmtpEmailSender, systemAdapters, UnconfiguredEmailSender), `support/InMemoryUnitOfWork.test.ts`, `support/responseBody.test.ts`, `tooling/{ci,dependabot,lint}.test.ts` y `tooling/fixtures/`.
- `server/test/integration/**` (moved) — 26 archivos: `application/{clientRace,passwordResetRace}.test.ts`; `http/{app,auth,clients,health,middleware,passwordReset,products,settings,setup,users}.test.ts`; `infrastructure/{Argon2PasswordHasher,attemptGate,DrizzleJobRunRepository,DrizzleSessionRepository,DrizzleUnitOfWork,DrizzleUserRepository,migrate,SqliteDatabaseProbe}.test.ts`; `support/{ClientProductRepository,ClientRepository,JobRunRepository,PasswordResetTokenRepository,ProductRepository,SettingsRepository}.contract.test.ts`.
- `server/test/support/*.ts` (unchanged) — los helpers (no `.test.ts`) se quedan; `unit/support/` e `integration/support/` contienen solo tests de esos helpers.
- Cada archivo movido (modified) — imports relativos con un nivel más: `'../../src/` → `'../../../src/`, `'../support/` → `'../../support/`, `'../../support/` (subcarpetas de application) → `'../../../support/`; los tests que estaban en `support/` y usaban `'./X.js'` pasan a `'../../support/X.js'`; el `import()` dinámico de `domain/Authorization.test.ts:63` gana un nivel; los `new URL(..., import.meta.url)` de `tooling/{ci,dependabot,lint}.test.ts`, `infrastructure/migrate.test.ts` y `infrastructure/resolve-database-path.test.ts` ganan un `'../'`.
- `server/test/unit/tooling/lint.test.ts` (modified) — `fixtureRelative` → `server/test/unit/tooling/fixtures/floating-promise.ts`; en `sourceSamples`, `server/test/domain/Email.test.ts` → `server/test/unit/domain/Email.test.ts` y `server/vitest.config.ts` → `server/vitest.unit.config.ts` y `server/vitest.integration.config.ts`.
- `server/test/unit/tooling/fixtures/floating-promise.ts` (modified) — el comentario que nombra `test/tooling/lint.test.ts` pasa a la ruta nueva.
- `server/test/unit/tooling/testLayout.test.ts` (new) — fija la regla de carpetas y los proyectos de Vitest.
- `server/vitest.config.ts` (deleted) — reemplazado por los dos siguientes.
- `server/vitest.unit.config.ts` (new) — `name: 'server-unit'`, `environment: 'node'`, `include: ['test/unit/**/*.test.ts']`.
- `server/vitest.integration.config.ts` (new) — `name: 'server-integration'`, `environment: 'node'`, `include: ['test/integration/**/*.test.ts']`.
- `vitest.config.ts` (modified) — `projects: ['server/vitest.unit.config.ts', 'server/vitest.integration.config.ts', 'web']`.
- `server/tsconfig.json` (modified) — `include`: `vitest.config.ts` → `vitest.unit.config.ts`, `vitest.integration.config.ts` (F-01 del arch-auditor: los configs siguen dentro del typecheck y del lint con tipos).
- `.oxlintrc.json` (modified) — `ignorePatterns`: `server/test/tooling/fixtures/**` → `server/test/unit/tooling/fixtures/**`.
- `package.json` (modified) — scripts `"test:unit": "vitest run --project server-unit --project web"` y `"test:integration": "vitest run --project server-integration"`; `"test": "vitest run"` sin cambios (corre los tres proyectos).
- `server/package.json` (modified) — `"test": "vitest run --config vitest.unit.config.ts && vitest run --config vitest.integration.config.ts"` (W-06: sin `server/vitest.config.ts`, un `vitest run` a secas correría sin nombre ni entorno).
- `AGENTS.md` (modified) — en Stack, debajo de `Test:`: `- Test unit: npm run test:unit` y `- Test integration: npm run test:integration`.

**Logic**
Implements FR-03 (criterio por lo que toca, D-02), FR-04 y FR-05 (proyectos con `include` disjuntos)
y FR-06 (scripts por tipo). El criterio de integración es: el test, directa o indirectamente, importa
`sqliteTestDb`, `better-sqlite3`, `supertest`, `testApp`, `httpSession`, `node:net`, `node:http` o
`express`, o llama a `createDb(` o `createApp(`. `authContext`, `catalogContext`, `settingsContext` y
`passwordResetContext` usan solo dobles en memoria y no cuentan. `resolve-database-path.test.ts`
importa `resolveDatabasePath` de `client.js` sin abrir la base: por eso se veta la llamada
`createDb(` y no el módulo.

`testLayout.test.ts` expone cuatro funciones puras que reciben datos y devuelven la lista de problemas
(así los casos inválidos se prueban con entradas sintéticas): `outsideLayout(paths)`,
`forbiddenInUnit(path, source)`, `projectCoverage(paths, includes)` y
`missingAfterMove(before, after)`. La lista previa se guarda en
`server/test/unit/tooling/fixtures/test-files-before-FEAT-017a.txt` (new), generada desde `main`
antes de mover nada; fija la mudanza a nivel archivo, y la comparación de nombres de tests del
reporte (NFR-06) la completa a nivel test. Los tests reales las aplican
a los archivos de `server/test/` (recorridos con `readdirSync` recursivo) y a los `include` leídos de
los dos configs importados; `projectCoverage` usa `path.posix.matchesGlob`, como `lint.test.ts`, y
exige que cada `.test.ts` matchee exactamente un proyecto y que cada proyecto matchee al menos uno
(con `passWithNoTests: true` en la raíz, un glob vacío saldría en verde: W-07).

La mudanza se hace con `git mv` para conservar el historial, y no cambia el cuerpo de ningún test.

**Data model**
- Sin schema de base de datos ni migraciones. Los tests de integración siguen creando su SQLite con `createTestDb` (memoria) o en un directorio de `mkdtemp`, igual que hoy.
- Config de cada proyecto de Vitest: `name` (string, NOT NULL, único entre los tres proyectos: `server-unit`, `server-integration`, `web`), `environment` (NOT NULL, `node`), `include` (lista NOT NULL, no vacía, disjunta con la del otro proyecto del server).
- `server/test/unit/tooling/fixtures/test-files-before-FEAT-017a.txt`: una ruta relativa a `server/test/` por línea (NOT NULL, única), las 98 de `main` antes de la mudanza.
- Rollback: revert de los commits del bloque; no hay datos que revertir.

**Input validation**
- Sin entradas de usuario: el bloque solo lee archivos del propio repositorio por rutas fijas.

**Error handling**
- Un `.test.ts` de `server/test/` fuera de `unit/` y de `integration/` — `testLayout.test.ts` falla nombrando el archivo.
- Un test de `unit/` importa un módulo vetado o llama a `createDb(`/`createApp(` — falla nombrando el archivo y el token encontrado.
- Un `include` que no matchea ningún archivo, o un test que matchea cero o dos proyectos — falla nombrando el proyecto o el archivo.
- Un archivo de la lista previa a la mudanza que no aparece ni en `unit/` ni en `integration/` (con la misma subruta) — falla nombrando el archivo faltante.

**Required tests**
- [ ] test_layout_todo_test_en_unit_o_integration — cada `.test.ts` de `server/test/` está bajo `unit/` o `integration/` — validates AC-04
- [ ] test_layout_unit_sin_base_ni_http — ningún archivo de `unit/` importa módulos vetados ni llama a `createDb(`/`createApp(` — validates AC-04
- [ ] test_layout_proyectos_disjuntos_y_no_vacios — cada test matchea exactamente un proyecto (`server-unit` o `server-integration`) y cada proyecto al menos uno — validates AC-06, AC-08
- [ ] test_layout_scripts_por_tipo — `test:unit` corre `--project server-unit --project web`, `test:integration` corre `--project server-integration` y `test` corre `vitest run` — validates AC-13
- [ ] test_layout_test_fuera_de_carpeta_rechazado — `outsideLayout` con una ruta `server/test/domain/X.test.ts` la reporta (sad path)
- [ ] test_layout_import_prohibido_en_unit_rechazado — `forbiddenInUnit` con un fuente que importa `sqliteTestDb` y otro que llama a `createApp(` reporta los dos tokens (sad path)
- [ ] test_layout_proyecto_vacio_rechazado — `projectCoverage` con un `include` que no matchea nada y un archivo que matchea dos proyectos reporta ambos (sad path)
- [ ] test_layout_mudanza_conserva_los_98_archivos — cada ruta de `test-files-before-FEAT-017a.txt` existe exactamente una vez como `unit/<ruta>` o `integration/<ruta>` (los tests que estaban en `support/` conservan esa subcarpeta) — validates AC-16
- [ ] test_layout_archivo_previo_faltante_rechazado — `missingAfterMove` con una lista previa que incluye una ruta inexistente la reporta como faltante (sad path)

**Completion criterion**
Los 9 tests pasan; `npm run test:unit` corre 72 archivos del server más los de la web y
`npm run test:integration` corre 26; `npm test` corre la suma; `npm run lint` y `npm run typecheck`
terminan sin errores; la comparación de nombres de tests contra `main` da como única diferencia los
tests nuevos de este ticket.

## Block 2 — Workflow en tres jobs encadenados

**Files**
- `.github/workflows/ci.yml` (modified) — tres jobs en lugar de `ci`.
- `server/test/unit/tooling/ci.test.ts` (modified) — reescrito para la forma nueva; el lector mínimo de YAML por indentación se conserva, y los helpers que hoy leen solo `jobs.ci` o el primer step pasan a recorrer todos los jobs.

**Logic**
Implements FR-01 y FR-02, y conecta FR-04/FR-05 con el CI. El workflow conserva `name: CI`,
`on: pull_request`, `permissions: contents: read`, `concurrency` (grupo por PR con
`cancel-in-progress: true`) y agrega `env: MOCK_MODE: "true"` a nivel workflow (W-02). Jobs:
- `lint` (`name: lint`): checkout, setup-node, `npm ci`, `npm run lint`, `npm run typecheck`.
- `unit` (`name: unit`, `needs: lint`): checkout, setup-node, `npm ci`, `npm run test:unit`.
- `integration` (`name: integration`, `needs: unit`): checkout, setup-node, `npm ci`, `npm run test:integration`.

Cada job: `runs-on: ubuntu-latest`, `timeout-minutes: 10`, `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
con `persist-credentials: false`, `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`
con `node-version: 24` y `cache: npm`. Ningún job declara `if:` ni `permissions`. Un test que falla
hace que `vitest run` salga con código distinto de 0, el step falla y el job también (AC-05, AC-07).
Ningún job corre `npm test` ni `vitest run` a secas.

**Data model**
- Sin schema de base de datos. El archivo sigue el esquema de GitHub Actions: `jobs.<id>.needs` (string o lista de ids existentes), `jobs.<id>.timeout-minutes` (entero), `steps[].uses` con SHA de 40 caracteres hex.
- Rollback: revert del commit del bloque vuelve al job único `ci`; no hay estado que revertir.

**Input validation**
- Sin entradas de usuario: `ci.test.ts` lee `.github/workflows/ci.yml` por ruta fija relativa a `import.meta.url`.

**Error handling**
- Un job con `if:` que saltea la cadena (`always()`, `failure()`, `!cancelled()`) — el test falla nombrando el job.
- Una `uses:` sin SHA de 40 caracteres en cualquier job — falla nombrando la línea.
- Una referencia a `secrets.`, `github.token`, `ANTHROPIC` o `API_KEY` — falla nombrando el token.
- Permisos de escritura, a nivel workflow o un bloque `permissions` en un job — falla.
- Disparador `pull_request_target` — falla.
- Un checkout sin `persist-credentials: false` en cualquier job — falla nombrando el job.

**Required tests**
- [ ] test_ci_dispara_en_pull_request — `on: pull_request` y nada más — validates AC-15
- [ ] test_ci_tres_jobs_lint_unit_integration — los ids de jobs son exactamente `lint`, `unit`, `integration`, con esos `name` — validates AC-02
- [ ] test_ci_cadena_needs — `unit` tiene `needs: lint` e `integration` tiene `needs: unit` — validates AC-02
- [ ] test_ci_lint_corre_lint_y_typecheck — el job `lint` corre `npm ci`, `npm run lint` y `npm run typecheck` — validates AC-03
- [ ] test_ci_unit_corre_test_unit — el job `unit` corre `npm run test:unit` y ningún otro comando de tests — validates AC-05, AC-06
- [ ] test_ci_integration_corre_test_integration — el job `integration` corre `npm run test:integration` y ningún otro comando de tests — validates AC-07, AC-08
- [ ] test_ci_mock_mode_global — `env.MOCK_MODE` es `"true"` a nivel workflow — validates AC-15
- [ ] test_ci_node_24_y_timeout_por_job — cada job tiene `timeout-minutes: 10` y `node-version: 24`
- [ ] test_ci_if_que_saltea_cadena_rechazado — un workflow con `if: always()` en `integration` es rechazado (sad path)
- [ ] test_ci_action_sin_sha_rechazada — una `uses:` con etiqueta en el tercer job es rechazada (sad path)
- [ ] test_ci_sin_secretos_rechazado — `secrets.X`, `github.token`, `ANTHROPIC_API_KEY` y `API_KEY` en cualquier parte del workflow son rechazados — validates AC-15 (sad path)
- [ ] test_ci_permisos_escritura_rechazado — `contents: write` global o un `permissions` en un job son rechazados (sad path)
- [ ] test_ci_pull_request_target_rechazado — el disparador `pull_request_target` es rechazado (sad path)
- [ ] test_ci_checkout_sin_persist_credentials_rechazado — un checkout del job `unit` sin `persist-credentials: false` es rechazado (sad path)

**Completion criterion**
Los 14 tests pasan, `ci.yml` tiene los tres jobs con la cadena `needs:`, y la suite completa, el lint
y el typecheck siguen en verde. La corrida del PR muestra los checks `lint`, `unit` e `integration`
(se confirma en CLOSEOUT, sobre el PR).

## Final verification
`validate_spec.py --tier FEATURE` pasa sobre este documento; `npm run lint`, `npm run typecheck`,
`npm run test:unit`, `npm run test:integration` y `npm test` terminan en verde; los 23 tests nuevos
o reescritos pasan; el reporte de tests registra la comparación de nombres contra `main` (AC-16).
