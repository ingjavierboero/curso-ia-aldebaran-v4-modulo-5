# Threat model FEAT-008: Recuperación de contraseña por email

| Field | Value |
|-------|-------|
| Ticket | FEAT-008 |
| Spec | docs/daw/specs/spec-FEAT-008.md |
| Tier | FEATURE |
| Date | 2026-11-16 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/domain/auth/PasswordResetToken.ts` y `server/src/infrastructure/db/DrizzlePasswordResetTokenRepository.ts` (tabla `password_reset_tokens`) | Block 1 |
| `server/src/application/auth/RequestPasswordReset.ts`, `CheckPasswordResetToken.ts`, `ResetPasswordWithToken.ts` | Block 2 |
| `server/src/infrastructure/email/SmtpEmailSender.ts`, `RedirectingEmailSender.ts`, `emailConfig.ts` | Block 3 |
| `server/src/infrastructure/http/routes/passwordReset.ts` (`POST /api/auth/password-reset`, `/check`, `/confirm`) | Block 4 |
| `web/src/pages/ResetPasswordPage.tsx` y `ForgotPasswordPage.tsx` | Block 5 |

## Trust boundaries
- Navegador → API (`POST /api/auth/password-reset`, `/check`, `/confirm`): cruzan un email, el token de recuperación y la contraseña nueva, sin sesión; es superficie pública.
- API → base SQLite: cruza el hash del token, el `user_id` y el hash argon2id de la contraseña nueva.
- API → Gmail (SMTP 465 con TLS): cruzan las credenciales de la casilla del sistema y el email con la URL que contiene el token.
- Casilla del usuario → navegador: el token viaja en la URL `/recuperar/<token>`, fuera del control del sistema.
- API → log (stdout): cruzan resultados de pedido y confirmación con email e IP; nunca token ni contraseña.

## STRIDE analysis
### `server/src/domain/auth/PasswordResetToken.ts` y `server/src/infrastructure/db/DrizzlePasswordResetTokenRepository.ts` (tabla `password_reset_tokens`)
- **Spoofing:** quien lee la base no puede usar los tokens: solo se guarda el SHA-256 de 256 bits aleatorios (NFR-01); la preimagen no se puede calcular.
- **Tampering:** solo el server escribe la tabla, con consultas parametrizadas de Drizzle; la FK con CASCADE evita tokens huérfanos.
- **Repudiation:** cada fila guarda `created_at`, `used_at` e `invalidated_at`, que muestran cuándo se emitió, usó o anuló.
- **Information Disclosure:** la tabla no tiene tokens en claro; el `user_id` ya está en `users`.
- **Denial of Service:** la purga de vencidos al emitir y el límite de 1 token cada 5 minutos por usuario (FR-15) acotan el crecimiento.
- **Elevation of Privilege:** un token solo permite cambiar la contraseña de su `user_id`; no lleva perfil.

### `server/src/application/auth/RequestPasswordReset.ts`, `CheckPasswordResetToken.ts`, `ResetPasswordWithToken.ts`
- **Spoofing:** sin el token nadie cambia la contraseña ajena; adivinarlo exige 2^256 intentos y el límite de confirmaciones inválidas lo corta (R-02).
- **Tampering:** el cambio de contraseña, la marca de uso, la anulación de los demás tokens y el cierre de sesiones van en una sola transacción IMMEDIATE; una carrera de dos confirmaciones deja una sola ganadora (R-05).
- **Repudiation:** cada pedido y cada confirmación quedan en el log con resultado (FR-18).
- **Information Disclosure:** mismo resultado visible para email existente, inexistente, enfriamiento y fallo de envío (FR-04); el envío no se espera, así el tiempo no revela el email (NFR-03, R-01).
- **Denial of Service:** un atacante que pide recuperaciones ajenas solo genera 1 email cada 5 minutos por usuario y 5 pedidos por IP (R-03); la contraseña vigente sigue sirviendo hasta que el dueño la cambia.
- **Elevation of Privilege:** el usuario Inactivo no recibe tokens y su token no sirve; el cambio no modifica el perfil.

### `server/src/infrastructure/email/SmtpEmailSender.ts`, `RedirectingEmailSender.ts`, `emailConfig.ts`
- **Spoofing:** el remitente es siempre `GMAIL_USER`; TLS en el puerto 465 autentica a smtp.gmail.com.
- **Tampering:** la URL se arma con `APP_URL` del entorno, nunca con el header Host (FR-03), así nadie dirige el enlace a otro sitio (R-04).
- **Repudiation:** cada envío termina en una línea `sent` o `send_failed` con `errorCode`.
- **Information Disclosure:** credenciales solo del entorno (NFR-04), `logger`/`debug` de nodemailer apagados y el log de fallos sin el texto del email (R-06); `EMAIL_REDIRECT_TO` se anuncia al arrancar para que no quede activo por error en producción (R-07).
- **Denial of Service:** timeouts de 15 s evitan que SMTP colgado acumule envíos pendientes; sin credenciales el server arranca igual.
- **Elevation of Privilege:** la contraseña de aplicación da acceso a la casilla; se trata como credencial y nunca se registra.

### `server/src/infrastructure/http/routes/passwordReset.ts` (`POST /api/auth/password-reset`, `/check`, `/confirm`)
- **Spoofing:** rutas públicas a propósito; la IP para el límite es `req.ip` sin `trust proxy` (como FEAT-009).
- **Tampering:** bodies validados con `bodyObject`/`requiredString` y largos máximos antes del caso de uso.
- **Repudiation:** `logAuthAttempt` con `password_reset_request`/`password_reset_confirm`, IP y fecha; el email de la confirmación queda `null`.
- **Information Disclosure:** el token viaja en el body y no en la URL de la API, así no aparece en logs de acceso; `errorHandler` responde genérico ante errores inesperados.
- **Denial of Service:** compuertas `createAttemptGate` antes del handler; el 429 no ejecuta casos de uso ni argon2 (FR-14, FR-16).
- **Elevation of Privilege:** las rutas no crean sesión; después del cambio el usuario inicia sesión normalmente.

### `web/src/pages/ResetPasswordPage.tsx` y `ForgotPasswordPage.tsx`
- **Spoofing:** la página no confía en el token: lo valida el server en el loader y otra vez al confirmar.
- **Tampering:** la página solo envía token y contraseña; las reglas viven en el server.
- **Repudiation:** el registro lo hace el server.
- **Information Disclosure:** `history.replaceState` quita el token de la barra y `<meta name="referrer" content="no-referrer">` evita que viaje en el Referer (R-08).
- **Denial of Service:** el loader valida una vez por navegación (no `useEffect`, por StrictMode), así no consume dos intentos.
- **Elevation of Privilege:** las pantallas no tienen acciones privilegiadas.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| token de recuperación | credentials | solo SHA-256 en `password_reset_tokens.token_hash`; en claro solo en el email | TLS 465 hacia Gmail; HTTPS en producción entre navegador y API |
| contraseña nueva | credentials | argon2id en `users.password_hash`; nunca en logs ni respuestas | HTTPS en producción |
| `GMAIL_APP_PASSWORD` | credentials | solo en el entorno del proceso, nunca en el repo ni en el log | TLS 465 hacia Gmail |
| email del usuario | PII | en `users` (sin cambios); normalizado en el log | TLS 465; HTTPS en producción |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | enumerar emails registrados por mensaje o tiempo | I | M | M | mismo mensaje en todos los casos y envío sin esperar; test de medianas < 100 ms |
| R-02 | adivinar un token por fuerza bruta | S | L | H | 256 bits aleatorios y 5 confirmaciones inválidas por IP en 15 min; un acierto no reinicia el conteo |
| R-03 | inundar de emails la casilla de un usuario | D | M | M | 1 email cada 5 min por usuario (también dentro de la transacción) y 5 pedidos por IP |
| R-04 | envenenar el enlace con el header Host | T | M | H | URL solo desde `APP_URL` validada; test con `Host: otro-sitio.com` |
| R-05 | carrera entre dos confirmaciones o dos pedidos | T | L | M | relectura dentro de la transacción IMMEDIATE; tests de carrera sobre SQLite real |
| R-06 | token o credenciales en el log | I | M | H | log sin texto del email ni error completo, nodemailer sin logger; test que recorre log y filas |
| R-07 | `EMAIL_REDIRECT_TO` activo en producción desvía los emails | I | L | H | se valida y se registra `email_redirect_active` al arrancar |
| R-08 | el token de la URL se filtra por Referer o historial | I | L | M | `no-referrer`, `replaceState`, vencimiento de 10 min y uso único |
| R-09 | robo del enlace desde la casilla del usuario | S | L | H | vence a los 10 min, uso único, se anula con un pedido nuevo y el cambio cierra todas las sesiones |

## Supply chain
`nodemailer` (y `@types/nodemailer` solo en desarrollo) es la única dependencia nueva: sin
dependencias de producción propias, mantenida y con `npm audit` en el SAST de CODE; Dependabot ya
cubre el repo. Gmail SMTP es un servicio externo; si no responde, el envío falla con log (D-03).

## Availability
Las compuertas de FEAT-009 (D-05) acotan los pedidos y confirmaciones por IP antes de tocar la base o
argon2; los timeouts de SMTP de 15 s y el envío sin esperar evitan que Gmail lento frene las
respuestas. Rotar IPs evade el límite por IP: el tope por usuario de FR-15 sigue protegiendo la casilla.
