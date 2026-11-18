# ADR-011: Pruebas e2e con Playwright sobre el build de la web y una base temporal

| Field | Value |
|-------|-------|
| Date | 2026-11-17 |
| Ticket | FEAT-017b |
| Status | Accepted |

## Context
FEAT-017b sumó una prueba de punta a punta en navegador y un job `e2e` al CI
(`docs/daw/prd/prd-FEAT-017b.md`). Había que decidir cómo levantar la web, cómo garantizar que la
prueba nunca escribiera en `data/aldebaran.db` (el server cae a esa base si `DATABASE_PATH` está
vacío) y cómo verificar la config desde los tests de Vitest sin importar Playwright en ellos.

## Options considered

### Option 1: Vite en modo dev, config de Playwright con los valores escritos adentro
- **Pros:** sin build previo; la config queda en un solo archivo.
- **Cons:** en un runner frío Vite pre-optimiza dependencias (antd) y puede recargar la página a mitad de la prueba; la config no se puede importar desde Vitest (choque de `expect` y `rootDir` de `server/tsconfig.json`) y su `mkdtemp` correría en cada test unitario.

### Option 2: `vite build` + `vite preview`, valores en un módulo de datos puros y config fail-closed
- **Pros:** la web que se prueba es el build; el preview hereda el proxy `/api` de `server.proxy`; `e2e/e2eSettings.ts` no importa Playwright y los tests de tooling lo cargan sin efectos; la config se niega a arrancar si la base no queda bajo `os.tmpdir()`.
- **Cons:** el arranque suma el build de la web (~20–40 s); dos archivos en lugar de uno.

## Decision
Se eligió la opción 2. Además: `reuseExistingServer: false` en las dos entradas, para no tomar nunca
un server de desarrollo; credenciales de prueba aleatorias por corrida; evidencia (`trace` y
`screenshot`) solo en falla, en `test-results/e2e/`, que el job sube con `if: failure()` y 7 días de
retención; `globalTimeout` de 6 minutos para que Playwright corte antes que el `timeout-minutes: 10`
del job (si GitHub cancela el job, el paso de upload no corre). La carpeta es `e2e/` en la raíz, junto
a su runner, con el mismo criterio que ADR-010.

## Consequences
- `npm run test:e2e` corre la prueba localmente; la primera vez hace falta `npx playwright install chromium`.
- `npm test` y los proyectos de Vitest no levantan `e2e/`.
- `ci.test.ts` admite un único `if:` de paso, `failure()` en el upload del job `e2e`, y cuenta 9 `uses:`.
- El ruleset `proteger-main` se configura a mano en GitHub para exigir el check `e2e`.
- Chromium se descarga del CDN de Playwright, fuera del lockfile; lo fija la versión exacta de `@playwright/test`.
