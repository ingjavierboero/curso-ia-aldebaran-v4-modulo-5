# Spec FEAT-017b: Etapa e2e en el CI con Playwright y prueba de humo de inicio de sesión

| Field | Value |
|-------|-------|
| Ticket | FEAT-017b |
| PRD | docs/daw/prd/prd-FEAT-017b.md |
| Tier | FEATURE |
| Date | 2026-11-17 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Se suma `@playwright/test` 1.65.1 (exacta) y una carpeta `e2e/` en la raíz con la prueba de humo
`smoke.e2e.ts`: alta del primer Admin, inicio de sesión y pantalla de inicio. Los valores de la config
viven en un módulo de datos puros, `e2e/e2eSettings.ts`, sin imports de Playwright, que
`playwright.config.ts` consume y que los tests de tooling (Vitest, `server-unit`) pueden importar sin
efectos. La config levanta el server con `NODE_ENV=test` y `MOCK_MODE=true` sobre una base nueva en
un directorio temporal, y la web con `vite build` + `vite preview`. Falla cerrada si la base no queda
bajo `os.tmpdir()`. El CI suma un cuarto job, `e2e` (`needs: integration`), que instala Chromium,
corre `npm run test:e2e` y, solo si falla, sube capturas y trazas por 7 días. Decisiones en ADR-011.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 2 |
| FR-02 | Block 1 |
| FR-03 | Block 1, Block 2 |
| FR-04 | Block 1, Block 2 |
| FR-05 | Block 1 |
| NFR-01 | Strategy: credenciales del Admin de prueba generadas con `randomUUID` en cada corrida; el server recibe `GMAIL_USER`, `GMAIL_APP_PASSWORD` y `EMAIL_REDIRECT_TO` vacíos; el job no referencia secretos (lo sigue verificando `test_ci_sin_secretos_rechazado`) |
| NFR-02 | Strategy: el server de la prueba recibe `MOCK_MODE=true` y ninguna clave del proveedor del modelo; `MOCK_MODE` global del workflow, una sola vez; lo verifican `test_e2e_config_levanta_server_y_web_en_modo_prueba` y `test_ci_mock_mode_global` |
| NFR-03 | Strategy: `timeout-minutes: 10` en el job, `globalTimeout` de 6 minutos y `timeout` de 120 s por servidor en Playwright; lo verifican `test_ci_node_24_y_timeout_por_job` y `test_e2e_config_solo_chromium_y_evidencia_en_falla` |
| NFR-04 | Strategy: `retention-days: 7` en el paso de upload; lo verifica `test_ci_e2e_sube_evidencia_solo_en_falla` |
| NFR-05 | Strategy: `permissions: contents: read` global y ningún `permissions` en el job `e2e`; lo sigue verificando `test_ci_permisos_escritura_rechazado` |

## Dependencies between blocks
Block 2 depends on Block 1: el job corre `npm run test:e2e` y su paso de upload apunta al
`outputDir` que define `e2e/e2eSettings.ts`. Orden: Block 1 → Block 2.

## Block 1 — Playwright, prueba de humo y config fail-closed

**Files**
- `package.json` (modified) — devDependency `"@playwright/test": "1.65.1"` (exacta) y script `"test:e2e": "playwright test"`; `"test"` sigue siendo `"vitest run"`.
- `package-lock.json` (modified) — resolución de `@playwright/test` y `playwright` 1.65.1.
- `e2e/e2eSettings.ts` (new) — datos puros y validaciones, sin imports de Playwright:
  - `E2E_OUTPUT_DIR = 'test-results/e2e'`, `SERVER_PORT = 3000`, `WEB_PORT = 5173`, `WEB_SERVER_TIMEOUT_MS = 120_000`, `GLOBAL_TIMEOUT_MS = 360_000`.
  - `assertTempDatabasePath(path, tmpRoot)`: lanza `Error` si `path` no es absoluta o no queda dentro de `tmpRoot`.
  - `serverEnv(databasePath)`: `{ NODE_ENV: 'test', PORT: '3000', DATABASE_PATH, APP_URL: 'http://localhost:5173', MOCK_MODE: 'true', GMAIL_USER: '', GMAIL_APP_PASSWORD: '', EMAIL_REDIRECT_TO: '' }`.
  - `webServers(databasePath)`: las dos entradas de `webServer` como objetos planos:
    - server: `command: 'npm exec --no -- tsx src/main.ts'`, `cwd: 'server'`, `url: 'http://localhost:3000/api/health'`, `env: serverEnv(...)`.
    - web: `command: 'npm run build -w web && npm run preview -w web -- --port 5173 --strictPort'`, `url: 'http://localhost:5173'`.
    - Las dos con `reuseExistingServer: false` y `timeout: WEB_SERVER_TIMEOUT_MS`.
  - `webServerProblems(entries)`: lista de problemas si alguna entrada tiene `reuseExistingServer` distinto de `false` o no tiene `timeout`.
