# Spec FEAT-005: Dependabot semanal para npm y GitHub Actions

| Field | Value |
|-------|-------|
| Ticket | FEAT-005 |
| PRD | docs/daw/prd/prd-FEAT-005.md |
| Tier | FEATURE |
| Date | 2026-11-15 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Un archivo `.github/dependabot.yml` (versión 2) con dos entradas de `updates`: `npm` y
`github-actions`, ambas con `directory: "/"`, `schedule.interval: weekly`,
`open-pull-requests-limit: 1` y un grupo que agrupa todas las dependencias (`patterns: ["*"]`). Un
test lee el archivo como texto, con el mismo enfoque que `server/test/tooling/ci.test.ts` (sin sumar
un parser de YAML como dependencia), y verifica esa forma.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 1 |
| FR-02 | Block 1 |
| FR-03 | Block 1 |
| FR-04 | Block 1 |
| NFR-01 | Strategy: `open-pull-requests-limit: 1` y un único grupo `patterns: ["*"]` por ecosistema; lo verifica `test_dependabot_limite_un_pr_abierto_por_ecosistema` |
| NFR-02 | Strategy: el archivo no declara `registries` ni claves de credenciales; lo verifica `test_dependabot_sin_credenciales` |
| NFR-03 | Strategy: `schedule.interval: weekly` en las dos entradas; lo verifican los tests de cada ecosistema |

## Dependencies between blocks
None — Block 1 stands alone.

## Block 1 — Configuración de Dependabot

**Files**
- `.github/dependabot.yml` (new) — `version: 2`; `updates`:
  - `package-ecosystem: "npm"`, `directory: "/"` (el `package.json` y el `package-lock.json` de la raíz cubren los workspaces `server/` y `web/`), `schedule.interval: "weekly"`, `open-pull-requests-limit: 1`, `groups.npm-dependencies.patterns: ["*"]`.
  - `package-ecosystem: "github-actions"`, `directory: "/"` (Dependabot lee `.github/workflows/`), `schedule.interval: "weekly"`, `open-pull-requests-limit: 1`, `groups.github-actions.patterns: ["*"]`.
- `server/test/tooling/dependabot.test.ts` (new) — tests de la configuración, leída como texto.

**Logic**
Implements FR-01..FR-04. Sin `day` ni `time`: se usa el valor por defecto de Dependabot (lunes), como
marca el PRD. Sin `versioning-strategy` ni `ignore`: las acciones fijadas por SHA las actualiza
Dependabot manteniendo el SHA y el comentario de versión (FR-04), que es su comportamiento por
defecto. El test parsea el YAML con un lector mínimo por indentación (comentarios y líneas vacías
fuera), ubica cada entrada de `updates` por su `package-ecosystem` y lee sus claves.

**Data model**
- Sin schema de base de datos. El archivo sigue el esquema v2 de Dependabot: cada entrada de `updates` exige `package-ecosystem` (NOT NULL, uno de los valores soportados), `directory` (NOT NULL, ruta que contiene el manifiesto) y `schedule.interval` (NOT NULL, `weekly`); `open-pull-requests-limit` entero ≥ 0, default 5 si falta; `groups` opcional, nombres únicos.
- Rollback: borrar `.github/dependabot.yml` (revert del commit) desactiva las actualizaciones de versión; no hay migración ni datos que revertir, y los PRs abiertos por Dependabot se cierran a mano.

**Input validation**
- `package-ecosystem`: exactamente `npm` y `github-actions`, una entrada cada uno.
- `directory`: `/`, y en esa ruta existe `package.json` con `package-lock.json` (npm) y `.github/workflows/` (actions).
- `schedule.interval`: exactamente `weekly`.
- `open-pull-requests-limit`: exactamente `1`.

**Error handling**
- Falta una clave obligatoria en una entrada (`package-ecosystem`, `directory`, `schedule.interval`) — el lector del test lanza un error que nombra la clave faltante y el test falla con ese mensaje.
- El `directory` de una entrada no contiene el manifiesto de su ecosistema — el test falla nombrando el ecosistema y la ruta; Dependabot no encontraría dependencias y no abriría PRs.

**Required tests**
- [ ] test_dependabot_npm_semanal_en_raiz — entrada `npm` con `directory: "/"` e `interval: weekly` — validates AC-01, AC-06
- [ ] test_dependabot_github_actions_semanal_en_raiz — entrada `github-actions` con `directory: "/"` e `interval: weekly`, sin `versioning-strategy` que cambie el formato — validates AC-02, AC-05
- [ ] test_dependabot_agrupa_todas_las_actualizaciones — cada entrada tiene un grupo con `patterns: ["*"]` — validates AC-03
- [ ] test_dependabot_limite_un_pr_abierto_por_ecosistema — `open-pull-requests-limit: 1` en las dos entradas — validates AC-04
- [ ] test_dependabot_sin_credenciales — sin `registries`, `token`, `password` ni `key` — validates AC-07
- [ ] test_dependabot_clave_faltante_error — una entrada sin `schedule.interval` hace que el lector lance un error que nombra la clave (sad path)
- [ ] test_dependabot_directorio_invalido_rechazado — un `directory` sin manifiesto se rechaza nombrando ecosistema y ruta (sad path)

**Completion criterion**
Los 7 tests pasan, `npm run lint` y `npm run typecheck` terminan sin errores y la suite completa sigue
en verde.

## Final verification
`validate_spec.py --tier FEATURE` pasa sobre este documento; `.github/dependabot.yml` existe con las
dos entradas y los 7 tests pasan.
