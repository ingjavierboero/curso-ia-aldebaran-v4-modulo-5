# Spec FEAT-002: CI en pull requests (install, lint, tests)

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| PRD | docs/daw/prd/prd-FEAT-002.md |
| Tier | FEATURE |
| Date | 2026-11-11 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Se agrega oxlint en modo con tipos (`oxlint-tsgolint`, ADR-004) como linter del monorepo, con una
config en la raíz y un script `npm run lint`. Se mide y se corrige todo lo que reporta sobre el
código actual sin cambiar comportamiento. Después se agrega un workflow de GitHub Actions que, en
cada pull request, corre `npm ci`, `npm run lint`, `npm run typecheck` y `npm test` con permisos de
solo lectura y sin secretos. Los tests del tooling viven en `server/test/tooling/`, porque el
`vitest.config.ts` raíz solo ejecuta los proyectos `server` y `web`.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 3 |
| FR-02 | Block 3 |
| FR-03 | Block 1, Block 3 |
| FR-04 | Block 1 |
| FR-05 | Block 2 |
| FR-06 | Block 3 |
| FR-07 | Block 3 |
| FR-08 | Block 1 |
| FR-09 | Block 3 |
| NFR-01 | Block 3 — el workflow no declara ni referencia secretos; `test_ci_sin_secretos_rechazado` lo verifica |
| NFR-02 | Strategy: los tests ya usan fakes inyectados en lugar de ARCA, LLM, email y cotización; el CI no tiene credenciales, así que una llamada real fallaría. `MOCK_MODE=true` se declara en el paso de tests, pero hoy ningún código lo lee: no es el mecanismo que garantiza la ausencia de red |
| NFR-03 | Block 3 — `node-version: 24` en `actions/setup-node`, igual que `engines` en `package.json` |
| NFR-04 | Block 3 — `permissions: contents: read` a nivel workflow |
| NFR-05 | Block 3 — `timeout-minutes: 10` en el job |

## Dependencies between blocks
Block 1 → Block 2 → Block 3. El Block 2 necesita el linter del Block 1 para medir y corregir, y el
Block 3 corre `npm run lint`, que tiene que terminar en 0 errores (Block 2) para que el primer PR
salga en verde.

## Block 1 — Linter oxlint con tipos

**Files**
- `package.json` (modified) — devDependencies `oxlint` y `oxlint-tsgolint`; script `"lint": "oxlint --type-aware"`, sin rutas, para que analice todo el repo.
- `package-lock.json` (modified) — regenerado por `npm install`.
- `.oxlintrc.json` (new) — plugins `typescript`; categoría `correctness` como error; reglas con tipos como error: `typescript/no-floating-promises`, `typescript/no-misused-promises`, `typescript/await-thenable`, `typescript/no-unsafe-assignment`, `typescript/no-unsafe-member-access`, `typescript/no-unsafe-call`, `typescript/no-unsafe-return`, `typescript/no-unsafe-argument` (y las que oxlint ofrezca equivalentes a `strict-type-checked`); `ignorePatterns`: `**/dist/**`, `coverage/**`, `**/node_modules/**`, `.daw/**`, `/vitest.config.ts` (anclado: solo el de la raíz, que no está en ningún tsconfig), `server/test/tooling/fixtures/**`.
- `AGENTS.md` (modified) — `- Lint: npm run lint` en Stack, junto a Install/Test/Typecheck.
- `server/test/tooling/fixtures/floating-promise.ts` (new) — una función que llama a una promesa sin esperarla ni manejarla; compila sin errores (dentro de `server/tsconfig.json`).
- `server/test/tooling/lint.test.ts` (new) — tests del linter.