- `playwright.config.ts` (new) — `testDir: 'e2e'`, `testMatch: '**/*.e2e.ts'`, un solo proyecto `chromium` (`devices['Desktop Chrome']`), `use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' }`, `outputDir: E2E_OUTPUT_DIR`, `retries: 0`, `workers: 1`, `forbidOnly: !!process.env.CI`, `globalTimeout: GLOBAL_TIMEOUT_MS`, `globalTeardown: './e2e/globalTeardown.ts'`. La base: `process.env.E2E_RUN_DIR ??= mkdtempSync(join(tmpdir(), 'aldebaran-e2e-'))` (los workers heredan la variable, así que el directorio se crea una sola vez por corrida), `databasePath = join(E2E_RUN_DIR, 'aldebaran-e2e.db')`, `assertTempDatabasePath(databasePath, tmpdir())` y `webServerProblems(...)` vacío antes de exportar la config (fail closed).
- `e2e/globalTeardown.ts` (new) — borra `E2E_RUN_DIR` (`rmSync` recursivo) solo si `assertTempDatabasePath` lo acepta.
- `e2e/smoke.e2e.ts` (new) — la prueba de humo.
- `tsconfig.e2e.json` (new) — `composite`, `module`/`moduleResolution` como `tsconfig.base.json`, `types: ["node"]`, `include: ["e2e/**/*.ts", "playwright.config.ts"]`.
- `tsconfig.json` (modified) — suma `{ "path": "./tsconfig.e2e.json" }` a `references`.
- `.gitignore` (modified) — `test-results/` y `playwright-report/` bajo "Salida de los tests".
- `AGENTS.md` (modified) — en Stack, debajo de `Test integration:`: `- Test e2e: npm run test:e2e (la primera vez: npx playwright install chromium)`.
- `server/test/unit/tooling/e2eConfig.test.ts` (new) — tests de la config; importa `e2e/e2eSettings.ts` con `import()` dinámico por URL (sin import estático, por el `rootDir` de `server/tsconfig.json`) y lee `playwright.config.ts` como texto.
- `server/test/unit/tooling/testLayout.test.ts` (modified) — `test_layout_scripts_por_tipo` exige además `test:e2e` = `playwright test`, y el test nuevo de abajo.
- `server/test/unit/tooling/lint.test.ts` (modified) — `sourceSamples` suma `playwright.config.ts` y `e2e/smoke.e2e.ts`, para que ningún `ignorePattern` los saque del lint con tipos.

**Logic**
Implements FR-02 (la prueba), FR-03 y FR-04 del lado de la config, y FR-05. Decisión registrada: la
carpeta es `e2e/` en la raíz y no `tests/e2e/` (sección "(adapt)" de `testing.instructions.md`): el
repo no tiene carpeta `tests/` y cada tipo vive donde corre su runner (ADR-010, ADR-011).

La prueba `test_e2e_alta_primer_admin_login_e_inicio`:
1. Genera `name = 'Admin E2E'`, `email = e2e-<uuid>@example.com` y `password = <uuid>` (36 caracteres, cumple el mínimo de 8).
2. `page.goto('/')` y espera `heading` "Registrar el primer Admin" (`/` → `/login` → `/setup`).
3. Completa `getByLabel('Nombre')`, `getByLabel('Email')` y `getByLabel('Contraseña', { exact: true })`, y hace click en `getByRole('button', { name: 'Crear Admin' })`.
4. `await expect(page).toHaveURL(/\/login$/)` y espera el aviso "Admin creado. Ya podés iniciar sesión.".
5. Completa email y contraseña del login y hace click en `getByRole('button', { name: 'Ingresar' })`.
6. `await expect(page.getByRole('heading', { name: 'Hola, Admin E2E' })).toBeVisible()`.

