# Test run FEAT-003

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-14 en el cierre de CODE, sobre `b3c8889` (los 4 bloques commiteados). Mismo comando de cobertura que FEAT-001 y FEAT-002.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 210 |
| Passed | 210 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 91.44% |
| Branch coverage | 88.19% |
| Function coverage | 94.76% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

Detalle:
- 41 archivos de test; FEAT-003 suma 65 tests (de 145 a 210), entre ellos los 32 Required tests del spec.
- El test de base bloqueada con cookie toma un lock real desde otra conexión y corre en menos de 1 s.

## Failures
(none)

## Skips
(none)
