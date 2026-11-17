# Threat model FEAT-017a: Tests separados en unit e integration, y CI en lint → unit → integration

| Field | Value |
|-------|-------|
| Ticket | FEAT-017a |
| Spec | docs/daw/specs/spec-FEAT-017a.md |
| Tier | FEATURE |
| Date | 2026-11-17 |

## Components
| Component | Source in the spec |
|---|---|
| `.github/workflows/ci.yml` (jobs `lint`, `unit`, `integration`) | Block 2 |
| `server/vitest.unit.config.ts`, `server/vitest.integration.config.ts`, `vitest.config.ts` | Block 1 |
| `server/test/unit/**`, `server/test/integration/**` (tests movidos) y `server/test/unit/tooling/testLayout.test.ts` | Block 1 |

## Trust boundaries
- Pull request (código no revisado, posiblemente de un fork) → runner de GitHub Actions: cada uno de los tres jobs ejecuta `npm ci` y código del PR (tests, configs de Vitest, scripts de `package.json`).
- Registro npm → runner: `npm ci` descarga paquetes según `package-lock.json`, una vez por job.
- GitHub Marketplace → runner: `actions/checkout` y `actions/setup-node`, ahora usados por tres jobs.
- Job → job: `needs:` solo transmite el resultado (éxito/falla); no se comparten artefactos ni archivos entre jobs.

## STRIDE analysis
### `.github/workflows/ci.yml` (jobs `lint`, `unit`, `integration`)
- **Spoofing:** el disparador sigue siendo solo `pull_request` (no `pull_request_target`): el PR corre con el token del propio evento, sin identidad del repositorio base; `ci.test.ts` rechaza `pull_request_target` (R-01).
- **Tampering:** cada job usa `actions/checkout` y `actions/setup-node` fijadas por SHA; con tres jobs hay tres usos, y el test recorre todos (no solo el primero) para que ninguno quede con etiqueta móvil (R-02). `npm ci` respeta la integridad del lockfile en cada job.
- **Repudiation:** cada job queda en la corrida del PR con su nombre (`lint`, `unit`, `integration`), su log y el commit que lo disparó.
- **Information Disclosure:** sin secretos: el workflow no referencia `secrets.*`, `github.token` ni variables con `ANTHROPIC` o `API_KEY`; `persist-credentials: false` en los tres checkouts para que el token no quede en `.git/config` al alcance del código del PR (R-03).
- **Denial of Service:** un PR malicioso podría colgar un job; `timeout-minutes: 10` en cada job y `concurrency` con `cancel-in-progress` acotan el consumo (R-05). La cadena `needs:` evita correr unit e integration si lint ya falló.
- **Elevation of Privilege:** `permissions: contents: read` a nivel workflow aplica a los tres jobs; ningún job declara `permissions` propias que lo amplíen, y el test lo verifica (R-04).

### `server/vitest.unit.config.ts`, `server/vitest.integration.config.ts`, `vitest.config.ts`
- **Spoofing:** no hay identidades; los configs se cargan por ruta fija desde `vitest.config.ts`.
- **Tampering:** un PR puede cambiar un `include` para que una etapa corra 0 tests y salga en verde (con `passWithNoTests: true` en la raíz); `testLayout.test.ts` exige que cada proyecto matchee al menos un archivo y que cada `.test.ts` matchee exactamente un proyecto (R-06).
- **Repudiation:** los cambios a los configs quedan en el diff del PR y en git.
- **Information Disclosure:** los configs no leen variables de entorno ni secretos.
- **Denial of Service:** un glob demasiado amplio solo alarga la etapa, acotada por `timeout-minutes: 10`.
- **Elevation of Privilege:** el código de los configs corre con los mismos permisos que los tests, dentro del runner efímero y sin secretos.

### `server/test/unit/**`, `server/test/integration/**` (tests movidos) y `server/test/unit/tooling/testLayout.test.ts`
- **Spoofing:** no aplica: los tests no se autentican contra nada externo; los de integración usan SQLite en memoria o en un directorio temporal propio.
- **Tampering:** un test que abre la base podría quedar en `unit/` y correr en la etapa equivocada; `testLayout.test.ts` veta en `unit/` los imports de `sqliteTestDb`, `better-sqlite3`, `supertest`, `testApp`, `httpSession`, `node:net`, `node:http` y `express`, y las llamadas a `createDb(` y `createApp(` (R-07).
- **Repudiation:** la evidencia de la mudanza (lista de nombres de tests antes y después) queda en `docs/daw/reports/tests-FEAT-017a.md`.
- **Information Disclosure:** los tests no usan credenciales reales; corren con `MOCK_MODE=true` a nivel workflow y sin claves del proveedor del modelo (NFR-02).
- **Denial of Service:** perder tests en la mudanza deja de proteger código sin que nadie lo note; la comparación de nombres de tests de `main` contra la rama lo detecta (R-08).
- **Elevation of Privilege:** `lint.test.ts` ejecuta `oxlint` como subproceso con argumentos fijos (`execFile`, sin shell); no cambia con la mudanza.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| código y tests del PR | public | git, sin secretos | HTTPS hacia GitHub |
| `GITHUB_TOKEN` de la corrida | credentials | no se persiste (`persist-credentials: false`), vive solo durante el job | TLS hacia la API de GitHub, permiso `contents: read` |
| bases SQLite de los tests | public (datos ficticios) | memoria o directorio temporal del runner, se descartan al terminar el job | no salen del runner |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | Un PR de fork corre con secretos o permisos del repo base | S | L | H | Solo `pull_request`; `ci.test.ts` rechaza `pull_request_target` |
| R-02 | Una acción con etiqueta reescrita entra por uno de los tres jobs | T | L | H | Todas las `uses:` de los tres jobs fijadas por SHA; el test recorre cada job |
| R-03 | El token o una clave del LLM quedan al alcance del código del PR | I | L | H | `persist-credentials: false` en cada checkout; el test prohíbe `secrets.`, `github.token`, `ANTHROPIC` y `API_KEY` en el workflow |
| R-04 | Un job amplía permisos con su propio bloque `permissions` | E | L | H | `permissions: contents: read` global; el test exige que ningún job declare `permissions` |
| R-05 | Un PR cuelga un job y consume minutos de CI | D | M | L | `timeout-minutes: 10` por job, `concurrency` con `cancel-in-progress`, cadena `needs:` |
| R-06 | Un `include` mal escrito deja una etapa con 0 tests en verde | T | M | M | `testLayout.test.ts`: cada proyecto matchea ≥ 1 archivo y cada test exactamente un proyecto |
| R-07 | Un test que abre la base queda en `unit/` | T | M | L | `testLayout.test.ts` veta imports y llamadas que abren base, app HTTP o red dentro de `unit/` |
| R-08 | La mudanza pierde tests sin que el total cambie | D | L | M | Comparación de nombres completos de tests de `main` contra la rama, guardada en el reporte de tests |

## Supply chain
No se agregan dependencias ni acciones nuevas. Las mismas `actions/checkout` y `actions/setup-node`,
fijadas por los mismos SHA, pasan de un job a tres; `npm ci` corre una vez por job contra el mismo
lockfile con integridad sha512.

## Availability
Los vectores son jobs colgados (R-05) y etapas vacías (R-06). La verificación depende de GitHub
Actions y del registro npm: si no responden, la corrida falla y el PR queda sin verificar, igual que hoy.
