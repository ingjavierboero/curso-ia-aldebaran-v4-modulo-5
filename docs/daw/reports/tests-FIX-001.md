# Test run FIX-001

Suite completa del monorepo (proyectos `server` y `web` de `vitest.config.ts`), corrida el 2026-11-11 en el cierre de CODE de FIX-001, sobre `9e89cf5` más el cambio del título y el test de regresión.

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (cobertura con @vitest/coverage-v8 5.1.0) |
| Command | `npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.include='server/src/**' --coverage.include='web/src/**' --coverage.exclude='**/*.test.*' --coverage.exclude='web/src/test/**'` |
| Total | 131 |
| Passed | 131 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 90.44% |
| Branch coverage | 86.49% |
| Function coverage | 94.48% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run typecheck` (`tsc -b`) — clean, 0 errors; no hay linter configurado en el repo (ni ESLint, Biome ni oxlint) |

Detalle:
- 28 archivos de test y 131 tests: los 130 de FEAT-001 más `test_login_titulo_nombra_aldebaran`.
- Evidencia de TDD: antes del cambio, el test nuevo falló con `Unable to find role="heading" and name "Iniciar sesión en Aldebaran"`. Con el cambio en `web/src/pages/LoginPage.tsx:38`, pasa.
- La cobertura es la misma que en FEAT-001: el cambio es un literal, no agrega ramas ni funciones.

## Failures
(none)

## Skips
(none)
