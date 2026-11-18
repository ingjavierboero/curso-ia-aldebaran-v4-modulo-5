import path from 'node:path';

// Valores de la config e2e como datos puros (FEAT-017b, ADR-011): sin imports de Playwright, para
// que `playwright.config.ts` los consuma y los tests de tooling de Vitest los importen sin efectos.

export const E2E_OUTPUT_DIR = 'test-results/e2e';
export const SERVER_PORT = 3000;
export const WEB_PORT = 5173;
export const WEB_SERVER_TIMEOUT_MS = 120_000;
export const GLOBAL_TIMEOUT_MS = 360_000;

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
/** Prefijo del directorio temporal de cada corrida (`mkdtemp` le suma un sufijo aleatorio). */
export const E2E_RUN_DIR_PREFIX = 'aldebaran-e2e-';

export interface E2eWebServer {
  command: string;
  url: string;
  cwd?: string;
  env?: Record<string, string>;
  reuseExistingServer: false;
  timeout: number;
}

/**
 * Fail closed: la base de la prueba tiene que ser una ruta absoluta estrictamente dentro de `tmpRoot`
 * (`os.tmpdir()`). Una ruta relativa, vacía o fuera de ahí lanza nombrando la ruta, antes de que
 * arranque ningún servidor: con `DATABASE_PATH` vacío el server caería a `data/aldebaran.db`.
 */
export function assertTempDatabasePath(databasePath: string, tmpRoot: string): void {
  if (databasePath === '' || !path.isAbsolute(databasePath)) {
    throw new Error(`La base e2e debe ser una ruta absoluta bajo ${tmpRoot}: "${databasePath}"`);
  }
  const root = path.resolve(tmpRoot);
  const resolved = path.resolve(databasePath);
  const relative = path.relative(root, resolved);
  const escapes = relative === '..' || relative.startsWith(`..${path.sep}`);
  if (relative === '' || escapes || path.isAbsolute(relative)) {
    throw new Error(`La base e2e debe quedar dentro de ${root}: "${databasePath}"`);
  }
}

/**
 * Fail closed sobre el directorio de la corrida, el que borra el teardown: ruta absoluta, hijo
 * DIRECTO de `tmpRoot` y con nombre `aldebaran-e2e-*`. Cualquier otro valor (también uno que venga
 * de `E2E_RUN_DIR` en el entorno) lanza nombrando la ruta, antes de usarlo o de borrarlo.
 */
export function assertRunDir(runDir: string, tmpRoot: string): void {
  if (runDir === '' || !path.isAbsolute(runDir)) {
    throw new Error(`El directorio e2e debe ser una ruta absoluta bajo ${tmpRoot}: "${runDir}"`);
  }
  const resolved = path.resolve(runDir);
  if (path.dirname(resolved) !== path.resolve(tmpRoot)) {
    throw new Error(`El directorio e2e debe ser hijo directo de ${tmpRoot}: "${runDir}"`);
  }
  const name = path.basename(resolved);
  if (!name.startsWith(E2E_RUN_DIR_PREFIX) || name.length === E2E_RUN_DIR_PREFIX.length) {
    throw new Error(`El directorio e2e debe llamarse ${E2E_RUN_DIR_PREFIX}*: "${runDir}"`);
  }
}

/** Entorno del server de la prueba: modo test y mock, con credenciales de email y del modelo vacías. */
export function serverEnv(databasePath: string): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: String(SERVER_PORT),
    DATABASE_PATH: databasePath,
    APP_URL: WEB_URL,
    MOCK_MODE: 'true',
    GMAIL_USER: '',
    GMAIL_APP_PASSWORD: '',
    EMAIL_REDIRECT_TO: '',
    // Playwright mezcla process.env: sin esto, una clave del shell del desarrollador llegaría al server.
    ANTHROPIC_API_KEY: '',
  };
}

/** Las dos entradas de `webServer`: el server sobre la base temporal y el build de la web en preview. */
export function webServers(databasePath: string): E2eWebServer[] {
  return [
    {
      command: 'npm exec --no -- tsx src/main.ts',
      cwd: 'server',
      url: `${SERVER_URL}/api/health`,
      env: serverEnv(databasePath),
      reuseExistingServer: false,
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
    {
      command: `npm run build -w web && npm run preview -w web -- --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
  ];
}

/**
 * Problemas de las entradas de `webServer`: `reuseExistingServer` distinto de `false` (ausente,
 * Playwright lo toma como `!CI` y reusaría un server de desarrollo) o `timeout` no numérico.
 */
export function webServerProblems(entries: readonly Record<string, unknown>[]): string[] {
  const problems: string[] = [];
  entries.forEach((entry, index) => {
    const label = typeof entry.command === 'string' ? entry.command : `#${index}`;
    if (entry.reuseExistingServer !== false) {
      problems.push(`webServer "${label}": reuseExistingServer debe ser false`);
    }
    if (typeof entry.timeout !== 'number' || !Number.isFinite(entry.timeout)) {
      problems.push(`webServer "${label}": falta un timeout numérico`);
    }
  });
  return problems;
}
