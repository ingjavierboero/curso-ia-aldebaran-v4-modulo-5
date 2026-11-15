# Threat model FEAT-005: Dependabot semanal para npm y GitHub Actions

| Field | Value |
|-------|-------|
| Ticket | FEAT-005 |
| Spec | docs/daw/specs/spec-FEAT-005.md |
| Tier | FEATURE |
| Date | 2026-11-15 |

## Components
| Component | Source in the spec |
|---|---|
| `.github/dependabot.yml` | Block 1 |
| `server/test/tooling/dependabot.test.ts` | Block 1 |

## Trust boundaries
- Registro npm público y GitHub Marketplace → repositorio: Dependabot trae versiones nuevas de paquetes y acciones de terceros y las propone como cambios a `package-lock.json` y `.github/workflows/ci.yml`.
- Pull request de Dependabot → CI (`.github/workflows/ci.yml`): el CI ejecuta `npm ci`, lint, typecheck y tests sobre el código que trae la actualización.
- Pull request de Dependabot → `main`: solo cruza si una persona lo mergea.

## STRIDE analysis
### `.github/dependabot.yml`
- **Spoofing:** un paquete con nombre parecido (typosquatting) no entra por esta vía: Dependabot solo actualiza dependencias que ya están declaradas en `package.json`, nunca agrega nombres nuevos.
- **Tampering:** una versión nueva comprometida de una dependencia existente llega como PR (supply chain); el lockfile fija integridad (`integrity` sha512) y el CI corre con `npm ci`; el PR no se mergea sin revisión humana (R-01). Las acciones siguen fijadas por SHA, así que una etiqueta movida en el repositorio de la acción no cambia lo que corre el CI (R-02).
- **Repudiation:** cada actualización queda como PR de `dependabot[bot]` con el changelog y las notas de versión enlazados, y el merge queda con autor en el historial.
- **Information Disclosure:** el archivo no declara `registries` ni credenciales; los PRs de Dependabot corren el CI con el `GITHUB_TOKEN` de solo lectura que ya fija el workflow (`permissions: contents: read`) y sin secretos del repositorio.
- **Denial of Service:** una avalancha de PRs saturaría a quien revisa; `open-pull-requests-limit: 1` y el grupo `patterns: ["*"]` limitan a 1 PR abierto por ecosistema (R-03).
- **Elevation of Privilege:** Dependabot no mergea; la configuración no habilita auto-merge ni da permisos de escritura al CI. Un script `postinstall` malicioso en una versión nueva correría dentro del runner efímero del CI, sin secretos y con token de solo lectura (R-01).

### `server/test/tooling/dependabot.test.ts`
- **Spoofing:** no hay identidades en juego; el test lee un archivo del propio repositorio por ruta fija relativa a `import.meta.url`.
- **Tampering:** el test no escribe archivos; solo lee `.github/dependabot.yml` y comprueba la existencia de manifiestos.
- **Repudiation:** no aplica: no realiza acciones; sus resultados quedan en la salida del CI.
- **Information Disclosure:** no lee ni imprime secretos; sus mensajes de error nombran solo claves y rutas del repositorio.
- **Denial of Service:** lee un archivo de pocas líneas; sin red ni procesos externos.
- **Elevation of Privilege:** no ejecuta comandos ni shell; sin `exec`/`spawn`.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| `.github/dependabot.yml` | public | versionado en git, sin secretos | HTTPS hacia GitHub |
| versiones de dependencias y acciones | public | `package-lock.json` con `integrity` sha512; SHA de acciones en `ci.yml` | HTTPS (registro npm, GitHub) |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | Versión nueva comprometida de una dependencia npm propuesta en el PR agrupado | T | L | H | Sin auto-merge: revisión humana obligatoria; CI con `npm ci`, token de solo lectura y sin secretos; integridad del lockfile |
| R-02 | Acción del CI con etiqueta reescrita por un atacante | T | L | H | Las acciones quedan fijadas por SHA; Dependabot propone el SHA nuevo en un PR revisable (FR-04) |
| R-03 | Exceso de PRs que lleva a mergear sin revisar | D | M | M | `open-pull-requests-limit: 1` y un grupo por ecosistema (NFR-01) |
| R-04 | Un PR agrupado mezcla una versión mayor que rompe con parches de seguridad y queda frenado | D | M | L | El CI marca la falla; se puede excluir la dependencia con `ignore` en un ticket aparte; las actualizaciones de seguridad de GitHub van por fuera de este archivo |

## Supply chain
Este ticket no agrega dependencias. Lo que cambia es el canal por el que entran versiones nuevas:
Dependabot propone actualizaciones de paquetes npm y acciones ya declarados; cada una pasa por PR, CI
y revisión humana antes de llegar a `main`.

## Availability
El único vector es el volumen de PRs (R-03), acotado a 1 abierto por ecosistema. Dependabot corre en
la infraestructura de GitHub; si no está disponible, no se abren PRs y el repositorio sigue igual.
