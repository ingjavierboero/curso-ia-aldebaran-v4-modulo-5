# Test run FEAT-001

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-09 en el re-cierre de CODE, después del bucle correctivo VERIFY → CODE → PLAN → CODE. La base es `9caff23` más el renombrado, sin commitear, de los 50 Required tests a sus identificadores `test_...`.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 130 |
| Passed | 130 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 90.44% |
| Branch coverage | 86.49% |
| Function coverage | 94.48% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run typecheck` (`tsc -b`) — clean, 0 errors; no hay linter configurado en el repo (ni ESLint, Biome ni oxlint) |

Detalle:
- 28 archivos de test: 24 de `server` y 4 de `web`.
- 130 tests: 112 de server y 18 de web.
- Statements 90.14% (512/568), lines 464/513, branches 237/274, functions 137/145.
- `AGENTS.md` no declara un piso de cobertura, así que rige el del método.
- El renombrado no cambia la cantidad de tests ni lo que verifican: el diff solo toca las líneas de título y agrega un comentario con la frase vieja.

## Failures
(none)

## Skips
(none)

## Notas
El cierre anterior registró corridas con la máquina cargada (load average ~70) que fallaron por `Timeout waiting for worker to respond`. Esta se corrió con load average ~4 y salió en verde a la primera.