**Logic**
Implements FR-04 y FR-08, y la parte de config de FR-03. `lint.test.ts` lanza el binario de oxlint
con `execFile` (argumentos en array, sin shell; R-07), con rutas resueltas desde `import.meta.url` y
un timeout de test de 30 s. Para lintear el fixture, que el lint normal ignora, usa el mecanismo que
oxlint ofrezca para saltear el ignore (`--no-ignore`, o una config propia del test pasada con `-c`);
cuál de los dos se elige se verifica al implementar contra el binario instalado. La comprobación de
AC-11 es estática: lee `package.json` y `.oxlintrc.json` y verifica que el script no limita rutas y
que ningún patrón de ignore excluye `server/` ni `web/`. No se corre `npm run lint` completo dentro
de Vitest para no duplicar el paso del CI ni sumar tiempo a `npm test`.

**Error handling**
- El fixture con una promesa sin manejar — oxlint termina con código distinto de 0 y su salida nombra `no-floating-promises`; el test lo exige.
- Un patrón de ignore inválido que excluya `server/` o `web/` — el test estático falla nombrando el patrón.

**Required tests**
- [ ] test_promesa_flotante_rechazada — la corrida dirigida sobre el fixture reporta `no-floating-promises` como error (sad path) — validates AC-06
- [ ] test_ignore_invalido_que_excluye_codigo — falla si algún patrón de ignore excluye `server/` o `web/`, o si el script `lint` limita rutas (sad path) — validates AC-11
- [ ] test_lint_normal_ignora_fixture — el fixture está cubierto por `ignorePatterns`, así que `npm run lint` no lo reporta — validates AC-07

**Completion criterion**
Los tres tests pasan; `npm run lint` corre con la config nueva sobre `server/` y `web/` (los errores
que reporte sobre el código actual se corrigen en el Block 2).

## Block 2 — Corregir las violaciones existentes

**Files**
- `server/test/support/responseBody.ts` (new) — helper tipado que recibe `res.body` (como `unknown`) y lo estrecha a la forma esperada, o lanza un error que nombra lo que falta.
- `server/test/support/responseBody.test.ts` (new) — tests del helper.
- `server/test/http/app.test.ts`, `server/test/http/auth.test.ts`, `server/test/http/middleware.test.ts`, `server/test/http/setup.test.ts` (modified) — usan el helper en lugar de acceder a `res.body` como `any`; sus aserciones de comportamiento no cambian.
- Archivos de `server/src/`, `server/test/` y `web/src/` que reporte `npm run lint` (modified). Candidatos del impact scan, a confirmar con la medición: `server/src/infrastructure/http/routes/auth.ts`, `server/src/infrastructure/http/routes/setup.ts`, `web/src/pages/LoginPage.tsx`, `web/src/pages/FirstAdminPage.tsx`, `web/src/pages/HomePage.tsx`, `web/src/api/authApi.ts`, `web/src/router.tsx`.

**Logic**
Implements FR-05. Primero se corre `npm run lint` y se registra la cantidad de errores por regla y por
archivo en el reporte del bloque. Si superan 40 errores o 20 archivos, se para y se consulta al usuario
antes de corregir (Riesgos del PRD). Reglas de corrección:
- Solo se tocan los archivos que el lint reporta; si un candidato no aparece, no se modifica.
- Handlers de Express: si oxlint los marca, la corrección queda en `server/src/infrastructure/http/` (por ejemplo, un helper que propague el rechazo con `next(error)`). Prohibido silenciar el rechazo con `void` o `.catch(() => {})` dentro del handler: saltea el mapeo de `errorHandler.ts` (R-08). Prohibido mover try/catch de HTTP a los casos de uso.
- Prohibido desactivar reglas con comentarios inline, ampliar `ignorePatterns` para esquivar código o relajar opciones de las reglas sin una decisión del usuario.
- Tests: `res.body` de supertest pasa por `responseBody.ts`; ningún helper devuelve `any`.

**Error handling**
- `res.body` sin la forma esperada — `responseBody.ts` lanza un error que nombra el campo faltante, y el test que lo usa falla con ese mensaje en lugar de un `undefined` silencioso.
- Un `res.body` que no es un objeto (null, string) — el helper lo rechaza con el mismo tipo de error.

