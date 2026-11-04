# Threat model FEAT-001: Login de usuarios (inicio/cierre de sesión y registro del primer Admin)

| Field | Value |
|-------|-------|
| Ticket | FEAT-001 |
| Spec | docs/daw/specs/spec-FEAT-001.md |
| Tier | FEATURE |
| Date | 2026-11-04 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/infrastructure/http/routes/auth.ts` (+ `application/auth/Login.ts`, `Logout.ts`) | Block 2, Block 4 |
| `server/src/infrastructure/http/routes/setup.ts` (+ `application/auth/RegisterFirstAdmin.ts`, `infrastructure/db/DrizzleUnitOfWork.ts`) | Block 2, Block 3, Block 4 |
| `server/src/infrastructure/http/authMiddleware.ts` (+ `application/auth/AuthenticateSession.ts`, `sessionCookie.ts`, `requireJson.ts`) | Block 2, Block 4 |
| `server/src/infrastructure/db/schema.ts` (tablas `users` y `sessions`, archivo `data/aldebaran.db`) | Block 1, Block 3 |
| `server/src/infrastructure/auth/Argon2PasswordHasher.ts` y `CryptoSessionTokenGenerator.ts` | Block 3 |
| `web/src/api/authApi.ts` (+ `web/src/pages/LoginPage.tsx`, `FirstAdminPage.tsx`) | Block 5 |

## Trust boundaries
- Navegador → API (`/api/*`): cruzan email y contraseña en claro dentro del body de `POST /api/auth/login` y `POST /api/setup/first-admin`, y la cookie `aldebaran_sid` en cada solicitud.
- Visitante sin sesión → zona autenticada: `authMiddleware.ts` es el único punto que decide; solo `POST /api/auth/login`, `GET /api/setup/status` y `POST /api/setup/first-admin` cruzan sin sesión.
- API → base SQLite (`data/aldebaran.db`): el proceso del server lee y escribe `password_hash` y `token_hash`; el archivo vive en el disco del servidor.
- Proceso del server → logs (stdout): los intentos de inicio de sesión se registran; la contraseña y el token nunca cruzan esta frontera.

## STRIDE analysis
### `server/src/infrastructure/http/routes/auth.ts`
- **Spoofing:** adivinar contraseñas contra `POST /api/auth/login` (fuerza bruta / credential stuffing). No hay límite de intentos en el alcance del PRD; lo frena el costo de argon2id (R-01).
- **Tampering:** el body se valida (email y contraseña string, longitudes máximas 254 y 1024) antes de llegar a `Login`; un body malformado da 400 sin tocar la base.
- **Repudiation:** cada intento se registra en stdout con resultado (`ok` / `invalid`), email normalizado, IP y timestamp, sin la contraseña (R-05).
- **Information Disclosure:** el mismo 401 `"Email o contraseña incorrectos"` para email inexistente, contraseña incorrecta y usuario Inactivo (D-02); para el email inexistente `Login` verifica contra un hash dummy calculado al arrancar, así el tiempo de respuesta no revela qué emails existen (R-02). Las respuestas devuelven `PublicUser`, sin `passwordHash`.
- **Denial of Service:** cada intento ejecuta argon2id (~decenas de ms de CPU); muchas solicitudes en paralelo saturan el proceso (R-03).
- **Elevation of Privilege:** el login no acepta rol ni estado en el body; el rol sale de la fila de `users`. Un usuario Inactivo no obtiene sesión.

### `server/src/infrastructure/http/routes/setup.ts`
- **Spoofing:** con el sistema vacío, cualquiera que llegue primero a `POST /api/setup/first-admin` queda como Admin (R-06).
- **Tampering:** el body solo acepta `name`, `email`, `password`; rol y estado los fija `RegisterFirstAdmin` (Admin, Activo).
- **Repudiation:** el registro del primer Admin se loguea con email, IP y timestamp.
- **Information Disclosure:** `GET /api/setup/status` es público y devuelve solo `{ needsFirstAdmin: boolean }`; no expone emails, nombres ni cantidad de usuarios.
- **Denial of Service:** `RegisterFirstAdmin` consulta `countAll()` antes de hashear y responde 409 sin ejecutar argon2id si ya hay usuarios; vuelve a verificar dentro de la tx IMMEDIATE. Así, una vez creado el Admin, la ruta no gasta CPU.
- **Elevation of Privilege:** dos registros simultáneos podrían crear dos Admin; la transacción `IMMEDIATE` de `DrizzleUnitOfWork` serializa `countAll()+insert` y el segundo recibe 409 (R-04).

### `server/src/infrastructure/http/authMiddleware.ts`
- **Spoofing:** el token de sesión son 32 bytes de `crypto.randomBytes` (256 bits); no es adivinable. La cookie es `httpOnly`, así un XSS no la puede leer.
- **Tampering:** el token no lleva datos: se busca por SHA-256 en `sessions`; alterarlo solo produce un token inexistente → 401.
- **Repudiation:** las solicitudes rechazadas por sesión inválida o vencida se loguean con IP y ruta.
- **Information Disclosure:** deny-by-default sobre `/api`: cualquier ruta no exceptuada responde 401 `{error}` sin datos (FR-01, AC-08).
- **Denial of Service:** la validación es una búsqueda por índice único `token_hash`; no ejecuta hash costoso.
- **Elevation of Privilege:** CSRF: la cookie es `SameSite=Strict` y `requireJson.ts` rechaza con 415 todo POST sin `Content-Type: application/json`, que un formulario cross-site no puede enviar sin preflight (R-07). Una sesión vencida (24 h sin actividad) o de un usuario Inactivo se rechaza y se borra.

### `server/src/infrastructure/db/schema.ts`
- **Spoofing:** no aplica directamente: la base no es accesible por red; solo el proceso del server la abre.
- **Tampering:** quien tenga acceso de escritura al archivo `data/aldebaran.db` puede crear un Admin; se mitiga con permisos de archivo 0600 del usuario del servicio (R-08).
- **Repudiation:** `users.created_at` y `sessions.created_at/last_activity_at` dejan rastro de cuándo se creó cada usuario y sesión.
- **Information Disclosure:** una copia del archivo expone emails y nombres en claro; las contraseñas están como argon2id y los tokens como SHA-256, así una copia no permite iniciar sesión ni reutilizar sesiones (R-08).
- **Denial of Service:** la tabla `sessions` crece con cada login; las sesiones vencidas se borran al detectarse y al cerrar sesión.
- **Elevation of Privilege:** el `email` tiene índice UNIQUE ya normalizado (lowercase), así no se puede registrar `Admin@x.com` como segundo usuario de `admin@x.com`.

### `server/src/infrastructure/auth/Argon2PasswordHasher.ts`
- **Spoofing:** un hash débil facilitaría crackear contraseñas robadas; se usa argon2id con memoria 19 MiB, 2 iteraciones, paralelismo 1 (parámetros mínimos OWASP) en producción (NFR-01).
- **Tampering:** el hash incluye su propia sal y parámetros (formato PHC); `verify` rechaza hashes alterados.
- **Repudiation:** no aplica: es una función pura sin acción de usuario propia que registrar.
- **Information Disclosure:** la contraseña en claro solo existe en memoria durante la solicitud; nunca se loguea ni se persiste.
- **Denial of Service:** el costo de memoria por hash (19 MiB) multiplicado por solicitudes concurrentes es un vector de agotamiento (R-03).
- **Elevation of Privilege:** los parámetros bajos para tests se inyectan solo desde `test/support/testApp.ts`; `main.ts` usa siempre los de producción.

### `web/src/api/authApi.ts`
- **Spoofing:** la web no guarda credenciales ni tokens: la sesión vive solo en la cookie httpOnly que maneja el navegador.
- **Tampering:** la web no decide permisos: si el servidor responde 401, `authApi` pasa el store a `anon` y redirige a `/login`.
- **Repudiation:** no aplica en el cliente; el registro de acciones está en el server.
- **Information Disclosure:** las páginas no persisten la contraseña (ni en `localStorage` ni en el store); el campo se limpia tras un intento fallido.
- **Denial of Service:** el botón de envío se deshabilita mientras hay una solicitud en curso, para no duplicar intentos.
- **Elevation of Privilege:** las guardas de ruta (`/`, `/login`, `/setup`) son solo UX; la autorización real es `authMiddleware.ts`.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| contraseña | credentials | nunca se guarda en claro: argon2id (19 MiB, t=2, p=1) en `users.password_hash` | TLS 1.2+ en el proxy de despliegue; la cookie `Secure` en producción impide usarla sin HTTPS |
| token de sesión | credentials | solo su SHA-256 en `sessions.token_hash` | TLS 1.2+; cookie `httpOnly`, `SameSite=Strict`, `Secure` en producción |
| email del usuario | PII | en claro en SQLite, archivo con permisos 0600 (R-08) | TLS 1.2+ |
| nombre del usuario | PII | en claro en SQLite, archivo con permisos 0600 (R-08) | TLS 1.2+ |
| `needsFirstAdmin` | public | no se guarda (se calcula) | TLS 1.2+ |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | fuerza bruta / credential stuffing sobre `POST /api/auth/login` sin límite de intentos | S | M | H | aceptado, ver abajo; atenuado por argon2id (R-03), mensaje 401 único y hash dummy (R-02) y log de intentos (R-05) |
| R-02 | enumeración de emails por mensaje o por tiempo de respuesta | I | M | M | mensaje 401 único (D-02) + verificación contra hash dummy cuando el email no existe |
| R-03 | agotamiento de CPU/memoria con muchas solicitudes de login en paralelo (argon2id) | D | L | M | límites de body (`express.json({ limit: '10kb' })`) y longitud máxima de contraseña 1024; el resto depende de R-01 |
| R-04 | carrera en el registro del primer Admin crea dos Admin | E | L | H | transacción `IMMEDIATE` en `DrizzleUnitOfWork` con `countAll()+insert` síncronos; test de carrera (un 201, un 409, count=1) |
| R-05 | no queda rastro de intentos de login | R | M | L | log estructurado en stdout de cada intento (resultado, email normalizado, IP, timestamp), sin contraseña ni token |
| R-06 | un tercero se registra como primer Admin antes que el dueño | S | L | H | ventana solo mientras no hay usuarios; la puesta en marcha registra el Admin antes de exponer el sistema; tras el primer usuario, la ruta responde 409 (FR-06) |
| R-07 | CSRF sobre login/logout/first-admin | E | L | M | cookie `SameSite=Strict` + `requireJson.ts` (415 si no es `application/json`) |
| R-08 | copia o escritura del archivo SQLite expone PII o permite crear un Admin | T | L | H | archivo y directorio `data/` con permisos 0600/0700 (creados por `client.ts`); hashes argon2id y SHA-256 hacen inútiles las credenciales copiadas |

## Accepted risks
### R-01
- **Accepted by:** Javier Boero, dueño del producto y único Admin (decisión del 2026-11-04, en PLAN de FEAT-001)
- **Justification:** el MVP es una herramienta interna con un solo usuario; el `PRD.md` no pide límite de intentos y FEAT-001 lo dejó fuera de alcance. Cada intento cuesta un argon2id (19 MiB, t=2), el mensaje de rechazo no revela qué emails existen y cada intento queda en el log, lo que hace lento y visible un ataque.
- **Review conditions:** antes de exponer el sistema fuera de la red interna, antes del pasaje a producción, o de inmediato si el log de intentos muestra fallos repetidos contra un mismo email.

## Supply chain
Dependencias nuevas de este ticket: `@node-rs/argon2` (binarios precompilados por plataforma), `cookie-parser`, y en desarrollo `supertest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` y `jsdom`. Las del stack declarado (`express`, `drizzle-orm`, `better-sqlite3`, `react`, `vite`, `antd`, `zustand`, `react-router`, `styled-components`, `vitest`) ya están en `AGENTS.md`. Todas se fijan con `package-lock.json` commiteado y se instalan con `npm ci`; el SAST de CODE revisa el código propio.

## Availability
Los vectores de DoS de este diseño son R-01 y R-03 (argon2id costoso por intento). `authMiddleware.ts` no ejecuta hash costoso, así que las solicitudes autenticadas no compiten por esa CPU. La protección volumétrica (DDoS) queda fuera de esta app: corresponde al proxy o la red de despliegue.
