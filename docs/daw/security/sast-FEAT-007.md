# SAST FEAT-007

| Field | Value |
|-------|-------|
| Ticket | FEAT-007 |
| Tools | revisión del diff `main...HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-15 |

Alcance: el diff de `feat/FEAT-007-cambio-de-contrasena` contra `main` (HEAD `d505e46`): dominio
(`domain/user/{PasswordPolicy,User,UserRepository,errors}.ts`, `domain/auth/SessionRepository.ts`), aplicación
(`application/auth/{ChangeOwnPassword,errors}.ts`), infraestructura (`DrizzleUserRepository.ts`,
`DrizzleSessionRepository.ts`, `http/{sessionContext,authLog,errorHandler,app}.ts`, `http/routes/{auth,users}.ts`,
`main.ts`) y web (`api/{authApi,userRules}.ts`, `components/AppLayout.tsx`, `pages/{ProfilePage,UsersPage}.tsx`,
`router.tsx`). Sin dependencias nuevas.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos embebidos en el diff (grep de patrones de clave/contraseña/token sin resultados fuera de tests); `.env` y `.env.*` en `.gitignore` |
| F-SAST-02 | ✅ | las consultas nuevas son Drizzle parametrizadas: `updatePasswordHash` (`.set({ passwordHash }).where(eq(id))`) y `deleteByUserIdExcept` (`and(eq(userId), ne(id))`); sin SQL armado con strings |
| F-SAST-03 | ✅ | nada del diff llega a exec/spawn/child_process |
| F-SAST-04 | ✅ | sin eval ni deserialización insegura; el body entra por `express.json` y se valida con `bodyObject`/`requiredString` |
| F-SAST-05 | ✅ | sin rutas de archivo construidas con datos de la solicitud |
| F-SAST-06 | ✅ | la web renderiza con JSX/antd (escape automático); sin `innerHTML` ni `dangerouslySetInnerHTML`; los mensajes del server se muestran como texto en `Alert` |
| F-SAST-07 | ✅ | sin solicitudes salientes del server guiadas por datos del usuario; la web solo llama a `/api/auth/password` por `request` |
| F-SAST-08 | ✅ | la contraseña nueva se guarda con argon2id (`Argon2PasswordHasher` existente); la comparación de la actual es `hasher.verify`; sin MD5/SHA1 para contraseñas |
| F-SAST-09 | ✅ | sin modo debug ni stack en respuestas; el 500 responde "Error interno" y el detalle va al log |
| F-SAST-10 | ✅ | `logAuthAttempt` recibe evento, resultado y email; nunca contraseñas ni token (`routes/auth.ts:79`, `:82`); tests verifican que ninguna contraseña aparece en el log ni en la respuesta |
| F-SAST-11 | ✅ | no hay superficie de subida de archivos |
| F-SAST-12 | ✅ | `POST /api/auth/password` exige `Content-Type: application/json` (`requireJson`) y la cookie de sesión es `SameSite=Strict`; además el cambio exige la contraseña actual |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilities (dependencias de producción y desarrollo) |
| F-SAST-14 | ✅ | validación en el borde: `currentPassword` string obligatorio de hasta 1024; `newPassword` string obligatorio con largo 8–1024 por `PasswordPolicy`; distinta de la actual por `assertChanged`; body acotado a 10 kb |
| F-SAST-15 | ✅ | los errores responden solo su mensaje fijo (`{ error }`); la contraseña actual incorrecta responde 400 sin revelar datos; errores inesperados → 500 genérico |
| F-SAST-16 | ✅ | sin paquetes nuevos en este ticket; ningún CVE conocido en el árbol según `npm audit` |
| F-SAST-17 | ✅ | sin rutas de código dinámicas ni `Function()`/`import()` con datos del usuario |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
