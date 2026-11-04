# Decisiones FEAT-001 (aprobadas fuera de la spec)

Formato: decisión — quién la aprobó — fecha — bloque.

## Block 1 — Scaffolding del monorepo y base de datos

- `vitest.config.ts` en la raíz con `test.projects: ['server','web']` en lugar del `vitest.workspace.ts` que nombra la spec: Vitest 5 (instalado 5.1.0) eliminó los workspace files; la intención de la spec (correr los proyectos server y web) se cumple igual — Javier Boero — 2026-11-04 — Block 1
- `tsconfig.json` raíz (solution file con references a `server` y `web`, ambos `composite`) para que `tsc -b` (script `typecheck`) compile los dos proyectos; no estaba en la lista de archivos — Javier Boero — 2026-11-04 — Block 1
- `web/` mínimo (`package.json`, `tsconfig.json`, `vitest.config.ts` con `passWithNoTests`) hasta Block 5, que lo completa y unifica la config de Vitest con `vite.config.ts` — Javier Boero — 2026-11-04 — Block 1
- La raíz del repo se detecta subiendo desde `import.meta.url` hasta el `package.json` que declara `workspaces` (helper `findUp`/`isWorkspaceRoot` en `server/src/infrastructure/db/paths.ts`); `resolveDatabasePath` acepta un parámetro opcional `moduleUrl` para poder testearlo — Javier Boero — 2026-11-04 — Block 1
- Imports relativos con extensión `.js` (convención de `moduleResolution: nodenext`) — Javier Boero — 2026-11-04 — Block 1
- `.gitignore` agrega `*.tsbuildinfo` y `.env.*` (con excepción `!.env.example`) además de lo que lista la spec — Javier Boero — 2026-11-04 — Block 1
- Endurecimiento de permisos (R-08): el archivo de la base y sus `-wal`/`-shm` quedan siempre en 0600; el directorio queda en 0700 solo si `createDb` lo creó o si es el `data/` por defecto del repo — un directorio existente indicado por `DATABASE_PATH` no se toca — Javier Boero — 2026-11-04 — Block 1
