# SAST FEAT-002

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Tools | revisión del diff `main...HEAD` (grep de patrones + lectura), `npm audit` (npm 11.21.1), `oxlint --type-aware` |
| Date | 2026-11-12 |

Alcance: los 30 archivos de la rama `feat/FEAT-002-ci-pull-requests` contra `main` (sin `package-lock.json` ni `docs/` en la lectura; el lockfile se cubre con `npm audit`): `.github/workflows/ci.yml`, `.oxlintrc.json`, `package.json`, `AGENTS.md`, las correcciones de lint en `server/src`, `server/test`, `web/src` y los tests nuevos de `server/test/tooling` y `server/test/support`.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos en el diff; el workflow no referencia `secrets` ni `github.token` (lo verifica `test_ci_sin_secretos_rechazado`); `.env` sigue en `.gitignore:11` |
| F-SAST-02 | ✅ | no hay queries nuevas ni modificadas; la capa Drizzle no cambió |
| F-SAST-03 | ✅ | el único `execFile` es `server/test/tooling/lint.test.ts`, con binario y argumentos fijos en array, sin shell y con timeout (R-07); ningún dato de usuario llega a exec/spawn. En `ci.yml` ningún `run:` interpola `github.event.*` |
| F-SAST-04 | ✅ | sin `eval`, `new Function` ni deserialización insegura; los `.exec(` del diff son `RegExp.prototype.exec` en `server/test/tooling/ci.test.ts` |
| F-SAST-05 | ✅ | las rutas de los tests de tooling salen de `import.meta.url` y constantes; el archivo temporal usa `mkdtempSync` en `os.tmpdir()` |
| F-SAST-06 | ✅ | sin `innerHTML` ni `dangerouslySetInnerHTML`; los cambios en `web/src/pages/*.tsx` solo envuelven handlers con `void` |
| F-SAST-07 | ✅ | sin fetch saliente nuevo; el workflow solo descarga actions fijadas por SHA y paquetes del lockfile |
| F-SAST-08 | ✅ | sin cambios en criptografía; Argon2id de FEAT-001 intacto |
| F-SAST-09 | ✅ | sin flags de debug nuevos; `MOCK_MODE=true` solo en el paso de tests del CI |
| F-SAST-10 | ✅ | `server/src/infrastructure/http/authLog.ts` solo cambió de forma (arrows con llaves); lo que se registra no cambió |
| F-SAST-11 | ✅ | no hay superficie de upload |
| F-SAST-12 | ✅ | no hay formularios ni endpoints nuevos; la protección de sesión de FEAT-001 no cambió |
| F-SAST-13 | ✅ | `npm audit`: 0 vulnerabilidades (dependencias completas y `--omit=dev`) |
| F-SAST-14 | ✅ | la validación de entrada de las rutas de auth/setup no cambió; ningún handler de Express fue modificado |
| F-SAST-15 | ✅ | `errorHandler.ts` sin cambios; los handlers web conservan su try/catch y un rechazo escapado sigue siendo visible (`unhandledrejection`) |
| F-SAST-16 | ✅ | `oxlint` 1.93.0 y `oxlint-tsgolint` 7.0.2006 sin CVEs conocidas (`npm audit` limpio); actions `actions/checkout` v7.0.1 y `actions/setup-node` v7.1.0 fijadas por SHA de commit |
| F-SAST-17 | ✅ | sin rutas de código dinámico |

Riesgo aceptado (no es un hallazgo): R-09 del threat model, los scripts de instalación que corre `npm ci` en el CI, aceptado por Javier el 2026-11-12.

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
