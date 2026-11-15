# Threat model FEAT-006: Usuarios y perfiles

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| Spec | docs/daw/specs/spec-FEAT-006.md |
| Tier | FEATURE |
| Date | 2026-11-15 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/domain/auth/Authorization.ts` | Block 1 |
| `server/src/application/user/*` (ListUsers, CreateUser, UpdateUser, DeactivateUser, ReactivateUser) | Block 1 |
| `server/src/infrastructure/http/routes/users.ts` (`/api/users`) | Block 2 |
| `server/src/infrastructure/db/DrizzleUserRepository.ts` / `DrizzleSessionRepository.ts` / `DrizzleUnitOfWork.ts` | Block 2 |
| `web/src/pages/UsersPage.tsx` y `web/src/api/usersApi.ts` | Block 3 |

## Trust boundaries
- Navegador → API (`/api/users`): cruzan la cookie de sesión `aldebaran_sid`, el body JSON con nombre, email, perfil y contraseña inicial, y el `:id` de la ruta.
- API → base SQLite: cruzan los datos de usuario (con el hash de la contraseña) y el borrado de sesiones.
- Perfil Admin ↔ perfiles Editor y Consulta: frontera de privilegio dentro de la app; solo Admin cruza hacia los datos de usuarios.

## STRIDE analysis
### `server/src/domain/auth/Authorization.ts`
- **Spoofing:** el perfil no viene del cliente: sale del usuario que `resolveSession` relee de la base en cada solicitud, así que no se puede declarar otro perfil en el body ni en headers.
- **Tampering:** la tabla perfil → acciones es código, no dato editable; un cambio requiere un commit revisado.
- **Repudiation:** no aplica a la tabla en sí; los rechazos se ven como 403 en la respuesta.
- **Information Disclosure:** una acción no listada para un perfil queda denegada (deny-by-default de la tabla), así que un perfil nuevo o una acción nueva no abre datos por omisión (R-01).
- **Denial of Service:** consulta en memoria O(1); sin superficie.
- **Elevation of Privilege:** el riesgo central del ticket: un Editor o Consulta gestionando usuarios o promoviéndose a Admin. Mitigado porque cada caso de uso llama `assertCan` antes de leer o escribir (R-01), y lo prueban tests por perfil en dominio, aplicación y HTTP.

### `server/src/application/user/*`
- **Spoofing:** el actor es `req.user`, puesto por `authMiddleware` desde la sesión validada; las rutas no aceptan un actor en el body.
- **Tampering:** un Admin podría intentar dejar el sistema sin Admin (baja o cambio de perfil del último): `LastActiveAdmin` dentro de la transacción `IMMEDIATE` (R-03). Email duplicado por diferencia de mayúsculas: `Email` normaliza a minúsculas y el UNIQUE de la base cierra la carrera (R-04).
- **Repudiation:** sin auditoría de cambios sobre usuarios (fuera de alcance en el PRD); riesgo aceptado abajo (R-07).
- **Information Disclosure:** todo lo devuelto pasa por `toPublicUser`, que no tiene `passwordHash` (R-02).
- **Denial of Service:** el alta hashea con argon2id; contraseñas acotadas a 1024 caracteres (`PasswordPolicy`) y solo un Admin autenticado puede llamarla.
- **Elevation of Privilege:** un Admin degradado mientras su alta está en vuelo (hash argon2id) no la completa: las escrituras releen al actor dentro de la transacción (`requireActor`). Un usuario dado de baja conserva su cookie: `DeactivateUser` borra sus sesiones en la misma transacción y `resolveSession` además rechaza usuarios Inactivos (R-05). Un Admin degradado pierde el permiso en la siguiente solicitud porque el perfil se relee cada vez.

### `server/src/infrastructure/http/routes/users.ts`
- **Spoofing:** las rutas no están en `PUBLIC_ROUTES`: sin sesión válida responden 401 antes de llegar al caso de uso.
- **Tampering:** escrituras solo con `Content-Type: application/json` (`requireJson`, R-07 de FEAT-001), lo que bloquea formularios cross-site sin preflight (CSRF); cookie `SameSite=Strict`.
- **Repudiation:** los 401 ya se registran (`session_rejected`); los cambios de usuarios no (R-07).
- **Information Disclosure:** 403 sin datos para Editor y Consulta; los errores devuelven solo `{ error }` con un mensaje fijo; el body nunca se loguea (contiene la contraseña inicial) (R-06).
- **Denial of Service:** body limitado a 10 kB por `express.json`; campos acotados antes del dominio.
- **Elevation of Privilege:** `:id` de otro usuario solo lo puede tocar un Admin; no hay rutas de "mi usuario" que acepten un id ajeno en este ticket.

### `server/src/infrastructure/db/DrizzleUserRepository.ts` / `DrizzleSessionRepository.ts` / `DrizzleUnitOfWork.ts`
- **Spoofing:** sin identidad propia; opera con lo que le pasa el caso de uso.
- **Tampering:** consultas por Drizzle con parámetros; sin SQL armado con strings.
- **Repudiation:** no aplica.
- **Information Disclosure:** el log de errores ya filtra `DrizzleQueryError` para no volcar parámetros (emails, hashes) (R-06).
- **Denial of Service:** `deleteByUserId` usa el índice `sessions_user_id_idx`; la transacción `IMMEDIATE` dura lo que un par de consultas, sin `await` adentro (ADR-003).
- **Elevation of Privilege:** el CHECK de `users.role` impide guardar un perfil fuera de los tres válidos aunque falle la validación de aplicación.

### `web/src/pages/UsersPage.tsx` y `web/src/api/usersApi.ts`
- **Spoofing:** la web no maneja tokens; la cookie la manda el navegador.
- **Tampering:** la guarda de `/usuarios` y el botón son UX; la autorización real es la del server, así que manipular el cliente no da acceso.
- **Repudiation:** no aplica.
- **Information Disclosure:** nombres y emails se muestran como texto en componentes antd (React escapa); sin `dangerouslySetInnerHTML`. La contraseña inicial solo vive en el formulario y no se guarda en el store.
- **Denial of Service:** una acción por click; sin polling.
- **Elevation of Privilege:** un Editor que fuerza la URL `/usuarios` recibe 403 de la API y vuelve a `/`.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| contraseña inicial | credentials | solo hash argon2id en `users.password_hash`; nunca en texto plano ni en logs | HTTPS en producción; body JSON |
| `password_hash` | credentials | columna en SQLite local; nunca sale por la API | no transita |
| nombre y email de usuarios | PII | SQLite local del servidor | HTTPS en producción; solo a perfil Admin |
| cookie de sesión | credentials | hash SHA-256 del token en `sessions` | cookie `HttpOnly`, `SameSite=Strict`, `Secure` fuera de desarrollo |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | Editor o Consulta gestiona usuarios o se promueve a Admin | E | M | H | `assertCan` en cada caso de uso, tabla deny-by-default; tests por perfil en las 5 rutas |
| R-02 | Fuga del hash de la contraseña por la API | I | L | H | Todo pasa por `toPublicUser`; test que verifica la ausencia del campo |
| R-03 | El sistema queda sin Admin Activo (incluido por concurrencia) | T | M | H | `LastActiveAdmin` dentro de la `UnitOfWork` `IMMEDIATE`; test de bajas simultáneas |
| R-04 | Dos usuarios con el mismo email por mayúsculas o por carrera | T | L | M | `Email` normaliza; UNIQUE en la base traducido a `EmailAlreadyInUse` (409) |
| R-05 | Usuario dado de baja sigue operando con su cookie | E | M | H | Borrado de sesiones en la misma transacción + `resolveSession` rechaza Inactivos |
| R-06 | Contraseña inicial o emails en los logs | I | L | M | El body no se loguea; `errorDetail` filtra parámetros de queries |
| R-07 | Sin auditoría de quién cambió qué usuario | R | M | L | accepted, see below |

## Accepted risks
### R-07
- **Accepted by:** el usuario (dueño del proyecto), explícitamente en PLAN el 2026-11-15 ("Aceptarlo"), en línea con el PRD FEAT-006 que deja la auditoría de cambios sobre usuarios fuera de alcance.
- **Justification:** hoy el sistema lo usa una sola persona (Admin); el historial de acciones del PRD general cubre clientes y facturas, no usuarios.
- **Review conditions:** cuando haya más de un Admin en uso real, o cuando se construya el historial/reportes (P3), se revisa sumar un registro de cambios de usuarios.

## Supply chain
Sin dependencias nuevas: usa Express, Drizzle, argon2 y antd que ya están en el proyecto.

## Availability
El alta hashea con argon2id, costoso a propósito; solo un Admin autenticado puede llamarla y la
contraseña está acotada a 1024 caracteres. El resto son consultas indexadas sobre una tabla chica.
