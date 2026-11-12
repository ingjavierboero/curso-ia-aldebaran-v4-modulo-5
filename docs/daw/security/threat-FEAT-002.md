# Threat model FEAT-002: CI en pull requests (install, lint, tests)

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Spec | docs/daw/specs/spec-FEAT-002.md |
| Tier | FEATURE |
| Date | 2026-11-11 |

## Components
| Component | Source in the spec |
|---|---|
| `.github/workflows/ci.yml` | Block 3 |
| `.oxlintrc.json` y script `lint` en `package.json` | Block 1 |
| `server/test/tooling/lint.test.ts` y `server/test/tooling/ci.test.ts` | Block 1 y Block 3 |
| Correcciones de lint en `server/src/infrastructure/http/routes/auth.ts` y `setup.ts` | Block 2 |

## Trust boundaries
- Autor del PR (posiblemente un fork) → runner de GitHub Actions: el código del PR, incluidos sus scripts de `package.json`, se ejecuta en el runner.
- Runner → registro de npm: `npm ci` descarga paquetes y ejecuta sus scripts de instalación.
- Runner → GitHub Actions marketplace: `actions/checkout` y `actions/setup-node` se descargan y ejecutan en cada corrida.
- Runner → API de GitHub: el `GITHUB_TOKEN` automático de la corrida, que puede escribir en el repo si no se lo restringe.

## STRIDE analysis
### `.github/workflows/ci.yml`
- **Spoofing:** un PR desde un fork podría intentar actuar con la identidad del repo; el evento `pull_request` (no `pull_request_target`) corre con el token de solo lectura del fork y sin secretos (R-01).
- **Tampering:** una action de terceros referida por tag mutable podría cambiar de contenido; se fijan por SHA de commit completo (R-02). El token no tiene permisos de escritura, así que el job no puede modificar el repo (R-03).
- **Repudiation:** cada corrida queda registrada en GitHub Actions con el commit, el autor del PR y los logs de cada paso; no se agrega logging propio.
- **Information Disclosure:** el workflow no declara ni lee ningún secreto; `actions/checkout` se usa con `persist-credentials: false` para que el token no quede en `.git/config` al alcance de los scripts del PR (R-04).
- **Denial of Service:** un PR podría colgar el job (test infinito); `timeout-minutes: 10` lo corta y `concurrency` con `cancel-in-progress` evita corridas apiladas del mismo PR (R-05).
- **Elevation of Privilege:** `permissions: contents: read` a nivel workflow deja el `GITHUB_TOKEN` sin escritura en contenido, PRs, issues ni packages (R-03).

### `.oxlintrc.json` y script `lint` en `package.json`
- **Spoofing:** no aplica: no hay identidades en juego; el lint corre como el usuario del runner o del desarrollador.
- **Tampering:** un PR podría relajar reglas o ampliar `ignorePatterns` para que su código pase; el cambio queda visible en el diff del PR y el test `lint.test.ts` falla si la regla de promesas sin manejar deja de disparar (R-06).
- **Repudiation:** los cambios de config quedan en el historial de git con su autor.
- **Information Disclosure:** el lint no lee ni imprime datos sensibles; solo rutas y fragmentos de código del repo.
- **Denial of Service:** el lint con tipos sobre todo el monorepo podría ser lento; NFR-05 (10 min) lo acota y oxlint corre en paralelo nativo.
- **Elevation of Privilege:** no aplica: el lint no ejecuta el código que analiza.

### `server/test/tooling/lint.test.ts` y `server/test/tooling/ci.test.ts`
- **Spoofing:** no aplica: no hay autenticación involucrada.
- **Tampering:** `lint.test.ts` lanza oxlint en un subproceso con argumentos fijos (array, sin shell), así que no hay inyección de comandos (R-07).
- **Repudiation:** no aplica: son tests sin efectos persistentes.
- **Information Disclosure:** `ci.test.ts` lee `ci.yml` como texto y verifica que no contenga referencias a `secrets.`; no lee archivos fuera del repo.
- **Denial of Service:** el subproceso de oxlint podría colgarse; el test fija un timeout explícito.
- **Elevation of Privilege:** no aplica: corren con los permisos del proceso de tests.

