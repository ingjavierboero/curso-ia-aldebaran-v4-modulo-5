# Threat model FEAT-007: Cambio de la propia contraseña

| Field | Value |
|-------|-------|
| Ticket | FEAT-007 |
| Spec | docs/daw/specs/spec-FEAT-007.md |
| Tier | FEATURE |
| Date | 2026-11-15 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/application/auth/ChangeOwnPassword.ts` | Block 1 |
| `server/src/infrastructure/db/DrizzleUserRepository.ts` / `DrizzleSessionRepository.ts` | Block 1 |
| `server/src/infrastructure/http/routes/auth.ts` (`POST /api/auth/password`) | Block 2 |
| `web/src/pages/ProfilePage.tsx` y `web/src/api/authApi.ts` | Block 3 |

## Trust boundaries
- Navegador → API (`POST /api/auth/password`): cruzan la cookie de sesión `aldebaran_sid` y el body JSON con la contraseña actual y la nueva en texto plano.
- API → base SQLite: cruzan el hash argon2id nuevo, la lectura del hash vigente y el borrado de las demás sesiones del usuario.
- API → log (stdout): cruza el registro del intento (`password_change`, resultado, email, ip, fecha); nunca las contraseñas ni el token.

## STRIDE analysis
### `server/src/application/auth/ChangeOwnPassword.ts`
- **Spoofing:** (incluye `PasswordPolicy.assertChanged` y `User.withPasswordHash`, que no agregan superficie propia) el usuario cuya contraseña cambia es siempre el de la sesión validada (`req.user` vía `sessionContext`); el caso de uso no recibe un id objetivo, así que no se puede cambiar la contraseña de otro (NFR-02, R-02). Además exige la contraseña actual: una sesión robada sola no alcanza para fijar una contraseña nueva.
- **Tampering:** dos cambios simultáneos del mismo usuario: dentro de la transacción `IMMEDIATE` se relee el usuario y si `passwordHash` ya no es el verificado se rechaza con `IncorrectCurrentPassword` (compare-and-set, R-04). La sesión actual se busca por el hash del token y se exige `session.userId === user.id` antes de escribir (R-05).
- **Repudiation:** cada intento queda en el log de autenticación con resultado `ok`, `wrong_current`, `invalid` o `error`, email, ip y fecha (FR-09).
- **Information Disclosure:** la respuesta exitosa es 204 sin body; los rechazos llevan solo el mensaje del error. La contraseña nueva se guarda solo como hash argon2id (NFR-01).
- **Denial of Service:** cada intento corre argon2id (`verify` y, si pasa, `hash`); la contraseña actual se acota a 1024 caracteres en la ruta y la nueva por `PasswordPolicy` antes de tocar la base; el body está limitado a 10 kb (R-03). Solo usuarios con sesión pueden llamarlo.
- **Elevation of Privilege:** no hay permiso de perfil en juego (todos pueden cambiar la propia); un usuario dado de baja durante el hash no completa el cambio porque la transacción relee su estado y lanza `Unauthenticated`.

### `server/src/infrastructure/db/DrizzleUserRepository.ts` / `DrizzleSessionRepository.ts`
- **Spoofing:** sin superficie propia: reciben ids ya resueltos por el caso de uso.
- **Tampering:** `updatePasswordHash` solo escribe la columna del hash del usuario con ese id, con query parametrizada de Drizzle; el `update` general sigue sin tocar el hash. `deleteByUserIdExcept` borra por `userId` y excluye el id de la sesión actual, parametrizado.
- **Repudiation:** no aplica: la trazabilidad la da el log del intento en la ruta.
- **Information Disclosure:** el hash nunca sale del repositorio hacia la respuesta: todo lo que se devuelve pasa por `toPublicUser`, que no lo incluye.
- **Denial of Service:** dos sentencias indexadas por clave primaria y por `user_id`; sin superficie relevante.
- **Elevation of Privilege:** sin superficie: no hay columnas de perfil ni estado en estas escrituras.

### `server/src/infrastructure/http/routes/auth.ts` (`POST /api/auth/password`)
- **Spoofing:** (incluye `sessionContext.ts`, `authLog.ts` y `errorHandler.ts`) la ruta no está en `PUBLIC_ROUTES`: `authMiddleware` exige una cookie válida antes de llegar (AC-15). El CSRF queda mitigado como en el resto de `/api`: `requireJson` exige `Content-Type: application/json` y la cookie es `SameSite=Strict` (R-06).
- **Tampering:** el body se valida en forma (`bodyObject`, `requiredString`); campos extra se ignoran.
- **Repudiation:** el parseo del body va dentro del `try` que registra el intento, así que también un body inválido queda en el log como `invalid`.
- **Information Disclosure:** el log registra el email de la sesión y nunca las contraseñas ni el token; `IncorrectCurrentPassword` responde 400 (no 401) para no confundir a la web con una sesión perdida, sin revelar nada nuevo porque el usuario ya está autenticado.
- **Denial of Service:** tope de 1024 en `currentPassword` antes de `verify` (R-03).
- **Elevation of Privilege:** no hay parámetro de usuario en la ruta ni en el body.

### `web/src/pages/ProfilePage.tsx` y `web/src/api/authApi.ts`
- **Spoofing:** la pantalla exige sesión en el loader (falla cerrado a `/login`); la autorización real es la del server.
- **Tampering:** la validación de la web (coincidencia, largo) es UX; el server vuelve a validar todo.
- **Repudiation:** no aplica en el cliente.
- **Information Disclosure:** los campos son `Input.Password` (no se ven) y el formulario se vacía tras el éxito (AC-13); las contraseñas no se guardan en el store ni en `localStorage`.
- **Denial of Service:** el botón queda en carga mientras la solicitud está en vuelo, sin reenvíos repetidos.
- **Elevation of Privilege:** el nombre, email y perfil se muestran en solo lectura y no hay ningún envío de esos datos.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| contraseña actual y nueva | credentials | nunca en texto plano: solo el hash argon2id de la nueva en `users.password_hash` | body JSON; TLS en despliegue (fuera de desarrollo), cookie `Secure` |
| hash de la contraseña | credentials | argon2id en `users.password_hash` | nunca sale de la API |
| cookie de sesión | credentials | hash SHA-256 del token en `sessions` | cookie `HttpOnly`, `SameSite=Strict`, `Secure` fuera de desarrollo |
| email y nombre del usuario | PII | SQLite local, sin cifrado de columna (igual que FEAT-001/006) | TLS en despliegue; en el log solo el email normalizado |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | quien tiene una sesión ajena abierta prueba contraseñas actuales sin límite | S | L | M | accepted, see below (decisión D-02); cada intento queda en el log como `wrong_current` |
| R-02 | cambiar la contraseña de otro usuario | E | L | H | el caso de uso solo usa el actor de la sesión; no hay id objetivo en ruta ni body; test que lo fija |
| R-03 | agotar CPU con argon2id usando contraseñas enormes | D | L | M | tope de 1024 en `currentPassword` (ruta) y en la nueva (`PasswordPolicy`) antes del hash; body de 10 kb |
| R-04 | dos cambios simultáneos pisan uno al otro | T | L | M | compare-and-set del `passwordHash` dentro de la transacción `IMMEDIATE` |
| R-05 | se borran sesiones o se cambia la contraseña con una sesión que no es del usuario | T | L | H | la sesión actual se busca por hash del token y se exige `session.userId === user.id` antes de escribir |
| R-06 | CSRF desde otro sitio dispara el cambio | S | L | H | `requireJson` + cookie `SameSite=Strict`, y además hace falta la contraseña actual |
| R-07 | la contraseña queda en el log | I | L | H | `logAuthAttempt` recibe solo email y resultado; test que verifica que el registro no contiene ninguna contraseña (AC-11, AC-12) |

## Accepted risks
### R-01
- **Accepted by:** el usuario (dueño del proyecto), explícitamente en DEFINE el 2026-11-15 (decisión D-02 del PRD FEAT-007: "Solo error y log").
- **Justification:** exige una sesión válida ajena, cada intento queda registrado, y el inicio de sesión tampoco tiene límite de intentos: el límite se resuelve una vez para los dos.
- **Review conditions:** cuando se implemente un límite de intentos para el login, o antes de exponer Aldebaran fuera de la red interna.

## Supply chain
Sin dependencias nuevas: se reutilizan argon2 (hash), Drizzle/better-sqlite3, Express y antd ya presentes y cubiertos por Dependabot (FEAT-005) y el SAST.

## Availability
El vector es el costo de argon2id por intento (R-03); queda acotado por los topes de largo y porque solo usuarios autenticados llegan a la ruta. Sin otros vectores nuevos.
