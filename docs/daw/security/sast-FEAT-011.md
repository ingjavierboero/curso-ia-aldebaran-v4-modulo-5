# SAST FEAT-011

| Field | Value |
|-------|-------|
| Ticket | FEAT-011 |
| Tools | revisión manual del diff `41f5bb8..0de6a0e` (39 archivos de server/src y web/src) con grep de patrones, `npm audit` 11, revisiones arch-auditor y module-verifier por bloque |
| Date | 2026-11-17 |

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos nuevos en el código; el diff no agrega credenciales ni claves; `.env` y `.env.*` siguen en `.gitignore` |
| F-SAST-02 | ✅ | `DrizzleSettingsRepository.ts` usa solo el query builder de Drizzle (select por clave primaria, `insert … onConflictDoUpdate`); los `sql` nuevos de `schema.ts` son CHECK construidos desde constantes del dominio (`sqlList(ISSUER_IVA_CONDITIONS…)`, `POINT_OF_SALE_MIN/MAX`, `ISSUER_TEXT_MAX_LENGTH`, `IIBB_MAX_LENGTH`) y literales de formato, nunca con entrada de usuario |
| F-SAST-03 | ✅ | nada llega a exec/spawn (los `.exec` del diff son `RegExp.exec` en `BillingHour.ts:19` y `ActivityStartDate.ts:28`) |
| F-SAST-04 | ✅ | sin eval ni `new Function`; el body pasa por `express.json` y los helpers de `body.ts` (incluido `optionalObject`, que solo lee campos con nombre) |
| F-SAST-05 | ✅ | ninguna entrada de usuario en rutas de archivos |
| F-SAST-06 | ✅ | sin innerHTML ni dangerouslySetInnerHTML; `SettingsPage.tsx` renderiza los textos del emisor y los mensajes del server como texto en componentes antd |
| F-SAST-07 | ✅ | no hay conexiones salientes nuevas |
| F-SAST-08 | ✅ | sin criptografía nueva |
| F-SAST-09 | ✅ | sin modos de debug nuevos |
| F-SAST-10 | ✅ | el ticket no agrega logs; `errorHandler` sigue registrando solo el error inesperado con un 500 genérico; `InvalidStoredValue` nombra `settings.<columna>` sin el valor guardado |
| F-SAST-11 | ✅ | no hay superficie de subida de archivos |
| F-SAST-12 | ✅ | la única escritura nueva es `PATCH /api/settings/billing`, bajo `requireJson` global y cookie `SameSite=Strict` |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilidades |
| F-SAST-14 | ✅ | entrada validada en el borde: forma del body (al menos un campo, `issuer` objeto no vacío, tipos exactos, `null` inválido, topes 200/50/10) y reglas de dominio para hora, punto de venta, condición del emisor, fecha (hasta hoy en Argentina con zona explícita) y textos con trim; permiso `settings.manage` con `assertCan` antes de validar y `requireActor` dentro de la transacción |
| F-SAST-15 | ✅ | los 6 errores de configuración responden 400 con mensajes fijos que no repiten el valor; una fila corrupta responde 500 genérico |
| F-SAST-16 | ✅ | `dayjs ^1.11.23` pasa a dependencia directa de `web`, misma versión que ya traía antd, sin paquetes nuevos en el lockfile; sin CVEs conocidas (`npm audit` 0) |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

## Observaciones (no son vulnerabilidades catalogadas)
- R-02 aceptado por el usuario: sin registro de quién cambia la configuración (solo `updated_at`).
- Deuda registrada en `docs/daw/specs/decisions-FEAT-011.md`: con una fila corrupta en `settings` el Admin recibe 500 y no la puede corregir desde la UI.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
