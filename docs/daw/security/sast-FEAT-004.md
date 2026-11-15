# SAST FEAT-004

| Field | Value |
|-------|-------|
| Ticket | FEAT-004 |
| Tools | revisión del diff `main..HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-14 |

Alcance: el diff de `feat/FEAT-004-salud-sesion-y-errores` contra `main` (HEAD `45be6ba`):
`server/src/domain/health/HealthEvaluation.ts`, `server/src/application/health/{GetHealth,HealthEventLog}.ts`,
`server/src/infrastructure/db/parseIsoDate.ts`, `server/src/infrastructure/logging/healthEventLog.ts`,
`server/src/infrastructure/http/routes/health.ts`, `server/src/main.ts`,
`web/src/api/{authApi,healthApi,types}.ts` y `web/src/components/HealthBanner.tsx`. Sin dependencias nuevas.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos embebidos en los archivos del diff; `.env` y `.env.*` están en `.gitignore` |
| F-SAST-02 | ✅ | sin SQL nuevo en producción; las lecturas de `job_runs` siguen por Drizzle con parámetros (FEAT-003) |
| F-SAST-03 | ✅ | nada llega a exec/spawn |
| F-SAST-04 | ✅ | sin eval ni deserialización insegura |
| F-SAST-05 | ✅ | sin entrada de usuario en rutas de archivos |
| F-SAST-06 | ✅ | `HealthBanner.tsx` muestra los nombres como string en `description` de antd `Alert` (React escapa); sin `dangerouslySetInnerHTML` |
| F-SAST-07 | ✅ | el banner solo llama rutas fijas propias (`/api/health`, `/api/auth/session`); sin fetch dirigido por entrada |
| F-SAST-08 | ✅ | sin criptografía nueva |
| F-SAST-09 | ✅ | sin modo debug ni `console.log` en producción |
| F-SAST-10 | ✅ | `healthEventLog.ts` registra solo `{ event, job, errorType, at }`; `GetHealth.ts` pasa `err.name`, nunca `err.message` (que puede traer el valor guardado); sin token, email ni IP |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | sin endpoints que cambien estado; `GET /api/health` y `GET /api/auth/session` son lecturas |
| F-SAST-13 | ✅ | `npm audit --omit=dev`: found 0 vulnerabilities |
| F-SAST-14 | ✅ | `healthApi.ts` valida la forma completa de la respuesta, incluido `readFailed` booleano; una forma inválida es `NetworkError` |
| F-SAST-15 | ✅ | la respuesta de salud no expone errores internos: solo el booleano `readFailed`; la anónima sigue siendo `{ status }` |
| F-SAST-16 | ✅ | sin paquetes nuevos |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
