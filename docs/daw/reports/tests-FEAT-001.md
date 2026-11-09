# Test run FEAT-001

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida en el re-cierre de CODE sobre `32250e3` más las correcciones del SAST (sin commitear), el 2026-11-09.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 130 |
| Passed | 130 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 90.44% |
| Branch coverage | 86.86% |
| Function coverage | 94.48% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run typecheck` (`tsc -b`) — clean, 0 errors; no hay linter configurado en el repo (ni ESLint, Biome ni oxlint) |

Detalle: 28 archivos de test (24 de `server`, 4 de `web`): 112 tests de server y 18 de web. Statements 90.14% (512/568), lines 464/513, branches 238/274, functions 137/145. `AGENTS.md` no declara un piso de cobertura, así que rige el del método.

## Failures
(none)

## Skips
(none)

## Notas
Corridas previas de este re-cierre, con la máquina a un load average de ~70, terminaron con 2 y 5 tests de `web/` en rojo por `[vitest-pool-runner]: Timeout waiting for worker to respond` (el worker de jsdom no llegó a arrancar); el código de `web/` no cambió en estas correcciones. Se descartaron y se repitió la corrida completa; este reporte describe solo la corrida en verde.
