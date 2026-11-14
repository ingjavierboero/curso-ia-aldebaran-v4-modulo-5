# SAST FEAT-003

| Field | Value |
|-------|-------|
| Ticket | FEAT-003 |
| Tools | revisión del diff `main...HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-14 |

Alcance: el diff de `feat/FEAT-003-chequeo-de-salud` contra `main`: `server/src/domain/health/*`, `server/src/application/health/*`, `server/src/application/auth/{PeekSession,resolveSession,AuthenticateSession}.ts`, `server/src/infrastructure/db/{schema,DrizzleJobRunRepository,SqliteDatabaseProbe}.ts`, la migración `0001_left_toad.sql`, `server/src/infrastructure/http/{routes/health,authMiddleware,app}.ts`, `server/src/main.ts` y `web/src/{api/healthApi,components/HealthBanner,pages/HomePage}.tsx`.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos en el diff; `.env` sigue en `.gitignore` |
| F-SAST-02 | ✅ | todas las consultas usan el query builder de Drizzle con parámetros; el único `sql` template (`server/src/infrastructure/db/DrizzleJobRunRepository.ts:58`) interpola una subconsulta de Drizzle, no texto; el sondeo ejecuta una consulta constante (`SELECT 1 FROM sqlite_master LIMIT 1`) |
| F-SAST-03 | ✅ | nada del diff de producción llega a exec/spawn |
| F-SAST-04 | ✅ | sin `eval`, `new Function` ni deserialización insegura; el body de `/api/health` se valida con type guards en `web/src/api/healthApi.ts` |
| F-SAST-05 | ✅ | la ruta del archivo del sondeo sale de `resolveDatabasePath()` en el composition root, no de la solicitud |
| F-SAST-06 | ✅ | los nombres de procesos se renderizan como texto de React (sin `dangerouslySetInnerHTML`); test con payload `<img onerror>` (R-09) |
| F-SAST-07 | ✅ | sin fetch saliente nuevo en el server; el banner consulta solo su propio origen |
| F-SAST-08 | ✅ | sin cambios en criptografía; `PeekSession` usa el mismo hash SHA-256 del token que FEAT-001 |
| F-SAST-09 | ✅ | sin flags de debug nuevos |
| F-SAST-10 | ✅ | el único log nuevo (`server/src/infrastructure/http/routes/health.ts:64`, `health_session_check_failed`) lleva solo evento y fecha: sin token, IP ni texto del error; `job_runs` no guarda el mensaje de error del job (R-07) |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | `/api/health` es solo lectura (GET/HEAD) y no cambia estado; la cookie de sesión sigue `SameSite=Strict` |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilidades |
| F-SAST-14 | ✅ | `JobDefinition` valida nombre (1–64) e intervalo (entero > 0); la cookie inválida se trata como anónima; variantes de la ruta no llegan al handler (router estricto + guarda exacta) |
| F-SAST-15 | ✅ | sin la base, la respuesta es `{status:"degradado"}` (503) y el texto de SQLite no sale de `SqliteDatabaseProbe`; un fallo de `PeekSession` responde la versión anónima, nunca 500 con detalle |
| F-SAST-16 | ✅ | sin dependencias nuevas en este ticket |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

Notas de diseño de seguridad verificadas (no son hallazgos): `PeekSession` no renueva ni borra sesiones (R-06, test que confirma que la sesión vence igual); `GET`/`HEAD /api/health` son las únicas rutas públicas nuevas y con coincidencia exacta (R-04); con la base no disponible no se valida la sesión, lo que evita bloquear el server ~5 s (R-10).

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