**Data model**
- Sin cambios de schema. La prueba usa la base que el server crea y migra en `DATABASE_PATH` (NOT NULL, ruta absoluta bajo `os.tmpdir()`, única por corrida); la tabla `users` existente con sus restricciones (email UNIQUE sin distinguir mayúsculas, NOT NULL en nombre, email y hash).
- Rollback: revert del commit; borrar `test-results/` si quedó.

**Input validation**
- `databasePath`: string NOT NULL, absoluta, con prefijo `tmpdir()` + separador; cualquier otra cosa lanza antes de levantar servidores.
- Entradas de `webServer`: `reuseExistingServer` exactamente `false` y `timeout` numérico.

**Error handling**
- Ruta de base relativa, vacía o fuera de `os.tmpdir()` — `assertTempDatabasePath` lanza nombrando la ruta, la config no se carga y no arranca ningún servidor.
- Una entrada de `webServer` con `reuseExistingServer` distinto de `false` o sin `timeout` — `webServerProblems` la reporta y la config lanza.
- Server o web que no responden en 120 s, o un puerto ocupado — Playwright aborta la corrida con el error de `webServer`, sin correr la prueba.

**Required tests**
- [ ] test_e2e_alta_primer_admin_login_e_inicio — en `e2e/smoke.e2e.ts`: alta del primer Admin, login y "Hola, Admin E2E" — validates AC-09
- [ ] test_e2e_config_levanta_server_y_web_en_modo_prueba — `webServers()` devuelve server y web, el server con `NODE_ENV=test`, `MOCK_MODE=true`, credenciales de email vacías y `DATABASE_PATH` recibido, ambos con `reuseExistingServer: false` — validates AC-10
- [ ] test_e2e_config_solo_chromium_y_evidencia_en_falla — `playwright.config.ts` declara un solo proyecto `chromium`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `outputDir: E2E_OUTPUT_DIR`, `globalTimeout` y `forbidOnly` — validates AC-11, AC-12
- [ ] test_layout_scripts_por_tipo — además de lo de FEAT-017a, `test:e2e` es `playwright test` y `test` sigue siendo `vitest run` — validates AC-14
- [ ] test_layout_vitest_no_levanta_e2e — ningún `include` de los tres proyectos de Vitest matchea `e2e/smoke.e2e.ts` — validates AC-14
- [ ] test_e2e_base_fuera_de_tmp_rechazada — `assertTempDatabasePath` lanza con una ruta relativa, con `''` y con `<raíz>/data/aldebaran.db` (sad path)
- [ ] test_e2e_reuso_de_server_existente_rechazado — `webServerProblems` reporta una entrada con `reuseExistingServer: true` y otra sin `timeout` (sad path)
- [ ] test_e2e_arranque_sin_respuesta_timeout_definido — cada entrada de `webServers()` tiene `timeout` 120000 y la config un `globalTimeout` de 360000, así un servidor que no responde corta la corrida (sad path)

**Completion criterion**
Los 8 tests pasan (los 7 de Vitest con `npm run test:unit`, la prueba e2e con `npm run test:e2e`
local, con Chromium instalado); `npm run lint` y `npm run typecheck` en verde, con
`playwright.config.ts` y `e2e/` incluidos; `npm test` no corre la prueba e2e; después de la corrida
no queda el directorio temporal.

## Block 2 — Job e2e en el CI

**Files**
- `.github/workflows/ci.yml` (modified) — job `e2e`.
- `server/test/unit/tooling/ci.test.ts` (modified) — cuatro jobs, la excepción estricta de `if:` y los tests de la etapa.

**Logic**
Implements FR-01, FR-03 y FR-04 en el CI. Job `e2e` (`name: e2e`, `runs-on: ubuntu-latest`,
`needs: integration`, `timeout-minutes: 10`), con pasos:
1. checkout (mismo SHA, `persist-credentials: false`);
2. setup-node (mismo SHA, `node-version: 24`, `cache: npm`);
3. `npm ci`;
4. `npx --no-install playwright install --with-deps chromium`;
5. `npm run test:e2e`;
6. `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2` con `if: failure()`, `name: e2e-evidencia`, `path: test-results/e2e/`, `retention-days: 7`, `if-no-files-found: error`.

Los comentarios del job no usan las palabras que `ci.test.ts` veta en el texto crudo. `MOCK_MODE`
sigue declarado una sola vez, a nivel workflow.

