# SAST FEAT-009

| Field | Value |
|-------|-------|
| Ticket | FEAT-009 |
| Tools | revisión del diff `feat/FEAT-007-cambio-de-contrasena...HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-15 |

Alcance: el diff de `feat/FEAT-009-limite-de-intentos` contra su base, la rama de FEAT-007 (HEAD `7e7f65e`): dominio
(`domain/auth/AttemptWindow.ts`), infraestructura (`http/rateLimit/{AttemptTracker,attemptGate}.ts`, `http/app.ts`,
`http/authLog.ts`, `http/routes/{auth,setup}.ts`) y tests web (sin cambios de producto en `web/`). Dependencia nueva:
`express-rate-limit` `^8.7.2` (resuelve 8.7.4) con su dependencia `ip-address`.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos embebidos en el diff (grep de patrones sin resultados); `.env` y `.env.*` en `.gitignore` |
| F-SAST-02 | ✅ | el ticket no agrega consultas a la base: el registro de intentos vive en memoria |
| F-SAST-03 | ✅ | nada del diff llega a exec/spawn/child_process |
| F-SAST-04 | ✅ | sin eval ni deserialización; el email del bloqueo se lee con guardas (`bodyEmailOf` sobre `bodyObject`) |
| F-SAST-05 | ✅ | sin rutas de archivo construidas con datos de la solicitud |
| F-SAST-06 | ✅ | la web muestra el mensaje del 429 como texto en `Alert` (JSX escapa); sin `innerHTML` |
| F-SAST-07 | ✅ | sin solicitudes salientes |
| F-SAST-08 | ✅ | sin cripto nueva; el bloqueado no llega a argon2 (la compuerta corta antes del handler) |
| F-SAST-09 | ✅ | sin modo debug; validaciones de express-rate-limit silenciosas (test verifica que no escriben en consola) |
| F-SAST-10 | ✅ | el registro `blocked` lleva operación, resultado, email normalizado, IP y fecha; nunca contraseñas (`attemptGate.ts:98`); tests buscan las contraseñas en todo el log |
| F-SAST-11 | ✅ | no hay superficie de subida de archivos |
| F-SAST-12 | ✅ | sin cambios en la protección CSRF: `requireJson` + cookie `SameSite=Strict`; el límite agrega defensa contra fuerza bruta |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilities (incluye `express-rate-limit` 8.7.4 e `ip-address`) |
| F-SAST-14 | ✅ | sin entradas nuevas; el primer Admin mueve su parseo dentro del `try` sin relajar la validación; la clave de IP la arma el server (`ipKeyGenerator`, sin `trust proxy`) |
| F-SAST-15 | ✅ | el 429 responde un mensaje fijo con minutos; no revela si el email existe ni detalles internos |
| F-SAST-16 | ✅ | `express-rate-limit` (MIT, mantenido) e `ip-address` sin CVE conocidos según `npm audit`; versión declarada `^8.7.2` |
| F-SAST-17 | ✅ | sin rutas de código dinámicas |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
