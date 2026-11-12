# Verification FEAT-002

Verificación del módulo completo en `feat/FEAT-002-ci-pull-requests` (HEAD `6991fef`, árbol limpio), contra `docs/daw/prd/prd-FEAT-002.md` y `docs/daw/specs/spec-FEAT-002.md`. Verificador independiente: `daw-module-verifier`, que no escribió el código; corrió lint, typecheck, suite y cobertura, y mutaciones sobre copias fuera del repo.

| Field | Value |
|---|---|
| Module | `.github/workflows/ci.yml`, `.oxlintrc.json`, `package.json` (script `lint`), correcciones de lint en `server/` y `web/`, `server/test/tooling/`, `server/test/support/responseBody.ts` |
| Line coverage | 90.52% |
| Branch coverage | 86.49% |
| Function coverage | 94.59% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors en 103 archivos; `npm run typecheck` (`tsc -b`) — clean |

## Acceptance criteria
- ✅ AC-01 — `test_ci_dispara_en_pull_request`, `test_ci_pull_request_target_rechazado` (`.github/workflows/ci.yml:4`); el disparo real se observa en CLOSEOUT
- ✅ AC-02 — `test_ci_dispara_en_pull_request` (tipos por defecto de `pull_request`, incluye `synchronize`)
- ✅ AC-03 — `test_ci_orden_de_pasos` (`ci.yml:32-33`, `npm ci` instala desde el lockfile sin escribirlo)
- ✅ AC-04 — `test_ci_orden_de_pasos`; el rechazo de un lockfile desalineado es comportamiento propio de `npm ci`
- ✅ AC-05 — `test_ci_orden_de_pasos` + `test_promesa_flotante_rechazada` (oxlint sale con código distinto de 0 ante una violación, y ese código corta el job)
- ✅ AC-06 — `test_promesa_flotante_rechazada` (binario real con la config del repo sobre el fixture; `.oxlintrc.json:8`)
- ✅ AC-07 — `npm run lint` con exit 0 y 0 errores en 103 archivos (corrida directa del verificador); `test_lint_normal_ignora_fixture` asegura que el fixture no contamina el lint
- ⚠️ AC-12 — `test_ci_orden_de_pasos` verifica un paso con nombre propio por etapa (`ci.yml:21-42`); que el PR muestre el resultado y el paso que se cortó se observa después del push: diferido a CLOSEOUT
- ✅ AC-08 — `test_ci_orden_de_pasos` (`ci.yml:38-39`)
- ✅ AC-09 — `test_ci_orden_de_pasos` (`ci.yml:41-42`)
- ✅ AC-10 — `test_ci_orden_de_pasos`, `test_ci_node_24_y_timeout`; lint, typecheck y tests en 0 en local
- ✅ AC-11 — `test_ignore_invalido_que_excluye_codigo` (`package.json:17`, `.oxlintrc.json:48-55`)
- ✅ AC-13 — `test_ci_sin_secretos_rechazado`, `test_ci_action_sin_sha_rechazada` (sin `secrets` ni `github.token`, `persist-credentials: false`, actions por SHA)
- ⚠️ AC-14 — `test_ci_mock_mode_en_tests` verifica que `MOCK_MODE` está declarado; la ausencia de red la garantiza que no hay ningún cliente externo en el código (grep vacío de nodemailer, imapflow, @anthropic-ai, dolarhoy, wsaa, wsfe) más los fakes y un CI sin credenciales (estrategia de NFR-02 en el spec)
- ✅ AC-15 — `test_ci_permisos_escritura_rechazado` (`ci.yml:7-8`)

## Spec blocks
- ✅ Block 1 — oxlint con tipos: todas las tareas hechas (`7cd52a0`); desvíos aprobados en `docs/daw/specs/decisions-FEAT-002.md`
- ✅ Block 2 — 67 violaciones corregidas (`15ced8d`), sin disable, sin ignores ampliados, sin handlers de Express tocados
- ✅ Block 3 — workflow de CI (`e7aafe6`); el criterio "el PR termina en verde" se comprueba en CLOSEOUT

## Tests
- ✅ `test_promesa_flotante_rechazada`
- ✅ `test_ignore_invalido_que_excluye_codigo`
- ✅ `test_lint_normal_ignora_fixture`
- ✅ `test_body_con_forma_esperada_se_estrecha`
- ✅ `test_body_con_campo_faltante_error`
- ✅ `test_body_no_objeto_rechazado`
- ✅ `test_ci_dispara_en_pull_request`
- ✅ `test_ci_orden_de_pasos`
- ✅ `test_ci_node_24_y_timeout`
- ✅ `test_ci_mock_mode_en_tests`
- ✅ `test_ci_sin_secretos_rechazado`
- ✅ `test_ci_permisos_escritura_rechazado`
- ✅ `test_ci_action_sin_sha_rechazada`
- ✅ `test_ci_pull_request_target_rechazado`
- ✅ Sad-path tests: `test_promesa_flotante_rechazada`, `test_ignore_invalido_que_excluye_codigo`, `test_body_con_campo_faltante_error`, `test_body_no_objeto_rechazado`, `test_ci_sin_secretos_rechazado`, `test_ci_permisos_escritura_rechazado`, `test_ci_action_sin_sha_rechazada`, `test_ci_pull_request_target_rechazado`; cada mutación probada rompe exactamente el test que corresponde
- Suite completa: 145/145 (31 archivos), 0 skipped

## TDD evidence
Registrada por bloque en CODE, revisada por un `daw-module-verifier` distinto en cada bloque (`.daw-work/review-block-1.md`, `-2.md`, `-3.md`):
- Block 1: 3/3 en rojo antes de implementar; la corrida en rojo de `test_promesa_flotante_rechazada` se hizo con una versión anterior del test (`--no-ignore`, binario ausente) que se reescribió; la versión actual solo se comprobó a mano contra el binario (exit 1, `no-floating-promises` en `floating-promise.ts:10`).
- Block 2: 3/3 en rojo contra un stub que lanzaba "sin implementar", cada uno en su aserción.
- Block 3: 8/8 en rojo (sin `ci.yml`, ENOENT) y luego contra un borrador incorrecto, cada uno en su propia aserción.

## Warnings
- AC-12 diferido: en CLOSEOUT hay que registrar que el PR muestra el check con un paso por etapa y en verde (también es el criterio de cierre del Block 3).
- AC-14: el test verifica la declaración de `MOCK_MODE`, no la ausencia de red; hoy se cumple porque no existe ningún cliente externo.
- W-VER-01: sin código muerto. W-VER-03: riesgo bajo (subproceso con timeout y limpieza en `finally`; parser de YAML por indentación, determinista).

Result: PASSED