En `ci.test.ts`:
- `JOBS` pasa a `lint`, `unit`, `integration`, `e2e`; el conteo de `uses:` pasa de 6 a 9.
- `testCommands(e2e)` es exactamente `['npm run test:e2e']`: el paso `playwright install` se trata como instalación y no como comando de test.
- `skipChainProblems` acepta un único `if:` de paso: valor exactamente `failure()`, en el job `e2e`, en un paso cuyo `uses` empieza con `actions/upload-artifact@`. Cualquier otro `if:` de paso con `failure()`, `always()` o `cancelled()` se rechaza como antes.

**Data model**
- Sin schema de base de datos. Esquema de GitHub Actions: `jobs.e2e.needs` (string NOT NULL, `integration`), `steps[].with.retention-days` (entero, 7), `steps[].with.path` (string NOT NULL, igual a `E2E_OUTPUT_DIR` + `/`), `steps[].with.if-no-files-found` (uno de `warn`/`error`/`ignore`; acá `error`).
- Rollback: revert del commit vuelve a los tres jobs de FEAT-017a; también hay que sacar `e2e` del ruleset `proteger-main` si ya se agregó.

**Input validation**
- Sin entradas de usuario: `ci.test.ts` lee `ci.yml` por ruta fija; `E2E_OUTPUT_DIR` se importa de `e2e/e2eSettings.ts` por URL.

**Error handling**
- Un `if:` de paso distinto de `failure()` en el upload (`always()`, `failure() || always()`), o `failure()` en otro paso de `e2e` o en un upload de otro job — el test falla nombrando el job y el paso.
- El paso de upload con `path` distinto del `outputDir`, retención distinta de 7 o `if-no-files-found` distinto de `error` — falla nombrando la clave.
- `playwright install` sin `--no-install`, o `tsx`/`playwright` resueltos sin bloqueo de descarga — falla nombrando el paso.

**Required tests**
- [ ] test_ci_cuatro_jobs_lint_unit_integration_e2e — los jobs son exactamente `lint`, `unit`, `integration`, `e2e`, con esos `name` — validates AC-01
- [ ] test_ci_cadena_needs — además, `e2e` tiene `needs: integration` — validates AC-01
- [ ] test_ci_e2e_instala_chromium_y_corre_test_e2e — el job `e2e` corre `npm ci`, `npx --no-install playwright install --with-deps chromium` y `npm run test:e2e`, y ningún otro comando de test — validates AC-10
- [ ] test_ci_e2e_sube_evidencia_solo_en_falla — el único paso con `if:` es el upload del job `e2e`, con `failure()`, `path` igual a `E2E_OUTPUT_DIR`, `retention-days: 7` e `if-no-files-found: error` — validates AC-11, AC-12
- [ ] test_ci_node_24_y_timeout_por_job — ahora sobre los cuatro jobs
- [ ] test_ci_action_sin_sha_rechazada — 9 `uses:`, todos por SHA (sad path)
- [ ] test_ci_if_que_saltea_cadena_rechazado — suma variantes rechazadas: `if: always()` en el upload, `if: failure() || always()`, `if: failure()` en el paso `npm run test:e2e` y en un upload agregado al job `unit` (sad path)
- [ ] test_ci_evidencia_mal_configurada_rechazada — un `path` distinto, `retention-days: 30` o `if-no-files-found: ignore` se rechazan nombrando la clave (sad path)
- [ ] test_ci_instalacion_sin_no_install_rechazada — `npx playwright install --with-deps chromium` sin `--no-install` se rechaza (sad path)

**Completion criterion**
Los 9 tests pasan junto con el resto de `ci.test.ts`; `npm run lint`, `npm run typecheck` y
`npm run test:unit` en verde. En el PR aparece el check `e2e` en verde después de `integration` (se
confirma en CLOSEOUT).

## Final verification
`validate_spec.py --tier FEATURE` pasa; `npm run lint`, `npm run typecheck`, `npm run test:unit`,
`npm run test:integration` y `npm run test:e2e` en verde; el reporte de tests registra la corrida
e2e local y el PR muestra los checks `lint`, `unit`, `integration` y `e2e`. Pendiente del usuario,
fuera del código: sumar `e2e` a los checks exigidos por el ruleset `proteger-main`.
