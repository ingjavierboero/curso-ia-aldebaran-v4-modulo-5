# Test run FEAT-005

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-15 en el cierre de CODE, sobre `2d67ac1` (Block 1/1). Mismo comando de cobertura que FEAT-001 a FEAT-004.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 244 |
| Passed | 244 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 91.66% |
| Branch coverage | 88.75% |
| Function coverage | 94.9% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

Detalle:
- 45 archivos de test; la suite pasa de 236 a 244 tests (+8): los 7 Required tests del spec en `server/test/tooling/dependabot.test.ts` más uno estructural (versión 2 y una entrada por ecosistema).
- La cobertura mide `server/src` y `web/src`; este ticket no agrega código de producto ahí (solo `.github/dependabot.yml` y su test), por eso los porcentajes no cambian respecto de FEAT-004.

## Failures
(none)

## Skips
(none)
