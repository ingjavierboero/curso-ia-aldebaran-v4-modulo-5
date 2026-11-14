# Threat model FEAT-003: Chequeo de salud de la app y los jobs

| Field | Value |
|-------|-------|
| Ticket | FEAT-003 |
| Spec | docs/daw/specs/spec-FEAT-003.md |
| Tier | FEATURE |
| Date | 2026-11-14 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/infrastructure/http/routes/health.ts` (GET/HEAD `/api/health`) | Block 3 |
| `server/src/application/auth/PeekSession.ts` | Block 2 |
| `server/src/infrastructure/db/SqliteDatabaseProbe.ts` | Block 2 |
| `server/src/application/health/RunTrackedJob.ts` y la tabla `job_runs` | Block 1, Block 2 |
| `web/src/components/HealthBanner.tsx` y `web/src/api/healthApi.ts` | Block 4 |

## Trust boundaries
- Internet (monitor externo o cualquier cliente sin sesión) → API: `GET`/`HEAD /api/health` es la única ruta nueva que cruza sin sesión.
- Navegador con sesión → API: la cookie `aldebaran_sid` decide si la respuesta lleva detalle.
- API → base SQLite: el sondeo abre una segunda conexión de solo lectura al mismo archivo.
- Proceso automático (futuro) → tabla `job_runs`: los jobs escriben sus corridas a través de `RunTrackedJob`.

## STRIDE analysis
### `server/src/infrastructure/http/routes/health.ts` (GET/HEAD `/api/health`)
- **Spoofing:** una cookie falsa, vencida o de un usuario Inactivo se trata como anónima (`PeekSession` devuelve `null`): no da detalle y no responde 401 (R-01).
- **Tampering:** la ruta no recibe body ni parámetros; solo lee la cookie, sin escribir nada.
- **Repudiation:** la consulta de salud no es una acción de usuario y no se loguea en cada poll; una sesión inválida no genera `session_rejected` para no inundar el log (R-05).
- **Information Disclosure:** sin sesión la respuesta es solo `{status}` (NFR-02): sin nombres de procesos, horarios, errores ni versiones. El detalle solo va con una sesión válida (R-02).
- **Denial of Service:** cada consulta puede bloquear el event loop hasta 500 ms si la base está bloqueada; un atacante sin sesión podría encadenar consultas (R-03).
- **Elevation of Privilege:** la ruta se agrega a `PUBLIC_ROUTES` como coincidencia exacta de `GET /api/health` y `HEAD /api/health`; cualquier variante sigue exigiendo sesión (R-04).

### `server/src/application/auth/PeekSession.ts`
- **Spoofing:** aplica las mismas reglas que `AuthenticateSession` (sesión inexistente, vencida, usuario inexistente o Inactivo) a través de una función compartida, para que no diverjan.
- **Tampering:** es estrictamente de solo lectura: no llama a `touch` ni borra sesiones (R-06).
- **Repudiation:** no registra eventos; el login y el logout siguen siendo los que se loguean.
- **Information Disclosure:** devuelve `PublicUser` (sin hash) o `null`; nunca expone el token.
- **Denial of Service:** una búsqueda por hash del token con índice único; costo constante.
- **Elevation of Privilege:** si renovara la sesión, el polling del banner la mantendría viva para siempre y anularía el vencimiento por inactividad de 24 h; por eso no la renueva (R-06).

### `server/src/infrastructure/db/SqliteDatabaseProbe.ts`
- **Spoofing:** no aplica: no hay identidades, solo una conexión local al archivo de la app.
- **Tampering:** la conexión se abre `readonly`, así que el sondeo no puede escribir (ADR-005).
- **Repudiation:** no aplica: un sondeo no es una acción atribuible.
- **Information Disclosure:** el error de la base se convierte en "no disponible"; el mensaje de SQLite no llega a la respuesta (R-02).
- **Denial of Service:** `busy_timeout = 500` acota la espera; sin él, una base bloqueada colgaría la consulta 5 s (R-03).
- **Elevation of Privilege:** no aplica: no ejecuta nada derivado de la solicitud.

### `server/src/application/health/RunTrackedJob.ts` y la tabla `job_runs`
- **Spoofing:** solo acepta nombres registrados en `JobRegistry`; un nombre desconocido se rechaza antes de correr.
- **Tampering:** la corrida se graba con un INSERT parametrizado de Drizzle; `outcome` tiene un CHECK en la base.
- **Repudiation:** cada corrida queda con inicio, fin y resultado, que es justamente el registro de auditoría de los jobs.
- **Information Disclosure:** no se guarda el mensaje de error del job (puede traer datos de clientes); solo `ok` o `error` (R-07).
- **Denial of Service:** la tabla crece sin límite (depuración fuera de alcance); el índice `(job_name, outcome, finished_at)` mantiene constante la consulta de la última corrida (R-08).
- **Elevation of Privilege:** si fallara la grabación de la corrida, el error del job se relanza igual: un fallo de registro no oculta un fallo del job.

### `web/src/components/HealthBanner.tsx` y `web/src/api/healthApi.ts`
- **Spoofing:** el banner solo se muestra dentro de la pantalla principal, que ya exige sesión.
- **Tampering:** los nombres de procesos que vienen del server se renderizan como texto por React, sin HTML (R-09).
- **Repudiation:** no aplica: es solo lectura.
- **Information Disclosure:** el detalle solo llega con sesión; el banner no lo persiste.
- **Denial of Service:** polling cada 60 s, limpiado al desmontar; un error de red no reintenta en bucle.
- **Elevation of Privilege:** un 200 sin detalle (sesión perdida) no fuerza nada: la navegación a `/login` la sigue decidiendo el flujo de auth de FEAT-001.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| cookie `aldebaran_sid` | credentials | solo el hash SHA-256 del token en `sessions` (FEAT-001) | HTTPS, cookie `Secure`, `HttpOnly`, `SameSite=Strict` |
| estado general de salud | public | no se guarda | HTTPS |
| nombres de procesos y horarios de corridas | internal | tabla `job_runs` en SQLite | HTTPS, solo con sesión |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | Una cookie inválida en `/api/health` devuelve 401 y borra la cookie del usuario, o da detalle | S | M | M | `PeekSession` devuelve `null` y la ruta responde como anónima; test de cookie inválida |
| R-02 | La respuesta pública filtra nombres, horarios o errores internos | I | M | M | Respuesta sin sesión limitada a `{status}`; test que compara el body exacto |
| R-03 | Consultas encadenadas sin sesión bloquean el event loop con una base bloqueada | D | L | M | `busy_timeout = 500` en una conexión dedicada (ADR-005); sin la base, GetHealth no consulta `job_runs` |
| R-04 | Agregar la ruta pública debilita el deny-by-default | E | L | H | Coincidencia exacta de método y ruta; tests de variantes (`/api/health/`, `POST`, mayúsculas) |
| R-05 | Cada poll con sesión inválida inunda el log | R | M | L | La ruta de salud no pasa por el middleware y no loguea `session_rejected` |
| R-06 | El polling renueva la sesión y anula el vencimiento por inactividad | E | H | H | `PeekSession` no llama a `touch`; test que verifica que `last_activity_at` no cambia |
| R-07 | Un mensaje de error de job con datos de clientes queda en la base y se muestra | I | M | M | Solo se guarda `ok`/`error`, nunca el mensaje |
| R-08 | La tabla `job_runs` crece y la consulta de salud se vuelve lenta | D | M | L | Índice `(job_name, outcome, finished_at)` y consultas por "última" corrida |
| R-09 | Un nombre de proceso inyecta HTML en el banner | T | L | M | Render como texto de React; los nombres los define el código, no el usuario |

## Supply chain
No se agregan dependencias. Se usan `better-sqlite3` (ya presente) para la conexión del sondeo y
antd `Alert` (ya presente) para el banner.

## Availability
El vector de DoS es R-03, acotado por el `busy_timeout` de 500 ms en la conexión del sondeo. La
consulta pública no hace trabajo pesado: un sondeo y, si la base está disponible, una consulta
indexada por proceso registrado. Un límite de solicitudes queda fuera de alcance, como en FEAT-001.
