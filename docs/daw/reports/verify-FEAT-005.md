# Verification FEAT-005

Verificación cruzada PRD ↔ spec ↔ código ↔ tests hecha por `daw-module-verifier` (agente que no escribió el código), sobre `2832e83`. `npx vitest run` 244/244 en 45 archivos.

| Field | Value |
|---|---|
| Module | .github/dependabot.yml, server/test/tooling/dependabot.test.ts |
| Line coverage | 91.66% |
| Branch coverage | 88.75% |
| Function coverage | 94.9% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean |

## Acceptance criteria
- ✅ AC-01 — `test_dependabot_npm_semanal_en_raiz` (.github/dependabot.yml: entrada `npm`, `directory: "/"`, weekly; manifiesto y lockfile en la raíz)
- ✅ AC-02 — `test_dependabot_github_actions_semanal_en_raiz` (.github/dependabot.yml: entrada `github-actions`, `directory: "/"`, weekly)
- ✅ AC-03 — `test_dependabot_agrupa_todas_las_actualizaciones` (grupo `patterns: ["*"]` en las dos entradas)
- ✅ AC-04 — `test_dependabot_limite_un_pr_abierto_por_ecosistema` (`open-pull-requests-limit: 1`)
- ✅ AC-05 — `test_dependabot_github_actions_semanal_en_raiz` (sin `versioning-strategy`: Dependabot conserva la fijación por SHA)
- ✅ AC-06 — `test_dependabot_npm_semanal_en_raiz` (comportamiento por defecto de Dependabot; el test cubre la configuración que lo produce)
- ✅ AC-07 — `test_dependabot_sin_credenciales` (sin `registries`, `token`, `password` ni `key`)

## Spec blocks
- ✅ Block 1 — 2/2 archivos; Required tests: `test_dependabot_npm_semanal_en_raiz`, `test_dependabot_github_actions_semanal_en_raiz`, `test_dependabot_agrupa_todas_las_actualizaciones`, `test_dependabot_limite_un_pr_abierto_por_ecosistema`, `test_dependabot_sin_credenciales`, `test_dependabot_clave_faltante_error`, `test_dependabot_directorio_invalido_rechazado`

## Tests
- ✅ Sad-path tests: `test_dependabot_clave_faltante_error` (falta `schedule.interval` → el lector lo nombra) y `test_dependabot_directorio_invalido_rechazado` (directorio sin manifiesto → se rechaza nombrando ecosistema y ruta)
- ✅ TDD: reconstrucción independiente del verificador en un espejo sin el YAML — 6/8 en rojo (ENOENT); mutaciones del YAML (daily, límite 5, patrón distinto, sin groups, credenciales, otro directory, `versioning-strategy`) las detectan los tests de cada AC.

## Warnings (no bloquean)
- ⚠️ W-1: ningún test verifica la ausencia de `target-branch`; una mutación `target-branch: develop` deja los 8 tests en verde. Hoy es correcto porque la rama por defecto es `main`.
- ⚠️ W-2: `test_dependabot_sin_credenciales` compara nombres de clave exactos (no detectaría `api-key` o `username`); `registries` cubre el caso realista.
- ⚠️ W-3: los 2 tests de camino de error estuvieron en verde desde el inicio: prueban el lector del propio test, como ubica la spec.
- ⚠️ W-4: helpers de YAML-texto duplicados de `ci.test.ts` (deuda aceptada en decisions-FEAT-005.md).

Result: PASSED
