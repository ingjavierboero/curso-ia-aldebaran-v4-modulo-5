# Decisiones de implementación — FEAT-003

Ticket en autonomía `minimal`: estas decisiones las tomó el implementador dentro del alcance del spec, las aprobaron las revisiones de cada bloque y se informaron al usuario.

- `JobRun` lleva un `id` (PK de `job_runs`, como `Session` y `User`); quien graba la corrida lo genera con `IdGenerator` — revisión del Block 1 — 2026-11-14 — Block 1
- `lastRunAt` es el `finishedAt` de la última corrida — revisión del Block 1 — 2026-11-14 — Block 1
- Los nombres de proceso repetidos se comparan exactos (distinguiendo mayúsculas) después del trim — revisión del Block 1 — 2026-11-14 — Block 1
- El atraso es estricto: con exactamente 2 intervalos no está atrasado, con más sí (FR-06 "más de 2"); `intervalMs` rechaza NaN, Infinity y decimales — revisión del Block 1 — 2026-11-14 — Block 1
- La última corrida se resuelve con búsquedas por el índice `(job_name, outcome, finished_at)` y el desempate (igual `finished_at` → `started_at` mayor → `id` mayor) se hace en código, para no ordenar con TEMP B-TREE ni cambiar el índice del spec — revisión del Block 1 — 2026-11-14 — Block 1
- La migración conserva el nombre que generó drizzle-kit (`0001_left_toad.sql`); el spec acepta `0001_*` — revisión del Block 1 — 2026-11-14 — Block 1
