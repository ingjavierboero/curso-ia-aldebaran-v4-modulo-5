# SAST FEAT-017b

| Field | Value |
|-------|-------|
| Ticket | FEAT-017b |
| Tools | revisión manual del diff contra `main` (grep de patrones), `npm audit --omit=dev` (ADR-009), `npm audit` (informativo) |
| Date | 2026-11-17 |

Alcance: `e2e/e2eSettings.ts`, `e2e/globalTeardown.ts`, `e2e/smoke.e2e.ts`, `playwright.config.ts`,
`tsconfig.e2e.json`, `tsconfig.json`, `package.json`, `package-lock.json`, `.gitignore`, `AGENTS.md`,
`.github/workflows/ci.yml` (job `e2e`) y los tests de tooling `e2eConfig`, `testLayout`, `lint` y `ci`.
No hay código de producción nuevo ni modificado.

| Rule | Verdict | Notes |
|---|---|---|
| F-SAST-01 | ✅ | sin credenciales literales: `e2e/smoke.e2e.ts:8-9` genera email y contraseña con `randomUUID` en cada corrida; `serverEnv` deja vacías `GMAIL_*`, `EMAIL_REDIRECT_TO` y `ANTHROPIC_API_KEY`; el job `e2e` no referencia secretos (lo fija `ci.test.ts`) |
| F-SAST-02 | ✅ | sin consultas nuevas; la prueba usa la API pública de la app |
| F-SAST-03 | ✅ | los comandos de `webServers()` y del job son literales fijos, sin entrada de usuario; `npx --no-install`/`npm exec --no` impiden resolver paquetes fuera del lockfile |
| F-SAST-04 | ✅ | sin `eval`; los `import()` de los tests cargan `e2e/e2eSettings.ts` por ruta fija |
| F-SAST-05 | ✅ | `e2e/globalTeardown.ts:11` hace `rmSync` recursivo solo después de `assertRunDir`: hijo directo de `os.tmpdir()` y llamado `aldebaran-e2e-*`, también si `E2E_RUN_DIR` viene del entorno; la config falla cerrada con cualquier otra ruta |
| F-SAST-06 | ✅ | sin salida HTML nueva |
| F-SAST-07 | ✅ | la prueba solo navega a `WEB_URL` (localhost) |
| F-SAST-08 | ✅ | sin criptografía nueva; `randomUUID` solo genera datos de prueba |
| F-SAST-09 | ✅ | `NODE_ENV=test` solo en el server de la prueba (apaga `Secure` para http local); la config de producción no cambia |
| F-SAST-10 | ✅ | sin logs nuevos; las trazas con datos de prueba se publican solo si la etapa falla, 7 días (threat-FEAT-017b R-03) |
| F-SAST-11 | ✅ | sin superficie de subida |
| F-SAST-12 | ✅ | sin formularios ni endpoints nuevos |
| F-SAST-13 | ✅ | `npm audit --omit=dev`: found 0 vulnerabilities. Informativo (ADR-009): `npm audit` completo sigue en 7 high por GHSA-fc5q-39xc-vjpf (picomatch, solo dev vía vite/vitest, sin versión corregida), igual que en `main`; `@playwright/test` y `playwright` no aparecen en el audit |
| F-SAST-16 | ✅ | dependencias nuevas: `@playwright/test` 1.65.1 exacta (una transitiva, `playwright`/`playwright-core` 1.65.1) sin CVE conocidas; acción nueva `actions/upload-artifact` v7.0.2 fijada por SHA `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| F-SAST-14 | ✅ | sin entradas de usuario nuevas; las rutas de la config se validan con `assertTempDatabasePath`/`assertRunDir` y las entradas de `webServer` con `webServerProblems` |
| F-SAST-15 | ✅ | los errores de la config nombran solo rutas de tmp; sin manejo de errores expuesto a usuarios |
| F-SAST-17 | ✅ | sin rutas de código dinámico más allá de los `import()` por ruta fija descriptos en F-SAST-04 |

## Suppressions
None.

Total: 17 clean, 0 vulnerabilities (0 critical, 0 high)
Result: PASSED