**Required tests**
- [ ] test_body_con_forma_esperada_se_estrecha — el helper devuelve el valor tipado cuando la forma coincide — validates AC-07
- [ ] test_body_con_campo_faltante_error — el helper lanza un error que nombra el campo faltante (sad path) — validates AC-07
- [ ] test_body_no_objeto_rechazado — null o string se rechazan (sad path) — validates AC-07

**Completion criterion**
`npm run lint` termina con 0 errores; `npm run typecheck` termina sin errores; `npm test` pasa
completo, con los tests HTTP existentes sin cambios en sus aserciones de comportamiento; los tres
tests del helper pasan.

## Block 3 — Workflow de CI en pull requests

**Files**
- `.github/workflows/ci.yml` (new) — el workflow.
- `server/test/tooling/ci.test.ts` (new) — lee `ci.yml` como texto (sin parser de YAML) y verifica su contenido.

**Logic**
Implements FR-01, FR-02, FR-03, FR-06, FR-07 y FR-09. El workflow:
- `on: pull_request` (tipos por defecto: opened, synchronize, reopened); nunca `pull_request_target` (R-01).
- `permissions: contents: read` a nivel workflow (R-03).
- `concurrency`: grupo por workflow y ref del PR, `cancel-in-progress: true` (R-05).
- Un job `ci` en `ubuntu-latest` con `timeout-minutes: 10` (R-05).
- `actions/checkout` fijada por SHA de 40 caracteres con el tag en comentario y `persist-credentials: false` (R-02, R-04).
- `actions/setup-node` fijada por SHA, `node-version: 24`, `cache: npm` (R-02).
- Un paso con nombre propio por etapa, en este orden: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`. El paso de tests declara `env: MOCK_MODE: "true"`.
- Sin `secrets.` en ningún lado.

Los SHA se resuelven al implementar con `gh api repos/actions/<action>/git/ref/tags/<tag>`, contra
la última versión mayor estable de cada action.

**Error handling**
- Una referencia a `secrets.` en el workflow — `ci.test.ts` la rechaza.
- Permisos de escritura (`write`) en el workflow — `ci.test.ts` los rechaza.
- Una action referida por tag en lugar de SHA de 40 caracteres — `ci.test.ts` la rechaza.
- El trigger `pull_request_target` — `ci.test.ts` lo rechaza.

**Required tests**
- [ ] test_ci_dispara_en_pull_request — el trigger es `pull_request` — validates AC-01, AC-02
- [ ] test_ci_orden_de_pasos — los pasos `npm ci`, `npm run lint`, `npm run typecheck` y `npm test` existen, con nombre propio, en ese orden — validates AC-03, AC-04, AC-05, AC-08, AC-09, AC-10, AC-12
- [ ] test_ci_node_24_y_timeout — `node-version: 24` y `timeout-minutes: 10` — validates AC-10
- [ ] test_ci_mock_mode_en_tests — el paso de tests declara `MOCK_MODE: "true"` — validates AC-14
- [ ] test_ci_sin_secretos_rechazado — no hay ninguna referencia a `secrets.` (sad path) — validates AC-13
- [ ] test_ci_permisos_escritura_rechazado — `permissions` es `contents: read` y no aparece `write` (sad path) — validates AC-15
- [ ] test_ci_action_sin_sha_rechazada — toda línea `uses:` termina en un SHA de 40 caracteres (sad path) — validates AC-13
- [ ] test_ci_pull_request_target_rechazado — `pull_request_target` no aparece (sad path) — validates AC-01

**Completion criterion**
Los ocho tests pasan; `npm run lint`, `npm run typecheck` y `npm test` terminan sin errores en local;
el PR de este ticket dispara el workflow en GitHub y termina en verde.

## Final verification
- `npm ci && npm run lint && npm run typecheck && npm test` termina sin errores en local.
- El PR de FEAT-002 muestra el check del workflow, con un paso por etapa, en verde.
- `validate_spec.py --tier FEATURE` pasa sobre este documento y `validate_threat.py` pasa contra él.
