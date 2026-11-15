# Test run FEAT-009

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-15 en el cierre de CODE sobre `7e7f65e` (los 3 bloques commiteados, sobre la rama de FEAT-007). Mismo comando de cobertura que FEAT-001 a FEAT-007.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 396 |
| Passed | 396 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 94.3% |
| Branch coverage | 91.35% |
| Function coverage | 95.97% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

Detalle:
- 61 archivos de test; la suite pasa de 366 (FEAT-007) a 396 tests (+30): los 26 Required tests de la spec (10 del Block 1, 13 del Block 2, 3 del Block 3) más 4 de apoyo pedidos en las revisiones (borde exacto de la ventana, supervivencia del barrido, body inválido del primer Admin, email de la sesión en el bloqueo del cambio).
- TDD: Blocks 1 y 2 con esqueleto y 10/10 y 13/13 rojos por aserción; Block 3 sin cambios de producto, capacidad de fallar probada rompiendo las pantallas.

## Failures
(none)

## Skips
(none)
