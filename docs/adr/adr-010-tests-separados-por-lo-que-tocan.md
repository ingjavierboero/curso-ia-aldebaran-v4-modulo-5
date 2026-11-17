# ADR-010: Tests del server separados en unit e integration según lo que tocan

| Field | Value |
|-------|-------|
| Date | 2026-11-17 |
| Ticket | FEAT-017a |
| Status | Accepted |

## Context
El CI pasó a correr una etapa unit y una integration, cada una con su carpeta
(`docs/daw/prd/prd-FEAT-017a.md`). Los tests del server estaban ordenados por capa DDD
(`domain`, `application`, `infrastructure`, `http`, `support`, `tooling`), y la capa no decía si un
test abría SQLite: había tests de `application` y contract tests de `support` que usaban la base real.

## Options considered

### Option 1: mapear cada etapa a las carpetas de capa existentes
- **Pros:** diff mínimo, sin renombres ni imports que tocar.
- **Cons:** las carpetas no se llamaban unit ni integration; las carreras de `application` y los contract tests con SQLite caían en la etapa equivocada o obligaban a listas de excepciones en la config.

### Option 2: mover los tests a `unit/` e `integration/` según lo que tocan, conservando la capa adentro
- **Pros:** cada etapa corre una carpeta literal; el criterio (abre SQLite, levanta la app HTTP o usa red) se puede verificar con un test que lee los imports.
- **Cons:** 98 archivos movidos y sus imports relativos ajustados; las rutas viejas que nombran docs históricos quedaron desactualizadas.

### Option 3: separar por capa, estricto (`domain` + `application` como unit)
- **Pros:** regla simple de explicar.
- **Cons:** tests que abren la base corrían en la etapa unit.

## Decision
Se eligió la opción 2 (decisiones D-01 y D-02 del usuario). En Vitest hubo un proyecto por tipo,
`server-unit` y `server-integration`, cada uno en su propio archivo de config, más `web` sin cambios;
`testLayout.test.ts` fijó el criterio, que los `include` no se pisaran y que ninguno quedara vacío.

## Consequences
- Un test nuevo del server va en `server/test/unit/<capa>/` o en `server/test/integration/<capa>/`; los helpers siguen en `server/test/support/`.
- `server/vitest.config.ts` dejó de existir; los configs son `server/vitest.unit.config.ts` y `server/vitest.integration.config.ts`.
- `npm run test:unit` y `npm run test:integration` corren cada tipo; `npm test` sigue corriendo todos.
- El criterio se apoya en una lista de imports y llamadas vetadas en `unit/`; una forma nueva de abrir la base sin esos nombres quedaría sin detectar hasta que se sume a la lista.
