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

## Block 2 — Dominio y casos de uso

- El hash dummy de R-02 entra a `Login` por constructor (`dummyHash: string`); lo calcula el composition root al arrancar (Block 4, `main.ts`) — Javier Boero — 2026-11-04 — Block 2
- `Login` no aplica `PasswordPolicy`: aplicarla devolvería `WeakPassword`/400 en lugar de 401 y filtraría información. El tope de 1024 caracteres en el login se valida en `POST /api/auth/login` (Block 4, spec:209); la revisión de Block 4 debe comprobarlo — Javier Boero — 2026-11-04 — Block 2
- Email con formato inválido en `Login` lanza `InvalidEmail` (no `InvalidCredentials`), según la sección de validación de entrada de la spec; Block 4 lo mapea a HTTP — Javier Boero — 2026-11-04 — Block 2
- `Logout` y `AuthenticateSession` son síncronos (todos sus puertos lo son); `Login` y `RegisterFirstAdmin` son `async` (por `PasswordHasher`) — Javier Boero — 2026-11-04 — Block 2
- El pre-check de `RegisterFirstAdmin` se hace con `uow.run(r => r.users.countAll())`, de modo que el caso de uso depende solo de `uow`, `hasher`, `ids` y `clock`; costo aceptado: una transacción IMMEDIATE breve de solo lectura — Javier Boero — 2026-11-04 — Block 2
- La validación del nombre es `parseUserName` en `server/src/domain/user/User.ts` (`InvalidName` en `domain/user/errors.ts`); helper de tests `server/test/support/authContext.ts` (no listado en la spec) que arma los casos de uso sobre los dobles; las entidades guardan fechas como `Date` y la conversión a ISO 8601 queda para los repositorios de Block 3 — Javier Boero — 2026-11-04 — Block 2
- Ronda 2 de revisión: las entidades copian las fechas `Date` que reciben, y `InMemoryUnitOfWork` revierte los cambios si `fn` lanza (igual que la transacción SQLite) — Javier Boero — 2026-11-04 — Block 2
- Deuda conocida aceptada (WARN de arquitectura sin corregir): la firma `UnitOfWork.run<T>` no impide una `fn` async en compilación (la frenan el runtime y el doble); `InMemorySessionRepository` no simula la FK `sessions.user_id` ni el `ON DELETE CASCADE`; código sin uso en dobles de test y en `Email.equals`/`toString` — Javier Boero — 2026-11-04 — Block 2
- Deuda conocida aceptada (WARN de arquitectura de la ronda 2, resuelto en parte): las fechas `Date` de `User`/`Session` son campos `readonly` públicos, así que un lector todavía puede mutarlas (`setTime`), y los dobles en memoria devuelven la instancia guardada. Impacto bajo: nada en `src/` muta fechas y los repositorios SQLite de Block 3 arman entidades nuevas en cada lectura. Alternativa descartada por ahora: getters que devuelvan copias o epoch ms — Javier Boero — 2026-11-04 — Block 2
