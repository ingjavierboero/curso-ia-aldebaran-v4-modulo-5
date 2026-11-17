# SAST FEAT-016

| Field | Value |
|-------|-------|
| Ticket | FEAT-016 |
| Tools | revisión manual del diff 0cc955c..01ee3f1, oxlint --type-aware, npm audit |
| Date | 2026-11-17 |

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos: `DuplicatePaymentPolicy.ts` no tiene claves, tokens ni conexiones |
| F-SAST-02 | ✅ | no hay consultas: la política es pura y no toca la base |
| F-SAST-03 | ✅ | nada llega a exec/spawn |
| F-SAST-04 | ✅ | sin eval ni deserialización |
| F-SAST-05 | ✅ | sin rutas de archivo |
| F-SAST-06 | ✅ | no genera HTML |
| F-SAST-07 | ✅ | sin fetch ni salidas de red |
| F-SAST-08 | ✅ | sin criptografía |
| F-SAST-09 | ✅ | sin configuración de debug |
| F-SAST-10 | ✅ | no registra nada (sin console ni logger); el CUIT no se loguea |
| F-SAST-11 | ✅ | sin superficie de subida de archivos |
| F-SAST-12 | ✅ | sin endpoints nuevos |
| F-SAST-13 | ❌ | `npm audit`: 7 High por GHSA-fc5q-39xc-vjpf (ReDoS en picomatch, rango `*`) vía vite, vitest, @vitest/coverage-v8, @vitejs/plugin-react, tinyglobby y fdir (package-lock.json:6368, picomatch 4.0.7); solo dependencias de desarrollo (`npm audit --omit=dev`: 0); aviso publicado después de FEAT-011; sin versión corregida; no lo introduce este ticket (lockfile sin cambios en el diff) |
| F-SAST-14 | ✅ | la entrada se valida en `normalize`: CUIT vacío o monto no entero positivo → datos no extraídos |
| F-SAST-15 | ✅ | no lanza excepciones ni expone detalles internos |
| F-SAST-16 | ✅ | sin dependencias nuevas |
| F-SAST-17 | ✅ | las expresiones regulares (`/[^a-z0-9]/g`, `/\D/g`) son lineales, sin backtracking |

## Suppressions
None.

Total: 16 clean, 1 vulnerabilities (0 critical, 1 high)
Result: BLOCKED

Decisión del usuario (2026-11-17): pausar FEAT-016 hasta que exista una versión corregida de
picomatch; la actualización va en un ticket aparte y FEAT-016 se retoma con un SAST nuevo.
