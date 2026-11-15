# SAST FEAT-005

| Field | Value |
|-------|-------|
| Ticket | FEAT-005 |
| Tools | revisión del diff `main..HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-15 |

Alcance: el diff de `feat/FEAT-005-dependabot` contra `main` (HEAD `2d67ac1`): `.github/dependabot.yml`
(config nueva) y `server/test/tooling/dependabot.test.ts` (test nuevo). Sin código de producto ni
dependencias nuevas.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | `dependabot.yml` no declara `registries` ni credenciales; el test no contiene secretos; `.env` y `.env.*` siguen en `.gitignore` |
| F-SAST-02 | ✅ | sin SQL en el diff |
| F-SAST-03 | ✅ | nada llega a exec/spawn; los `.exec(` del test son `RegExp.prototype.exec` |
| F-SAST-04 | ✅ | sin eval ni deserialización insegura; el YAML se lee como texto con regex, sin parser dinámico |
| F-SAST-05 | ✅ | `dependabot.test.ts` arma rutas con `join(repoRoot, …)` a partir de constantes del propio test, sin entrada de usuario |
| F-SAST-06 | ✅ | sin salida HTML |
| F-SAST-07 | ✅ | sin fetch ni red en el test |
| F-SAST-08 | ✅ | sin criptografía |
| F-SAST-09 | ✅ | sin modo debug ni `console.log` |
| F-SAST-10 | ✅ | no se registra nada |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | sin endpoints que cambien estado |
| F-SAST-13 | ✅ | `npm audit --omit=dev`: found 0 vulnerabilities |
| F-SAST-14 | ✅ | el test valida la forma del YAML (claves obligatorias, ecosistemas, manifiestos) y falla nombrando lo que falta |
| F-SAST-15 | ✅ | los errores del test nombran solo claves y rutas del repo |
| F-SAST-16 | ✅ | sin paquetes nuevos; Dependabot no agrega dependencias, solo propone versiones de las ya declaradas, por PR revisable (threat-FEAT-005 R-01/R-02) |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
