# SAST FEAT-017a

| Field | Value |
|-------|-------|
| Ticket | FEAT-017a |
| Tools | revisión manual del diff contra `main` (grep de patrones), `npm audit --omit=dev` (ADR-009) |
| Date | 2026-11-17 |

Alcance: `.github/workflows/ci.yml`, `vitest.config.ts`, `server/vitest.unit.config.ts`,
`server/vitest.integration.config.ts`, `server/tsconfig.json`, `.oxlintrc.json`, `package.json`,
`server/package.json`, `AGENTS.md`, `server/test/unit/tooling/{testLayout,ci,lint}.test.ts` y los 98
tests movidos (solo cambian imports y rutas). No hay código de producción nuevo ni modificado.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin secretos embebidos: el workflow no referencia `secrets.*`, `github.token`, `ANTHROPIC` ni `API_KEY`, y `ci.test.ts` lo exige; `.env` y `.env.*` están en `.gitignore` |
| F-SAST-02 | ✅ | sin consultas nuevas; los tests movidos no cambian su cuerpo |
| F-SAST-03 | ✅ | el único subproceso es `execFile` de `oxlint` en `lint.test.ts`, con argumentos fijos y sin shell (sin cambios salvo rutas); el workflow corre solo comandos fijos de `package.json` |
| F-SAST-04 | ✅ | sin `eval`; los `import()` de `testLayout.test.ts` cargan configs del repo por ruta fija y el resultado se valida como `unknown` |
| F-SAST-05 | ✅ | `testLayout.test.ts` y `ci.test.ts` leen rutas fijas relativas a `import.meta.url`; no hay entrada de usuario |
| F-SAST-06 | ✅ | sin salida HTML |
| F-SAST-07 | ✅ | sin requests salientes |
| F-SAST-08 | ✅ | sin criptografía nueva |
| F-SAST-09 | ✅ | sin configuración de producción tocada; `MOCK_MODE` solo en el workflow de CI |
| F-SAST-10 | ✅ | nada sensible se registra; los mensajes de los chequeos nombran claves y rutas del repositorio |
| F-SAST-11 | ✅ | sin superficie de subida de archivos |
| F-SAST-12 | ✅ | sin formularios ni endpoints nuevos |
| F-SAST-13 | ✅ | `npm audit --omit=dev`: found 0 vulnerabilities |
| F-SAST-14 | ✅ | sin entradas de usuario nuevas; los configs importados se validan con narrowing antes de usarse |
| F-SAST-15 | ✅ | sin manejo de errores expuesto a usuarios |
| F-SAST-16 | ✅ | sin dependencias nuevas ni acciones nuevas: las mismas `actions/checkout` y `actions/setup-node` fijadas por los mismos SHA |
| F-SAST-17 | ✅ | sin rutas de código dinámico más allá de los `import()` por ruta fija descriptos en F-SAST-04 |

Además del catálogo, el workflow mantiene `permissions: contents: read` sin permisos por job,
`persist-credentials: false` en los tres checkouts, solo `pull_request` y `timeout-minutes: 10` por job
(threat-FEAT-017a R-01..R-05), todo fijado por `ci.test.ts`.

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
