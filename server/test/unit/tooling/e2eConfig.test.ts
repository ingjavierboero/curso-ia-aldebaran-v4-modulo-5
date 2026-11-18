import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Fija la config de la prueba e2e (FEAT-017b, ADR-011). `e2e/e2eSettings.ts` se importa por URL y no
// con un import estático: queda fuera del `rootDir` de server/tsconfig.json. `playwright.config.ts` se
// lee como texto: importarlo cargaría Playwright y crearía el directorio temporal de la corrida.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const settingsUrl = new URL('../../../../e2e/e2eSettings.ts', import.meta.url);
const playwrightConfigPath = path.join(repoRoot, 'playwright.config.ts');

interface WebServerEntry {
  command: string;
  url: string;
  cwd?: string;
  env?: Record<string, string>;
  reuseExistingServer?: unknown;
  timeout?: unknown;
}

interface E2eSettings {
  E2E_OUTPUT_DIR: string;
  SERVER_PORT: number;
  WEB_PORT: number;
  WEB_SERVER_TIMEOUT_MS: number;
  GLOBAL_TIMEOUT_MS: number;
  WEB_URL: string;
  SERVER_URL: string;
  assertTempDatabasePath: (databasePath: string, tmpRoot: string) => void;
  assertRunDir: (runDir: string, tmpRoot: string) => void;
  serverEnv: (databasePath: string) => Record<string, string>;
  webServers: (databasePath: string) => WebServerEntry[];
  webServerProblems: (entries: readonly Record<string, unknown>[]) => string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === 'string');
}

function isWebServerEntry(value: unknown): value is WebServerEntry {
  return (
    isRecord(value) &&
    typeof value.command === 'string' &&
    typeof value.url === 'string' &&
    (value.cwd === undefined || typeof value.cwd === 'string') &&
    (value.env === undefined || isStringRecord(value.env))
  );
}

type UnknownFunction = (...args: unknown[]) => unknown;

function isFunction(value: unknown): value is UnknownFunction {
  return typeof value === 'function';
}

async function loadSettings(): Promise<E2eSettings> {
  const mod: unknown = await import(settingsUrl.href);
  if (!isRecord(mod)) throw new Error('e2e/e2eSettings.ts no exporta un módulo');
  const {
    E2E_OUTPUT_DIR,
    SERVER_PORT,
    WEB_PORT,
    WEB_SERVER_TIMEOUT_MS,
    GLOBAL_TIMEOUT_MS,
    WEB_URL,
    SERVER_URL,
    assertTempDatabasePath,
    assertRunDir,
    serverEnv,
    webServers,
    webServerProblems,
  } = mod;
  if (
    typeof E2E_OUTPUT_DIR !== 'string' ||
    typeof SERVER_PORT !== 'number' ||
    typeof WEB_PORT !== 'number' ||
    typeof WEB_SERVER_TIMEOUT_MS !== 'number' ||
    typeof GLOBAL_TIMEOUT_MS !== 'number' ||
    typeof WEB_URL !== 'string' ||
    typeof SERVER_URL !== 'string' ||
    !isFunction(assertTempDatabasePath) ||
    !isFunction(assertRunDir) ||
    !isFunction(serverEnv) ||
    !isFunction(webServers) ||
    !isFunction(webServerProblems)
  ) {
    throw new Error('e2e/e2eSettings.ts no exporta las constantes y funciones de la spec');
  }
  return {
    E2E_OUTPUT_DIR,
    SERVER_PORT,
    WEB_PORT,
    WEB_SERVER_TIMEOUT_MS,
    GLOBAL_TIMEOUT_MS,
    WEB_URL,
    SERVER_URL,
    assertTempDatabasePath: (databasePath, tmpRoot) => {
      assertTempDatabasePath(databasePath, tmpRoot);
    },
    assertRunDir: (runDir, tmpRoot) => {
      assertRunDir(runDir, tmpRoot);
    },
    serverEnv: (databasePath) => {
      const env: unknown = serverEnv(databasePath);
      if (!isStringRecord(env)) throw new Error('serverEnv debe devolver un objeto de strings');
      return env;
    },
    webServers: (databasePath) => {
      const entries: unknown = webServers(databasePath);
      if (!Array.isArray(entries) || !entries.every(isWebServerEntry)) {
        throw new Error('webServers debe devolver entradas con command y url');
      }
      return entries;
    },
    webServerProblems: (entries) => {
      const problems: unknown = webServerProblems(entries);
      if (!Array.isArray(problems) || !problems.every((p) => typeof p === 'string')) {
        throw new Error('webServerProblems debe devolver un array de strings');
      }
      return problems;
    },
  };
}

function readPlaywrightConfig(): string {
  return readFileSync(playwrightConfigPath, 'utf8');
}

