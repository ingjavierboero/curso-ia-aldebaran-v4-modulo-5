# Decisiones de implementación — FEAT-003

Ticket en autonomía `minimal`: estas decisiones las tomó el implementador dentro del alcance del spec, las aprobaron las revisiones de cada bloque y se informaron al usuario.

- `JobRun` lleva un `id` (PK de `job_runs`, como `Session` y `User`); quien graba la corrida lo genera con `IdGenerator` — revisión del Block 1 — 2026-11-14 — Block 1
- `lastRunAt` es el `finishedAt` de la última corrida — revisión del Block 1 — 2026-11-14 — Block 1
- Los nombres de proceso repetidos se comparan exactos (distinguiendo mayúsculas) después del trim — revisión del Block 1 — 2026-11-14 — Block 1
- El atraso es estricto: con exactamente 2 intervalos no está atrasado, con más sí (FR-06 "más de 2"); `intervalMs` rechaza NaN, Infinity y decimales — revisión del Block 1 — 2026-11-14 — Block 1
- La última corrida se resuelve con búsquedas por el índice `(job_name, outcome, finished_at)` y el desempate (igual `finished_at` → `started_at` mayor → `id` mayor) se hace en código, para no ordenar con TEMP B-TREE ni cambiar el índice del spec — revisión del Block 1 — 2026-11-14 — Block 1
- La migración conserva el nombre que generó drizzle-kit (`0001_left_toad.sql`); el spec acepta `0001_*` — revisión del Block 1 — 2026-11-14 — Block 1
- `RunTrackedJob.run` devuelve el valor de la función del job; si el job anduvo bien y falla la grabación, rechaza con `JobRunNotRecorded` (con `cause`), para que un futuro scheduler no reintente un job no idempotente por un error de registro — revisión del Block 2 — 2026-11-14 — Block 2
- `GetHealth` trata un error al leer `job_runs` después de un sondeo exitoso como base no disponible (degradado), para cubrir el bloqueo entre el sondeo y la lectura — revisión del Block 2 — 2026-11-14 — Block 2
- La validación común de sesión vive en `application/auth/resolveSession.ts`, compartida por `AuthenticateSession` y `PeekSession` — revisión del Block 2 — 2026-11-14 — Block 2
- `SqliteDatabaseProbe` abre su conexión en el primer sondeo (no en el arranque), la descarta ante un error y la reabre en el siguiente; usa la opción `timeout: 500` de better-sqlite3 (equivale a `busy_timeout`). Difiere del texto de ADR-005 ("se crea en el composition root") solo en el momento de apertura; el composition root la crea y la cierra al terminar — revisión del Block 2 — 2026-11-14 — Block 2
