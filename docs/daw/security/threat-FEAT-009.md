# Threat model FEAT-009: Límite de intentos en login, primer Admin y cambio de contraseña

| Field | Value |
|-------|-------|
| Ticket | FEAT-009 |
| Spec | docs/daw/specs/spec-FEAT-009.md |
| Tier | FEATURE |
| Date | 2026-11-15 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/domain/auth/AttemptWindow.ts` | Block 1 |
| `server/src/infrastructure/http/rateLimit/AttemptTracker.ts` | Block 1 |
| `server/src/infrastructure/http/rateLimit/attemptGate.ts` | Block 1 |
| `server/src/infrastructure/http/routes/auth.ts` y `routes/setup.ts` (rutas con compuerta) | Block 2 |
| `web/src/pages/LoginPage.tsx`, `FirstAdminPage.tsx`, `ProfilePage.tsx` | Block 3 |

## Trust boundaries
- Navegador → API (`POST /api/auth/login`, `POST /api/setup/first-admin`, `POST /api/auth/password`): cruzan la IP de origen (`req.ip`), las credenciales y, en el cambio, la cookie de sesión.
- API → memoria del proceso: el registro de intentos por IP y operación vive solo en el proceso; nada cruza a la base.
- API → log (stdout): cruza el registro de cada rechazo por bloqueo (operación, resultado `blocked`, email si lo hay, IP, fecha); nunca contraseñas.

## STRIDE analysis
### `server/src/domain/auth/AttemptWindow.ts`
- **Spoofing:** regla pura sin entrada externa; la clave la arma la infraestructura.
- **Tampering:** el estado es inmutable (cada operación devuelve uno nuevo); nadie fuera del registro lo modifica.
- **Repudiation:** no aplica a una función pura; el log lo da la compuerta.
- **Information Disclosure:** no maneja credenciales, solo marcas de tiempo.
- **Denial of Service:** como máximo 5 marcas por estado (se vacía al bloquear); costo O(1).
- **Elevation of Privilege:** sin superficie: no toca perfiles ni sesiones.

### `server/src/infrastructure/http/rateLimit/AttemptTracker.ts`
- **Spoofing:** la clave es `ipKeyGenerator(req.ip)`; una IP falsificada por header no influye porque no hay `trust proxy` (S-03). Rotar IPs evade el límite: aceptado por D-01.
- **Tampering:** el mapa vive en memoria del proceso; solo lo escriben las rutas a través de `fail`/`succeed`.
- **Repudiation:** cada bloqueo se registra en el log al rechazar.
- **Information Disclosure:** guarda claves de IP y marcas de tiempo, sin credenciales ni emails.
- **Denial of Service:** muchas IPs distintas llenarían el mapa: barrido amortizado (como máximo uno por minuto) que descarta entradas sin fallos en la ventana y sin bloqueo (NFR-03, R-03); IPv6 agrupado por subred con `ipKeyGenerator` para que rotar dentro de un /56 no cree claves nuevas.
- **Elevation of Privilege:** sin superficie.

### `server/src/infrastructure/http/rateLimit/attemptGate.ts`
- **Spoofing:** usa la misma clave que el registro; no acepta claves del cliente.
- **Tampering:** la compuerta no cuenta (su Store solo consulta), así que un pedido bloqueado o en curso no altera el conteo (R-02).
- **Repudiation:** el handler del 429 registra `blocked` con operación, IP, fecha y email si el body lo trae como string.
- **Information Disclosure:** el 429 dice solo "demasiados intentos" y los minutos; no revela si el email existe.
- **Denial of Service:** el bloqueado se rechaza antes del handler de la ruta, sin argon2 (FR-06, NFR-01).
- **Elevation of Privilege:** sin superficie.

### `server/src/infrastructure/http/routes/auth.ts` y `routes/setup.ts` (rutas con compuerta)
- **Spoofing:** el inicio de sesión y el registro siguen siendo públicos; la compuerta corre antes del handler. El cambio de contraseña sigue exigiendo sesión (`authMiddleware` antes de la compuerta).
- **Tampering:** solo los fallos de credenciales llaman a `fail` (login: `InvalidCredentials`; cambio: `IncorrectCurrentPassword`; primer Admin: cualquier rechazo de la ruta); un acierto llama a `succeed`.
- **Repudiation:** los intentos siguen registrándose como antes (`login`, `first_admin`, `password_change`), más `blocked`.
- **Information Disclosure:** sin cambios en los mensajes de error existentes.
- **Denial of Service:** fuerza bruta contra el hash: acotada a 5 fallos por IP y operación cada 15 minutos (R-01). Varios usuarios detrás de la misma IP se bloquean entre sí (R-04).
- **Elevation of Privilege:** quien tiene una cuenta válida puede intercalar aciertos propios para reiniciar el contador y seguir probando contra otra cuenta (R-05, aceptado).

### `web/src/pages/LoginPage.tsx`, `FirstAdminPage.tsx`, `ProfilePage.tsx`
- **Spoofing:** sin cambios de autenticación en la web.
- **Tampering:** la web no puede saltear la compuerta: es del server.
- **Repudiation:** no aplica en el cliente.
- **Information Disclosure:** muestra el mensaje del 429 tal cual lo envía el server.
- **Denial of Service:** sin reintentos automáticos ante un 429.
- **Elevation of Privilege:** sin superficie.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| IP de origen (clave del registro) | PII | solo en memoria del proceso, se borra al reiniciar o tras 15 minutos sin fallos ni bloqueo; en el log como hasta ahora | TLS en despliegue (fuera de desarrollo) |
| contraseñas de los intentos | credentials | nunca se guardan ni se registran; un intento bloqueado ni siquiera se verifica | TLS en despliegue; body JSON |
| email del intento bloqueado | PII | solo en el log, normalizado, como el resto de los intentos | TLS en despliegue |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | fuerza bruta de contraseñas desde una IP | S | H | H | 5 fallos por IP y operación en 15 minutos bloquean 15 minutos; el bloqueado se rechaza sin hash |
| R-02 | intentos bloqueados o en curso cuentan como fallos y bloquean de más | D | M | M | la compuerta no cuenta; solo cuentan los fallos que la ruta confirma |
| R-03 | llenar la memoria con muchas IPs | D | L | M | barrido amortizado de entradas inactivas e IPv6 agrupado por subred |
| R-04 | usuarios detrás de la misma IP se bloquean entre sí | D | L | L | contadores separados por operación y bloqueo de 15 minutos (D-03) |
| R-05 | quien tiene una cuenta válida reinicia el contador con aciertos propios y prueba sin límite contra otra cuenta | E | L | H | accepted, see below |
| R-06 | la contraseña o el token quedan en el log del bloqueo | I | L | H | el handler del 429 solo pasa el email (si es string) a `logAuthAttempt`; test que lo verifica |

## Accepted risks
### R-05
- **Accepted by:** el usuario (dueño del proyecto), explícitamente en PLAN el 2026-11-15 ("Aceptarlo"), como consecuencia de D-01 (contador por IP) y D-03 (un acierto reinicia).
- **Justification:** exige una cuenta válida propia, cada intento contra la otra cuenta queda en el log, y hoy Aldebaran lo usan pocos usuarios internos.
- **Review conditions:** cuando haya usuarios externos al equipo, o cuando se agregue el conteo por cuenta.

## Supply chain
Dependencia nueva `express-rate-limit` `^8.7.2` (MIT, sin dependencias de producción propias), en el árbol que revisan Dependabot (FEAT-005), `npm audit` y CodeQL. Se usa solo como compuerta (ADR-006).

## Availability
El límite reduce la carga de argon2 ante fuerza bruta (R-01). El propio registro en memoria es acotado (R-03). Un reinicio borra los bloqueos (D-05), lo que no abre otro vector porque reiniciar requiere acceso al server.
