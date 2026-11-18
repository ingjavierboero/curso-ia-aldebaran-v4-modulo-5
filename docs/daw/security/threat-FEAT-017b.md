# Threat model FEAT-017b: Etapa e2e en el CI con Playwright y prueba de humo de inicio de sesión

| Field | Value |
|-------|-------|
| Ticket | FEAT-017b |
| Spec | docs/daw/specs/spec-FEAT-017b.md |
| Tier | FEATURE |
| Date | 2026-11-17 |

## Components
| Component | Source in the spec |
|---|---|
| `playwright.config.ts` y `e2e/e2eSettings.ts` | Block 1 |
| `e2e/smoke.e2e.ts` | Block 1 |
| `.github/workflows/ci.yml` (job `e2e`) | Block 2 |

## Trust boundaries
- Pull request (código no revisado) → runner de GitHub Actions: el job `e2e` ejecuta `npm ci`, la config de Playwright y la prueba del PR, y levanta server y web.
- CDN de Playwright → runner: `npx --no-install playwright install --with-deps chromium` descarga el navegador fuera del lockfile de npm.
- Runner → almacenamiento de artefactos de GitHub: `actions/upload-artifact` publica capturas y trazas cuando la etapa falla.
- Proceso de Playwright → server local (`localhost:3000`) y web (`localhost:5173`): la prueba habla HTTP con la app recién levantada.

## STRIDE analysis
### `playwright.config.ts` y `e2e/e2eSettings.ts`
- **Spoofing:** con `reuseExistingServer: false` Playwright no se conecta a un server que ya escucha en 3000 o 5173 (por ejemplo el de desarrollo); aborta en vez de usarlo (R-01).
- **Tampering:** la prueba podría escribir en la base de desarrollo si `DATABASE_PATH` quedara vacío (el server cae a `data/aldebaran.db`); `assertTempDatabasePath` exige una ruta absoluta bajo `os.tmpdir()` y la config falla cerrada antes de levantar nada (R-02).
- **Repudiation:** cada corrida deja su salida en `test-results/e2e/` y, en el CI, el log del job.
- **Information Disclosure:** el server arranca con `GMAIL_USER`, `GMAIL_APP_PASSWORD` y `EMAIL_REDIRECT_TO` vacíos, así que no envía emails reales aunque el entorno local los tenga; no hay claves del LLM.
- **Denial of Service:** un server que no arranca colgaría la corrida; cada entrada de `webServer` tiene `timeout` de 120 s y la corrida un `globalTimeout` de 6 minutos (R-05).
- **Elevation of Privilege:** el server corre con `NODE_ENV=test`, que solo apaga el atributo `Secure` de la cookie para poder usar http local; no cambia ninguna regla de autorización.

### `e2e/smoke.e2e.ts`
- **Spoofing:** la prueba crea el primer Admin con email y contraseña generados en cada corrida (`randomUUID`); no hay credenciales fijas en el repo (R-03).
- **Tampering:** opera solo sobre la base temporal que crea su propia corrida; `globalTeardown` borra el directorio al terminar.
- **Repudiation:** el nombre del test y el resultado quedan en la salida de Playwright y en el check `e2e` del PR.
- **Information Disclosure:** las trazas guardan los requests, incluida la contraseña de prueba y la cookie de sesión; ambas son descartables y valen solo para esa base temporal, que se borra (R-03).
- **Denial of Service:** una espera mal escrita colgaría la prueba; `expect` con timeout por defecto y el `globalTimeout` la cortan.
- **Elevation of Privilege:** la prueba usa el flujo público de alta del primer Admin, que solo existe con la base vacía; no toca rutas internas ni permisos.

### `.github/workflows/ci.yml` (job `e2e`)
- **Spoofing:** sigue siendo solo `pull_request`; el job no recibe identidad del repo base (R-01 de FEAT-017a, verificado por `ci.test.ts`).
- **Tampering:** `actions/upload-artifact` se fija por SHA (`cf430e030ddbb5b0abf93d22962f4752f3646cd9`, v7.0.2) como checkout y setup-node; `npx --no-install` impide que `playwright` o `tsx` se descarguen del registro si faltaran en `node_modules` (R-04).
- **Repudiation:** el artefacto `e2e-evidencia` queda asociado a la corrida y al commit del PR.
- **Information Disclosure:** el artefacto solo se publica si la etapa falla (`if: failure()` en ese único paso) y se conserva 7 días; contiene datos de prueba descartables (R-03). El job no declara secretos ni `permissions`.
- **Denial of Service:** `timeout-minutes: 10`; si GitHub cancela el job por tiempo, el paso con `if: failure()` no corre y no hay evidencia, por eso Playwright corta antes con `globalTimeout` de 6 minutos (R-05).
- **Elevation of Privilege:** `permissions: contents: read` global; upload-artifact usa el token de runtime de Actions, no el `GITHUB_TOKEN` con escritura. La excepción `if: failure()` vale solo para el paso de upload del job `e2e`, y `ci.test.ts` rechaza cualquier otra (R-06).

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| contraseña y email del Admin de prueba | credentials (descartables, por corrida) | hash argon2id en la base temporal, que se borra; en claro solo en la traza del artefacto, 7 días en el almacenamiento de GitHub | http localhost dentro del runner; TLS hacia el almacenamiento de artefactos |
| cookie de sesión de prueba | credentials (descartable) | no se persiste fuera de la base temporal y de la traza | http localhost; TLS hacia el almacenamiento de artefactos |
| capturas de pantalla | public (datos ficticios) | artefacto de GitHub, 7 días | TLS |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | La prueba corre contra un server de desarrollo ya levantado | S | M | H | `reuseExistingServer: false` y `--strictPort`; Playwright aborta |
| R-02 | La prueba escribe en `data/aldebaran.db` por un `DATABASE_PATH` vacío o mal armado | T | L | H | `assertTempDatabasePath` (absoluta, bajo `os.tmpdir()`), config fail-closed, test de tooling |
| R-03 | Las trazas exponen credenciales | I | M | L | credenciales aleatorias por corrida, base temporal borrada, artefacto solo en falla y 7 días |
| R-04 | Una acción o paquete se resuelve fuera de lo fijado | T | L | H | upload-artifact por SHA; `npx --no-install`; `@playwright/test` exacto en el lockfile |
| R-05 | Un cuelgue consume el job y no deja evidencia | D | M | M | `timeout` de 120 s por server, `globalTimeout` de 6 min, `timeout-minutes: 10` |
| R-06 | La excepción de `if:` se usa para saltear la cadena o publicar siempre | E | L | M | `ci.test.ts` acepta solo `if: failure()` exacto en el upload del job `e2e` y rechaza las variantes |
| R-07 | El navegador descargado del CDN de Playwright está comprometido | T | L | H | lo baja la misma versión fijada de `playwright` desde su CDN oficial por HTTPS; corre en el runner efímero, sin secretos y con token de solo lectura |

## Supply chain
Dependencias nuevas: `@playwright/test` 1.65.1 exacta (devDependency, una sola dependencia transitiva:
`playwright` 1.65.1), fijada por el lockfile con integridad sha512 y cubierta por Dependabot (FEAT-005).
Acción nueva: `actions/upload-artifact` v7.0.2 fijada por SHA. El binario de Chromium viene del CDN de
Playwright para esa versión (R-07); no entra en el lockfile.

## Availability
Los vectores son un arranque que no termina y una prueba colgada (R-05). La etapa depende del CDN de
Playwright y de GitHub Actions: si no responden, el job falla y el PR queda sin el check `e2e`.
