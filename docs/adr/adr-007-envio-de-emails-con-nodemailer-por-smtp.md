# ADR-007: Envío de emails con nodemailer por SMTP detrás de un puerto

| Field | Value |
|-------|-------|
| Date | 2026-11-16 |
| Ticket | FEAT-008 |
| Status | Accepted |

## Context
FEAT-008 fue el primer flujo de Aldebaran que envía emails (recuperación de contraseña), y la
facturación y los recordatorios lo van a necesitar después. AGENTS.md fija la casilla del sistema en
Gmail con contraseña de aplicación y nodemailer para SMTP. Faltaba decidir cómo se integra, cómo se
configura sin credenciales en el repo (NFR-04) y qué pasa cuando no hay credenciales.

## Options considered

### Option 1: nodemailer detrás de un puerto `EmailSender` con decoradores
- **Pros:** la capa de aplicación no conoce SMTP; los tests usan un doble; la redirección de desarrollo (`EMAIL_REDIRECT_TO`) y el caso sin credenciales son decoradores intercambiables en `main.ts`; el modo mock futuro suma otro adaptador sin tocar los casos de uso.
- **Cons:** una dependencia nueva (nodemailer y sus tipos) y tres adaptadores chicos.

### Option 2: API HTTP de Gmail (OAuth2)
- **Pros:** sin SMTP; mejores cuotas.
- **Cons:** exige proyecto de Google Cloud, OAuth y refresco de tokens; contradice el stack de AGENTS.md (contraseña de aplicación).

### Option 3: llamar a nodemailer directo desde el caso de uso
- **Pros:** menos archivos.
- **Cons:** rompe la separación DDD; los tests necesitarían un servidor SMTP falso.

## Decision
Se eligió la opción 1. `EmailSender` (puerto async en `application/shared`) con `SmtpEmailSender`
(smtp.gmail.com:465, TLS, timeouts de 15 s, `logger` y `debug` apagados), `RedirectingEmailSender`
y `UnconfiguredEmailSender`. Variables: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_REDIRECT_TO`
(opcional, solo desarrollo) y `APP_URL` (por defecto `http://localhost:5173`). Sin las dos
credenciales el server arranca igual, registra `email_unconfigured` y cada envío falla con log.

## Consequences
- `server/package.json` y `package-lock.json` suman `nodemailer` y `@types/nodemailer`.
- Archivos nuevos en `server/src/infrastructure/email/`; el armado vive en `server/src/main.ts`.
- Las variables se leen solo del entorno; no hay `.env.example` en el repo, quedan documentadas aquí y en la spec de FEAT-008.
- El envío no se espera en el camino de la respuesta (NFR-03): sus fallos se ven solo en el log.
