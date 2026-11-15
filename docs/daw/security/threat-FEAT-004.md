# Threat model FEAT-004: Banner de salud con sesión inválida y errores de lectura visibles

| Field | Value |
|-------|-------|
| Ticket | FEAT-004 |
| Spec | docs/daw/specs/spec-FEAT-004.md |
| Tier | FEATURE |
| Date | 2026-11-14 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/application/health/GetHealth.ts` | Block 1 |
| `server/src/infrastructure/logging/healthEventLog.ts` | Block 2 |
| `server/src/infrastructure/http/routes/health.ts` | Block 2 |
| `web/src/components/HealthBanner.tsx` | Block 3 |

## Trust boundaries
- Navegador → API: `GET /api/health` (pública, cookie `aldebaran_sid` opcional) y `GET /api/auth/session` (exige sesión) cruzan de un cliente no confiable al server.
- API → base SQLite: `GetHealth` lee `job_runs`, cuyas filas pueden traer datos ilegibles (fecha inválida) que vuelven a cruzar hacia la aplicación.
- Server → log (stdout): el adaptador `healthEventLog.ts` escribe un registro que lee quien opera el sistema, fuera de la app.

## STRIDE analysis
### `server/src/application/health/GetHealth.ts`
- **Spoofing:** no decide identidad; la sesión la valida `PeekSession` en la ruta, sin cambios.
- **Tampering:** una fila de `job_runs` alterada (fecha ilegible) ya no degrada la base entera: queda acotada a ese proceso con `readFailed` (R-01).
- **Repudiation:** cada lectura fallida queda registrada vía `HealthEventLog.jobReadFailed` con nombre del proceso, tipo de error y hora (FR-06).
- **Information Disclosure:** al puerto solo llegan `jobName` y `errorType` (`err.name`); `err.message`, que puede traer el valor guardado, nunca se pasa (R-02).
- **Denial of Service:** el `try/catch` por proceso y el `try/catch` alrededor del log garantizan que `execute()` no lance: un dato corrupto o un log roto no tiran `GET /api/health` a 500 (R-03).
- **Elevation of Privilege:** no hay autorización en este componente; el detalle sigue saliendo solo con sesión válida.

### `server/src/infrastructure/logging/healthEventLog.ts`
- **Spoofing:** no recibe entrada externa; lo llama solo `GetHealth`.
- **Tampering:** `job` sale de `JobRegistry` (nombres fijados por el composition root) y se serializa con `JSON.stringify`, así que un nombre no puede inyectar líneas de log falsas (R-04).
- **Repudiation:** el registro lleva `event`, `job`, `errorType` y `at` en una línea JSON por evento.
- **Information Disclosure:** el registro no lleva token, email ni IP (NFR-03); el puerto no los recibe.
- **Denial of Service:** con un dato corrupto cada consulta de salud escribe una línea; con el monitor y el banner (1 por minuto por pantalla) el volumen es acotado. Rate limit del endpoint queda fuera de alcance (hallazgo 5 de la revisión).
- **Elevation of Privilege:** no aplica; no cambia permisos ni ejecuta nada con los datos.

### `server/src/infrastructure/http/routes/health.ts`
- **Spoofing:** sin cambios: el detalle exige una sesión válida por `PeekSession`; sin ella, solo `{ status }`.
- **Tampering:** la respuesta suma un booleano calculado en el server; el cliente no puede influirlo.
- **Repudiation:** sin cambios respecto de FEAT-003; los fallos de lectura quedan en el log del componente anterior.
- **Information Disclosure:** el detalle con sesión suma solo `readFailed: boolean`; la respuesta anónima sigue siendo `{ status }` (NFR-02, R-02).
- **Denial of Service:** un proceso con lectura fallida responde 503 en lugar de 500; la ruta no lanza.
- **Elevation of Privilege:** sin cambios en `PUBLIC_ROUTES`; ninguna ruta nueva.

### `web/src/components/HealthBanner.tsx`
- **Spoofing:** la confirmación usa `GET /api/auth/session`, la ruta autenticada de siempre; el banner no decide identidad, solo reacciona a 200/401/5xx.
- **Tampering:** la respuesta de `/api/health` se valida con `isHealthJob` (incluido `readFailed`); una forma inválida se descarta.
- **Repudiation:** no aplica en el cliente; la confirmación queda en los logs de sesión del server como cualquier otra.
- **Information Disclosure:** los nombres de procesos se muestran como texto (React escapa), nunca como HTML; solo a usuarios con sesión.
- **Denial of Service:** la confirmación ocurre como máximo una vez por consulta "degradado" sin detalle (NFR-01); con la base bloqueada cada confirmación puede tardar ~5 s en el server (R-05).
- **Elevation of Privilege:** un 401 lleva al login por el camino común (`setAnon` + `unauthorizedHandler`); el banner no muestra nada a una sesión perdida.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| cookie `aldebaran_sid` (token de sesión) | credentials | solo su hash en `sessions` (FEAT-001) | HTTPS en producción, cookie `HttpOnly`, `Secure`, `SameSite` (FEAT-001) |
| nombre del proceso, `readFailed`, `errorType` | public (interno de operación) | log del server en stdout, sin datos personales | HTTPS en producción; solo con sesión válida en la respuesta |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | una fila corrupta de `job_runs` hace ver la base entera como caída | T | L | M | `try/catch` por proceso en `GetHealth`; solo ese proceso queda `readFailed` (Block 1) |
| R-02 | el texto del error filtra el valor guardado al log o a la respuesta | I | M | M | solo `err.name` llega al puerto; `err.message` prohibido; la respuesta suma solo un booleano (Block 1, Block 2) |
| R-03 | un log que lanza convierte `GET /api/health` en 500 | D | L | M | contrato "nunca lanza" en el puerto, `try/catch` en el adaptador y alrededor de la llamada (Block 1, Block 2) |
| R-04 | inyección de líneas en el log vía nombre de proceso | T | L | L | nombres fijados en código por el composition root; registro serializado con `JSON.stringify` |
| R-05 | la confirmación de sesión con la base bloqueada retiene el event loop ~5 s | D | L | M | una confirmación por consulta degradada sin detalle (NFR-01); el bloqueo de la conexión compartida queda como hallazgo 4 de la revisión, fuera de alcance |

## Supply chain
Sin dependencias nuevas: se usan `express`, `better-sqlite3`/Drizzle, React y antd ya presentes.

## Availability
Los vectores de DoS son R-03 (mitigado) y R-05 (acotado por NFR-01). El rate limit de `/api/health`
queda fuera de alcance de este ticket (hallazgo 5 de la revisión del PR #6).