### Correcciones de lint en `server/src/infrastructure/http/routes/auth.ts` y `setup.ts`
- **Spoofing:** si oxlint marca los handlers async de login y de registro del primer Admin y hay que corregirlos (se mide antes; puede que no haga falta, porque en Express 5 `RequestHandler` devuelve `unknown`), un error que dejara de propagarse, una falla de autenticación podría responder como éxito. Los tests HTTP existentes de auth y setup tienen que seguir pasando sin cambios en sus aserciones de comportamiento (R-08).
- **Tampering:** no cambia la validación de entrada; si hace falta tipar `req.body`, se lo trata como `unknown` antes de `bodyObject`, que ya valida su forma.
- **Repudiation:** sin cambios en lo que se registra hoy.
- **Information Disclosure:** un rechazo de promesa silenciado (`void` o `.catch(() => {})` en el handler) saltearía el mapeo de `errorHandler.ts`; el spec lo prohíbe y cualquier corrección propaga el error a Express (R-08).
- **Denial of Service:** una promesa rechazada sin manejar puede tirar el proceso de Node; justamente la regla `no-misused-promises` lo previene al obligar a manejarla.
- **Elevation of Privilege:** el middleware de sesión y perfiles no cambia; las correcciones no tocan la autorización.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| `GITHUB_TOKEN` de la corrida | credentials | no se persiste: `persist-credentials: false`; GitHub lo revoca al terminar el job | TLS 1.2+ hacia la API de GitHub |
| Código fuente del repo | public | repositorio de GitHub | TLS 1.2+ en checkout |
| Credenciales de ARCA, Anthropic y Gmail | credentials | nunca presentes en CI: el workflow no declara secretos | no viajan: los tests usan fakes inyectados en lugar de los servicios reales |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | PR desde fork usa un evento privilegiado y accede a secretos | E | M | C | Trigger `pull_request`, nunca `pull_request_target`; sin secretos en el workflow; `ci.test.ts` lo verifica |
| R-02 | Action de terceros comprometida vía tag mutable | T | L | H | `actions/checkout` y `actions/setup-node` fijadas por SHA de 40 caracteres, con el tag en comentario; `ci.test.ts` lo verifica |
| R-03 | El job escribe en el repo con el `GITHUB_TOKEN` | E | M | H | `permissions: contents: read` a nivel workflow; `ci.test.ts` lo verifica |
| R-04 | Scripts del PR leen el token persistido en `.git/config` | I | M | M | `persist-credentials: false` en `actions/checkout` |
| R-05 | Job colgado o corridas apiladas consumen minutos | D | M | L | `timeout-minutes: 10` y `concurrency` por PR con `cancel-in-progress: true` |
| R-06 | Un PR relaja la config del lint para que su código pase | T | M | M | El diff es visible en revisión; `lint.test.ts` falla si deja de detectarse una promesa sin manejar |
| R-07 | Inyección de comandos en el test que lanza oxlint | T | L | M | `execFile`/`spawn` con argumentos en array, sin shell, rutas resueltas desde `import.meta.url` |
| R-08 | Una corrección de lint cambia el comportamiento de login o setup | S | M | H | Ningún test existente se modifica en sus aserciones de comportamiento; la suite completa tiene que pasar después del Block 2 |
| R-09 | Scripts de instalación de dependencias maliciosos durante `npm ci` | T | L | H | Accepted, see below |

## Accepted risks
### R-09
- **Accepted by:** Javier (dueño del repo), al aprobar este threat model
- **Justification:** `better-sqlite3` necesita su script de instalación para obtener el binario nativo, así que `--ignore-scripts` rompería los tests; `npm ci` instala exactamente el lockfile revisado, el job no tiene secretos y el token es de solo lectura, lo que acota el daño posible.
- **Review conditions:** se revisa si el workflow alguna vez necesita secretos o permisos de escritura, o si se agrega una dependencia nueva con script de instalación.

## Supply chain
Dependencias nuevas: `oxlint` y `oxlint-tsgolint` (devDependencies, del proyecto oxc), fijadas por el
lockfile e instaladas con `npm ci`. Actions nuevas: `actions/checkout` y `actions/setup-node`
(oficiales de GitHub), fijadas por SHA de commit. No se agregan otras dependencias: `ci.test.ts`
lee el YAML como texto para no sumar un parser.

## Availability
El CI no expone ningún servicio. Los vectores de DoS son el consumo de minutos del runner,
cubiertos por R-05, y la caída del proceso de Node por promesas rechazadas sin manejar, que la
regla de lint ayuda a prevenir. La disponibilidad de GitHub Actions y del registro de npm queda
fuera del alcance: si fallan, el CI falla y se re-ejecuta.
