# SAST FEAT-010

| Field | Value |
|-------|-------|
| Ticket | FEAT-010 |
| Tools | revisión manual del diff `5d6b4cb..15baf69` (server/src, web/src) con grep de patrones, `npm audit` 11, revisiones arch-auditor por bloque |
| Date | 2026-11-16 |

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos nuevos en el código; el diff no agrega credenciales ni claves; `.env` sigue en `.gitignore` |
| F-SAST-02 | ✅ | todas las consultas nuevas usan el query builder de Drizzle (`DrizzleClientRepository.ts`, `DrizzleProductRepository.ts`, `DrizzleClientProductRepository.ts`); los `sql` de `schema.ts` son CHECK construidos desde constantes del dominio (`sqlList` de `IVA_CONDITIONS`, `CLIENT_STATUSES`, `CURRENCIES`, `PRODUCT_STATUSES`), nunca con entrada de usuario |
| F-SAST-03 | ✅ | nada llega a exec/spawn (los `.exec` del diff son `RegExp.exec` en `Price.ts` y `catalogRules.ts`) |
| F-SAST-04 | ✅ | sin eval ni `new Function`; los bodies pasan por `express.json` y los helpers de `body.ts` |
| F-SAST-05 | ✅ | ninguna entrada de usuario en rutas de archivos |
| F-SAST-06 | ✅ | sin innerHTML ni dangerouslySetInnerHTML en las pantallas nuevas; React escapa razón social, domicilio y nombres |
| F-SAST-07 | ✅ | no hay conexiones salientes nuevas |
| F-SAST-08 | ✅ | sin criptografía nueva; contraseñas sin cambios (argon2id) |
| F-SAST-09 | ✅ | sin modos de debug nuevos |
| F-SAST-10 | ✅ | el ticket no agrega logs; `errorHandler` registra solo el error inesperado y responde un 500 genérico; `InvalidStoredValue` nombra tabla y columna sin el valor guardado |
| F-SAST-11 | ✅ | no hay superficie de subida de archivos |
| F-SAST-12 | ✅ | todas las escrituras nuevas son POST/PATCH bajo `requireJson` con cookie `SameSite=Strict`; desasignar va por POST, sin DELETE |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilidades |
| F-SAST-14 | ✅ | entrada validada en el borde: largos máximos por campo, `requiredInteger` para la condición IVA, `requiredStringArray` (1–50, ≤64, sin repetidos) para asignaciones, precio solo como texto con gramática fija, `boundedParam` para `:id`; reglas de dominio para CUIT, IVA, precio y nombres; permisos `clients.*`/`products.*` en cada caso de uso |
| F-SAST-15 | ✅ | los errores de dominio responden mensajes fijos sin ids ni SQL; filas corruptas → 500 genérico |
| F-SAST-16 | ✅ | sin dependencias nuevas |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

## Observaciones (no son vulnerabilidades catalogadas)
- Deuda registrada en `docs/daw/specs/decisions-FEAT-010.md`: `routes/users.ts` no acota el largo de `:id` como las rutas nuevas; `DrizzleUserRepository` responde 400 ante un email corrupto guardado en lugar de 500.
- R-06 aceptado por el usuario: sin registro de quién modifica un cliente hasta el ticket de historial.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
