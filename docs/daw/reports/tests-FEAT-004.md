# Test run FEAT-004

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-14 en el cierre de CODE, sobre `45be6ba` (los 3 bloques). Mismo comando de cobertura que FEAT-001 a FEAT-003.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 236 |
| Passed | 236 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 91.66% |
| Branch coverage | 88.99% |
| Function coverage | 94.9% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

Detalle:
- 44 archivos de test; la suite pasa de 211 a 236 tests (+25); incluye los 25 Required tests del spec (7 del Block 1, 7 del Block 2, 11 del Block 3, uno de ellos `test_home_muestra_banner_con_estado_degradado`, que ya existía y se ajustó) más un test auxiliar de `parseIsoDate`, y tests de FEAT-003 ajustados a `readFailed`.

## Failures
(none)

## Skips
(none)
