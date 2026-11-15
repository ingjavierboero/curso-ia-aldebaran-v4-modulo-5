# Test run FEAT-006

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-15 en el re-cierre de CODE tras la vuelta desde VERIFY (W-2), sobre `063bda1` (los 3 bloques más 2 tests que fijan `requireActor` en `UpdateUser` y `ReactivateUser`). Mismo comando de cobertura que FEAT-001 a FEAT-005.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 333 |
| Passed | 333 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 93.74% |
| Branch coverage | 90.73% |
| Function coverage | 96.07% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

Detalle:
- 56 archivos de test; la suite pasa de 244 a 333 tests (+89): los 53 Required tests del spec (22 del Block 1, 19 del Block 2, 12 del Block 3) más tests de apoyo (entidad `User`, repositorios Drizzle contra SQLite, cliente HTTP, layout y carreras de la pantalla de usuarios).
- Vuelta desde VERIFY (W-2): `test_update_user_actor_desactualizado_rechazado` y `test_reactivate_user_actor_desactualizado_rechazado`; ambos fallaron por aserción ("expected function to throw an error, but it didn't") con `requireActor` comentado, y pasan con el código restaurado.

## Failures
(none)

## Skips
(none)
