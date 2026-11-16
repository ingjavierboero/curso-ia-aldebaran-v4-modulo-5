# SAST FEAT-008

| Field | Value |
|-------|-------|
| Ticket | FEAT-008 |
| Tools | revisión manual del diff `c4945ac..3867fa8` (server/src, web/src, web/index.html) con grep de patrones, `npm audit` 11, revisiones arch-auditor por bloque |
| Date | 2026-11-16 |

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos en el código: `GMAIL_USER`/`GMAIL_APP_PASSWORD` se leen solo del entorno (`emailConfig.ts`); `.env` y `.env.*` en `.gitignore`; el único valor parecido es un dato falso de test |
| F-SAST-02 | ✅ | todas las consultas nuevas usan el query builder de Drizzle (`DrizzlePasswordResetTokenRepository.ts`); el único `sql` es de los CHECK del schema, sin entrada de usuario |
| F-SAST-03 | ✅ | nada llega a exec/spawn |
| F-SAST-04 | ✅ | sin eval, `new Function` ni deserialización insegura; los bodies pasan por `express.json` y `bodyObject` |
| F-SAST-05 | ✅ | ninguna entrada de usuario en rutas de archivos |
| F-SAST-06 | ✅ | sin innerHTML ni dangerouslySetInnerHTML; React escapa el mensaje del server; el email es texto simple |
| F-SAST-07 | ✅ | la única conexión saliente es SMTP a `smtp.gmail.com:465` fijo; la URL del email sale de `APP_URL` validada, nunca del header Host |
| F-SAST-08 | ✅ | token de 32 bytes de `crypto.randomBytes` guardado como SHA-256; contraseñas con argon2id (ADR-002); sin MD5/SHA1 para contraseñas |
| F-SAST-09 | ✅ | nodemailer con `logger: false` y `debug: false`; sin modo debug nuevo |
| F-SAST-10 | ✅ | los logs nuevos (`passwordResetLog.ts`, `logAuthAttempt` en `routes/passwordReset.ts`, logs de arranque) no llevan token, URL, texto del email, contraseñas ni credenciales; el fallo de envío registra solo `errorCode`; `InvalidConfig` nombra la variable y no el valor; probado por `test_http_log_sin_token_ni_contraseña` y `test_password_reset_log_sin_token` |
| F-SAST-11 | ✅ | no hay superficie de subida de archivos |
| F-SAST-12 | ✅ | las rutas nuevas son públicas y sin cookie; `requireJson` global exige `application/json` (un formulario de otro sitio no puede enviarlas sin preflight CORS) y la sesión sigue `SameSite=Strict` |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilidades (con y sin dependencias de desarrollo) |
| F-SAST-14 | ✅ | entrada validada en el borde: `bodyObject`/`requiredString` con largos máximos (email 254, token 64), formato del token `/^[A-Za-z0-9_-]{43}$/` antes del hash, `PasswordPolicy` 8–1024, `APP_URL` y `EMAIL_REDIRECT_TO` validados al arrancar |
| F-SAST-15 | ✅ | `errorHandler` responde 500 genérico sin stack ni detalles; `InvalidResetToken` es un único mensaje para inexistente, vencido, usado o anulado |
| F-SAST-16 | ✅ | dependencia nueva `nodemailer` ~10.3.1 (publicada 2026-10-29, sin dependencias propias), sin CVEs conocidos según `npm audit` |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

## Observaciones (no son vulnerabilidades catalogadas)
- Deuda registrada en `docs/daw/specs/decisions-FEAT-008.md`: un 500 por fallo de la transacción solo en la rama con usuario (oráculo de enumeración con la base degradada) y falta de log de tokens inválidos en `/check`.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