const databasePath = path.join(tmpdir(), 'aldebaran-e2e-test', 'aldebaran-e2e.db');

describe('e2eConfig (config de Playwright para la prueba de humo)', () => {
  it('test_e2e_config_levanta_server_y_web_en_modo_prueba', async () => {
    const settings = await loadSettings();
    const entries = settings.webServers(databasePath);
    expect(entries).toHaveLength(2);
    const [server, web] = entries;

    expect(server?.command).toBe('npm exec --no -- tsx src/main.ts');
    expect(server?.cwd).toBe('server');
    expect(server?.url).toBe('http://localhost:3000/api/health');
    expect(server?.env).toEqual({
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_PATH: databasePath,
      APP_URL: 'http://localhost:5173',
      MOCK_MODE: 'true',
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
      EMAIL_REDIRECT_TO: '',
      ANTHROPIC_API_KEY: '',
    });
    expect(settings.serverEnv(databasePath)).toEqual(server?.env);
    // NFR-02 (W-01): Playwright mezcla process.env en el env del server; la clave del proveedor del
    // modelo se pisa con vacío para que la del shell del desarrollador no llegue. Ninguna otra clave
    // del proveedor aparece con valor.
    const providerKeys = Object.entries(server?.env ?? {}).filter(([k]) => /ANTHROPIC|API_KEY/i.test(k));
    expect(providerKeys).toEqual([['ANTHROPIC_API_KEY', '']]);

    expect(web?.command).toBe('npm run build -w web && npm run preview -w web -- --port 5173 --strictPort');
    expect(web?.url).toBe('http://localhost:5173');

    for (const entry of entries) {
      expect(entry.reuseExistingServer, entry.command).toBe(false);
    }
    expect(settings.SERVER_PORT).toBe(3000);
    expect(settings.WEB_PORT).toBe(5173);
    // W-04: las URLs se arman una sola vez con los puertos y las usan webServers() y la config.
    expect(settings.WEB_URL).toBe('http://localhost:5173');
    expect(settings.SERVER_URL).toBe('http://localhost:3000');
    expect(server?.url).toBe(`${settings.SERVER_URL}/api/health`);
    expect(web?.url).toBe(settings.WEB_URL);
    expect(settings.webServerProblems(entries.map((e) => ({ ...e })))).toEqual([]);
  });

  it('test_e2e_config_solo_chromium_y_evidencia_en_falla', async () => {
    const settings = await loadSettings();
    expect(settings.E2E_OUTPUT_DIR).toBe('test-results/e2e');

    const config = readPlaywrightConfig();
    // Un solo proyecto, chromium.
    expect(config.match(/\bprojects\s*:/g)).toHaveLength(1);
    expect([...config.matchAll(/\bname\s*:\s*'([^']*)'/g)].map((m) => m[1])).toEqual(['chromium']);
    expect(config).toMatch(/devices\['Desktop Chrome'\]/);
    // Evidencia solo en falla, en el outputDir de e2eSettings.
    expect(config).toMatch(/\btrace\s*:\s*'retain-on-failure'/);
    expect(config).toMatch(/\bscreenshot\s*:\s*'only-on-failure'/);
    expect(config).toMatch(/\boutputDir\s*:\s*E2E_OUTPUT_DIR\b/);
    expect(config).toMatch(/\bglobalTimeout\s*:\s*GLOBAL_TIMEOUT_MS\b/);
    // W-04: baseURL sale de WEB_URL, no de un literal.
    expect(config).toMatch(/\bbaseURL\s*:\s*WEB_URL\b/);
    expect(config).not.toMatch(/localhost:\d+/);
    expect(config).toMatch(/\bforbidOnly\s*:\s*!!process\.env\.CI\b/);
    expect(config).toMatch(/\bretries\s*:\s*0\b/);
    expect(config).toMatch(/\bworkers\s*:\s*1\b/);
    expect(config).toMatch(/\btestDir\s*:\s*'e2e'/);
    expect(config).toMatch(/\btestMatch\s*:\s*'\*\*\/\*\.e2e\.ts'/);
    expect(config).toMatch(/\bglobalTeardown\s*:\s*'\.\/e2e\/globalTeardown\.ts'/);
    // Fail closed: la config valida la base y las entradas de webServer antes de exportarse.
    expect(config).toMatch(/\bassertRunDir\s*\(/);
    expect(config).toMatch(/\bassertTempDatabasePath\s*\(/);
    expect(config).toMatch(/\bwebServerProblems\s*\(/);
  });

  it('test_e2e_base_fuera_de_tmp_rechazada', async () => {
    const settings = await loadSettings();
    const tmpRoot = tmpdir();
    expect(() => {
      settings.assertTempDatabasePath(databasePath, tmpRoot);
    }).not.toThrow();

    const rejected = [
      'aldebaran-e2e.db',
      'data/aldebaran.db',
      '',
      path.join(repoRoot, 'data', 'aldebaran.db'),
      // El prefijo sin separador no alcanza: /tmp-otro no está dentro de /tmp.
      `${tmpRoot}-otro${path.sep}aldebaran-e2e.db`,
      // Una ruta que sale de tmpdir con `..` tampoco.
      path.join(tmpRoot, '..', 'aldebaran-e2e.db'),
      `${tmpRoot}${path.sep}..${path.sep}aldebaran-e2e.db`,
      tmpRoot,
    ];
    for (const candidate of rejected) {
      expect(() => {
        settings.assertTempDatabasePath(candidate, tmpRoot);
      }, `"${candidate}" debería rechazarse`).toThrow(Error);
    }
    // El error nombra la ruta.
    const outside = path.join(repoRoot, 'data', 'aldebaran.db');
    expect(() => {
      settings.assertTempDatabasePath(outside, tmpRoot);
    }).toThrow(outside);

    // W-02: el directorio de la corrida, el que borra el teardown, tiene que ser hijo DIRECTO de
    // tmpdir() y llamarse aldebaran-e2e-*; si no, la config y el teardown lanzan antes de usarlo.
    const runDir = path.join(tmpRoot, 'aldebaran-e2e-abc123');
    expect(() => {
      settings.assertRunDir(runDir, tmpRoot);
    }).not.toThrow();
    const rejectedRunDirs = [
      // Bajo tmp, sin el prefijo.
      path.join(tmpRoot, 'otro-dir'),
      path.join(tmpRoot, 'aldebaran-e2e'),
      // Nieto de tmp, con el prefijo.
      path.join(tmpRoot, 'algo', 'aldebaran-e2e-abc123'),
      path.join(tmpRoot, 'aldebaran-e2e-abc123', 'aldebaran-e2e-def456'),
      // Fuera de tmp, relativo, vacío o tmp mismo.
      path.join(repoRoot, 'aldebaran-e2e-abc123'),
      'aldebaran-e2e-abc123',
      '',
      tmpRoot,
      `${tmpRoot}${path.sep}..${path.sep}aldebaran-e2e-abc123`,
    ];
    for (const candidate of rejectedRunDirs) {
      expect(() => {
        settings.assertRunDir(candidate, tmpRoot);
      }, `el directorio de corrida "${candidate}" debería rechazarse`).toThrow(Error);
    }
    // El teardown valida el directorio antes de borrarlo.
    const teardown = readFileSync(path.join(repoRoot, 'e2e', 'globalTeardown.ts'), 'utf8');
    const checkAt = teardown.search(/\bassertRunDir\s*\(/);
    const removeAt = teardown.search(/\brmSync\s*\(/);
    expect(checkAt, 'globalTeardown.ts debe llamar a assertRunDir').toBeGreaterThan(-1);
    expect(removeAt, 'globalTeardown.ts debe llamar a rmSync').toBeGreaterThan(-1);
    expect(checkAt, 'assertRunDir va antes de rmSync').toBeLessThan(removeAt);
  });

  it('test_e2e_reuso_de_server_existente_rechazado', async () => {
    const settings = await loadSettings();
    const valid = { command: 'a', url: 'http://localhost:1', reuseExistingServer: false, timeout: 120_000 };
    expect(settings.webServerProblems([valid])).toEqual([]);

    const reused = { command: 'reusado', url: 'http://localhost:1', reuseExistingServer: true, timeout: 120_000 };
    const noTimeout = { command: 'sin-timeout', url: 'http://localhost:2', reuseExistingServer: false };
    const problems = settings.webServerProblems([valid, reused, noTimeout]);
    expect(problems).toHaveLength(2);
    expect(problems.some((p) => p.includes('reusado') && p.includes('reuseExistingServer'))).toBe(true);
    expect(problems.some((p) => p.includes('sin-timeout') && p.includes('timeout'))).toBe(true);

    // Sin la clave también se rechaza: Playwright la toma como `!CI` y reusaría un server local.
    const missing = { command: 'sin-clave', url: 'http://localhost:3', timeout: 120_000 };
    expect(settings.webServerProblems([missing])).toHaveLength(1);
  });

  it('test_e2e_arranque_sin_respuesta_timeout_definido', async () => {
    const settings = await loadSettings();
    expect(settings.WEB_SERVER_TIMEOUT_MS).toBe(120_000);
    expect(settings.GLOBAL_TIMEOUT_MS).toBe(360_000);
    const entries = settings.webServers(databasePath);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.timeout, entry.command).toBe(120_000);
    }
    expect(readPlaywrightConfig()).toMatch(/\bglobalTimeout\s*:\s*GLOBAL_TIMEOUT_MS\b/);
  });
});
