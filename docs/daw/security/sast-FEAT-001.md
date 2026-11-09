# SAST FEAT-001

| Field | Value |
|-------|-------|
| Ticket | FEAT-001 |
| Tools | gitleaks (historial: 9 commits; `dir` sobre `server/src` y `web/src`), npm audit (npm 11), barrido manual con grep, triage de daw-sec-auditor |
| Date | 2026-11-09 |
| Scope | `server/src` y `web/src` en `32250e3` más las correcciones de este cierre; `package.json`/`package-lock.json` de los tres workspaces |

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | gitleaks sin leaks en el historial ni en el código; `.env`, `.env.*` y `data/*.db*` en `.gitignore`; `git ls-files` sin `.env`, `.db`, `.pem` ni `.key` |
| F-SAST-02 | ✅ | todas las consultas por Drizzle con `eq()` parametrizado; el único template `sql` son los CHECK con literales de `server/src/infrastructure/db/schema.ts:21`; sin `sql.raw` |
| F-SAST-03 | ✅ | sin `exec`, `execSync`, `spawn` ni `child_process` en `server/src` ni `web/src` |
| F-SAST-04 | ✅ | sin `eval` ni `new Function`; el único `JSON.parse` lee el `package.json` raíz (`server/src/infrastructure/db/paths.ts:27`), no input del usuario |
| F-SAST-05 | ✅ | `readFileSync` solo en `server/src/infrastructure/db/paths.ts:27`, con una ruta que no depende de input del usuario |
| F-SAST-06 | ✅ | sin `innerHTML` ni `dangerouslySetInnerHTML`; React escapa los mensajes del server; la web no lee `document.cookie` ni usa storage |
| F-SAST-07 | ✅ | el único `fetch` (`web/src/api/authApi.ts:66`) va a paths literales de `/api`; el server no hace requests salientes |
| F-SAST-08 | ✅ | contraseñas con argon2id 19456/2/1 (`Argon2PasswordHasher.ts:16`); tokens de sesión de `randomBytes(32)` guardados como SHA-256 (no es hash de contraseña); hash dummy en el login sin usuario (R-02) |
| F-SAST-09 | ✅ | sin modo debug; `errorHandler` nunca expone stack; la cookie `Secure` es el default salvo `NODE_ENV` `development`/`test` (corregido en este cierre: antes requería `NODE_ENV=production`, `server/src/infrastructure/http/sessionCookie.ts:8`) |
| F-SAST-10 | ✅ | `logAuthAttempt` registra event/outcome/email/ip/at, nunca contraseña ni token. Corregido en este cierre: un email inválido se registra como `null` (`server/src/infrastructure/http/authLog.ts:27`) y un `DrizzleQueryError` se registra sin sus params (`server/src/infrastructure/http/errorHandler.ts:42`) |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | cookie httpOnly + SameSite=Strict (`sessionCookie.ts:13`) y 415 a POST/PUT/PATCH sin `application/json` (`requireJson.ts`); sin middleware CORS; logout es POST |
| F-SAST-13 | ✅ | npm audit: 0 critical, 0 high |
| F-SAST-14 | ✅ | `bodyObject`/`requiredString` validan en el borde (email ≤ 254, contraseña ≤ 1024, body ≤ 10 kB); corregido en este cierre: `name` con máximo de 100 en el borde (`server/src/infrastructure/http/routes/setup.ts:35`); regex de email sin riesgo de ReDoS |
| F-SAST-15 | ✅ | 500 con `{ error: "Error interno" }` sin stack (`errorHandler.ts`); mensajes fijos para los errores del parser; 401 idéntico exista o no el email |
| F-SAST-16 | ✅ | corregido en este cierre: GHSA-67mh-4wv8-2f99 (esbuild ≤ 0.24.2, CVSS 5.3) llegaba como `esbuild@0.18.20` vía `drizzle-kit` → `@esbuild-kit/core-utils` (`package-lock.json`); el triage lo dio por no alcanzable (solo `transform`/`transformSync`, nunca `serve`). Override `"@esbuild-kit/core-utils": { "esbuild": "0.25.12" }` en el `package.json` raíz; `npm ls esbuild` sin 0.18.x, `npm audit` → 0 vulnerabilities, `db:generate` sin cambios de schema |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

## Low / Informational
Ninguno abierto: los cuatro que reportó el triage (email inválido en el log, params de `DrizzleQueryError` en el log, cookie `Secure` atada a `NODE_ENV=production`, `name` sin máximo en el borde) se corrigieron en este cierre, cada uno con un test que estuvo en rojo antes del fix.

Fuera del código del ticket queda una observación del implementer: `server/src/main.ts` registra `err.stack` en `startup_failed`. En el arranque no hay datos de usuarios, así que no aplica hoy.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
