import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  assertRunDir,
  assertTempDatabasePath,
  E2E_OUTPUT_DIR,
  E2E_RUN_DIR_PREFIX,
  GLOBAL_TIMEOUT_MS,
  WEB_URL,
  webServerProblems,
  webServers,
} from './e2e/e2eSettings.js';

// Prueba de humo e2e (FEAT-017b, ADR-011). Los valores viven en e2e/e2eSettings.ts.
// Los workers heredan E2E_RUN_DIR: el directorio temporal se crea una sola vez por corrida, y lo
// borra e2e/globalTeardown.ts.
process.env.E2E_RUN_DIR ??= mkdtempSync(join(tmpdir(), E2E_RUN_DIR_PREFIX));
const runDir = process.env.E2E_RUN_DIR;

// Fail closed: si el directorio de la corrida (también uno que venga del entorno) no es un
// aldebaran-e2e-* hijo directo de os.tmpdir(), si la base no queda ahí, o si una entrada de
// webServer podría reusar un server existente o no tiene timeout, la config lanza y no arranca
// ningún servidor.
assertRunDir(runDir, tmpdir());
const databasePath = join(runDir, 'aldebaran-e2e.db');
assertTempDatabasePath(databasePath, tmpdir());
const servers = webServers(databasePath);
const problems = webServerProblems(servers.map((entry) => ({ ...entry })));
if (problems.length > 0) {
  throw new Error(`Config e2e inválida: ${problems.join('; ')}`);
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: E2E_OUTPUT_DIR,
  retries: 0,
  workers: 1,
  forbidOnly: !!process.env.CI,
  globalTimeout: GLOBAL_TIMEOUT_MS,
  globalTeardown: './e2e/globalTeardown.ts',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: servers,
});
