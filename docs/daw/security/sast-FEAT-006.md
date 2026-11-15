# SAST FEAT-006

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| Tools | revisión del diff `main..HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-15 |

Alcance: el diff de `feat/FEAT-006-usuarios-y-perfiles` contra `main` (HEAD `063bda1`; la vuelta desde VERIFY solo agrega 2 tests de aplicación, sin cambios de código de producto): dominio
(`domain/auth/Authorization.ts`, `domain/auth/errors.ts`, `domain/user/{User,AdminPolicy,errors,UserRepository}.ts`),
aplicación (`application/user/*`, `application/shared/Actor.ts`, `RegisterFirstAdmin.ts`), infraestructura
(`DrizzleUserRepository.ts`, `DrizzleSessionRepository.ts`, `DrizzleUnitOfWork.ts`, `schema.ts`,
`http/routes/users.ts`, `http/body.ts`, `http/errorHandler.ts`, `http/app.ts`, `main.ts`) y web
(`api/{client,usersApi,userRules,authApi,types}.ts`, `components/AppLayout.tsx`, `pages/{UsersPage,HomePage}.tsx`,
`router.tsx`). Sin dependencias nuevas.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos embebidos en el diff; las contraseñas de los tests son datos de prueba en memoria/SQLite de test; `.env` y `.env.*` están en `.gitignore` |
| F-SAST-02 | ✅ | todas las consultas nuevas son Drizzle con parámetros (`eq`, `and`, `asc`, `.set()`); sin SQL armado con strings |
| F-SAST-03 | ✅ | nada llega a exec/spawn; los `.exec(` del diff son `RegExp.prototype.exec` |
| F-SAST-04 | ✅ | sin eval ni deserialización insegura; el body lo parsea `express.json` con límite de 10 kB |
| F-SAST-05 | ✅ | sin entrada de usuario en rutas de archivos |
| F-SAST-06 | ✅ | `UsersPage.tsx` y `AppLayout.tsx` muestran nombres, emails y mensajes de error como texto en componentes antd (React escapa); sin `dangerouslySetInnerHTML` ni `innerHTML` |
| F-SAST-07 | ✅ | la web solo llama rutas fijas propias (`/api/users`, `/api/users/:id/...`); el id va con `encodeURIComponent` |
| F-SAST-08 | ✅ | la contraseña inicial se hashea con el `PasswordHasher` argon2id existente; sin criptografía nueva |
| F-SAST-09 | ✅ | sin modo debug ni `console.log` en producción |
| F-SAST-10 | ✅ | `routes/users.ts` no loguea el body (contiene la contraseña); `errorHandler` sigue filtrando los parámetros de `DrizzleQueryError`; un test verifica que la contraseña no aparece en los logs |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | las escrituras nuevas (POST/PATCH) pasan por `requireJson` (415 sin `Content-Type: application/json`), lo que exige preflight cross-site; cookie de sesión `SameSite=Strict` |
| F-SAST-13 | ✅ | `npm audit --omit=dev`: found 0 vulnerabilities |
| F-SAST-14 | ✅ | `routes/users.ts` valida forma y largos (`bodyObject`, `requiredString`, `optionalString`); el dominio valida nombre, email, perfil y contraseña; autorización deny-by-default (`assertCan`) y relectura del actor dentro de la transacción |
| F-SAST-15 | ✅ | los errores devuelven `{ error }` con mensajes fijos; 403 sin datos de usuarios; los 500 no exponen stack |
| F-SAST-16 | ✅ | sin paquetes nuevos |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
