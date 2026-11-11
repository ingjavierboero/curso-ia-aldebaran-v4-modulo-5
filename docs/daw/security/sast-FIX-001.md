# SAST FIX-001

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Tools | gitleaks (historial `main..HEAD`; `dir` sobre `web/src/pages`), npm audit (npm 11), revisión manual del diff |
| Date | 2026-11-11 |
| Scope | diff de FIX-001 contra `main`: el literal del título en `web/src/pages/LoginPage.tsx:38` y el test `test_login_titulo_nombra_aldebaran` en `web/src/pages/LoginPage.test.tsx`; no cambian `package.json` ni `package-lock.json` |

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | gitleaks no encuentra leaks en el historial de la rama ni en `web/src/pages`; el diff es un texto visible |
| F-SAST-02 | ✅ | el diff no toca consultas a la base |
| F-SAST-03 | ✅ | sin `exec`, `spawn` ni `child_process` en el diff |
| F-SAST-04 | ✅ | sin `eval`, `new Function` ni deserialización en el diff |
| F-SAST-05 | ✅ | el diff no usa rutas de archivos |
| F-SAST-06 | ✅ | el título es un literal fijo que React renderiza escapado (`AuthCard` → `Typography.Title`); sin `dangerouslySetInnerHTML` |
| F-SAST-07 | ✅ | el diff no agrega requests salientes |
| F-SAST-08 | ✅ | el diff no toca criptografía ni el manejo de contraseñas |
| F-SAST-09 | ✅ | sin modo debug ni logs nuevos |
| F-SAST-10 | ✅ | el diff no agrega logs |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | el diff no cambia el formulario, la cookie ni las requests; sigue la protección CSRF de FEAT-001 |
| F-SAST-13 | ✅ | npm audit: 0 vulnerabilities |
| F-SAST-14 | ✅ | el diff no recibe input; las validaciones del formulario no cambian |
| F-SAST-15 | ✅ | el manejo de errores no cambia |
| F-SAST-16 | ✅ | sin dependencias nuevas ni cambios en el lockfile |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
