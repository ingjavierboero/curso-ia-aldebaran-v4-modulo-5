import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Fija la regla de ADR-010: cada test del server vive en test/unit/ o en test/integration/ según lo
// que toca, y cada carpeta la corre un proyecto de Vitest distinto.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const serverRoot = path.join(repoRoot, 'server');
const serverTestDir = path.join(serverRoot, 'test');
const beforeListPath = fileURLToPath(
  new URL('./fixtures/test-files-before-FEAT-017a.txt', import.meta.url),
);

const LAYOUT_ROOTS = ['server/test/unit/', 'server/test/integration/'];

// --- Funciones puras: reciben datos y devuelven la lista de problemas ---

// Módulos que abren SQLite, levantan la app HTTP o usan red (D-02). authContext, catalogContext,
// settingsContext y passwordResetContext usan solo dobles en memoria y no están.
const FORBIDDEN_MODULES = [
  'sqliteTestDb',
  'better-sqlite3',
  'supertest',
  'testApp',
  'httpSession',
  'node:net',
  'node:http',
  'express',
];
// Se vetan las llamadas, no el módulo: client.js también exporta resolveDatabasePath.
const FORBIDDEN_CALLS = ['createDb', 'createApp'];

// Rutas relativas a la raíz del repo (server/test/...).
export function outsideLayout(paths: readonly string[]): string[] {
  return paths
    .filter((p) => !LAYOUT_ROOTS.some((root) => p.startsWith(root)))
    .map((p) => `${p} no está bajo server/test/unit/ ni server/test/integration/`);
}

// Un segmento del especificador coincide con el módulo vetado, ignorando la extensión del último:
// '../../support/sqliteTestDb.js', 'drizzle-orm/better-sqlite3/migrator', 'express'.
function specifierMatches(specifier: string, forbidden: string): boolean {
  if (specifier === forbidden) return true;
  return specifier
    .split('/')
    .map((segment) => segment.replace(/\.[cm]?[jt]s$/, ''))
    .includes(forbidden);
}

export function forbiddenInUnit(file: string, source: string): string[] {
  const specifiers = importSpecifiers(source);
  const problems: string[] = [];
  for (const forbidden of FORBIDDEN_MODULES) {
    if (specifiers.some((s) => specifierMatches(s, forbidden))) {
      problems.push(`${file} importa ${forbidden}`);
    }
  }
  for (const call of FORBIDDEN_CALLS) {
    if (new RegExp(`\\b${call}\\s*\\(`).test(source)) {
      problems.push(`${file} llama a ${call}(`);
    }
  }
  return problems;
}

// Rutas e includes relativos a server/ (donde viven los configs de Vitest).
export function projectCoverage(
  paths: readonly string[],
  includes: Readonly<Record<string, readonly string[]>>,
): string[] {
  const matchesProject = (file: string, globs: readonly string[]): boolean =>
    globs.some((glob) => path.posix.matchesGlob(file, glob));
  const problems: string[] = [];
  for (const file of paths) {
    const projects = Object.keys(includes).filter((name) =>
      matchesProject(file, includes[name] ?? []),
    );
    if (projects.length !== 1) {
      problems.push(
        `${file} matchea ${projects.length} proyectos (${projects.join(', ') || 'ninguno'})`,
      );
    }
  }
  for (const [name, globs] of Object.entries(includes)) {
    if (!paths.some((file) => matchesProject(file, globs))) {
      problems.push(`el proyecto ${name} no matchea ningún test`);
    }
  }
  return problems;
}

// before: rutas relativas a server/test/ previas a la mudanza; after: las de ahora.
export function missingAfterMove(before: readonly string[], after: readonly string[]): string[] {
  const current = new Set(after);
  return before
    .filter((file) => [`unit/${file}`, `integration/${file}`].filter((f) => current.has(f)).length !== 1)
    .map((file) => `${file} no está una sola vez en unit/ ni en integration/`);
}

// --- Lectura del repositorio ---

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((entry) => entry.split(path.sep).join('/'))
    .filter((entry) => entry.endsWith(suffix))
    .sort();
}

// Rutas de los .test.ts relativas a server/test/.
function serverTestFiles(): string[] {
  return listFiles(serverTestDir, '.test.ts');
}

// Especificadores de import estáticos, dinámicos y de efecto lateral.
function importSpecifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  return [...source.matchAll(pattern)].map((match) => match[1] ?? '');
}

// El fuente del test más el de los helpers de server/test/ que importa, en forma transitiva:
// "directa o indirectamente" (D-02). No se sigue a server/src/: resolveDatabasePath vive junto a
// createDb y no abre la base, por eso se veta la llamada y no el módulo.
function sourceWithTestHelpers(relativeToTestDir: string): string {
  const seen = new Set<string>();
  const pending = [path.join(serverTestDir, relativeToTestDir)];
  const sources: string[] = [];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    sources.push(source);
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts'));
      if (target.startsWith(serverTestDir + path.sep) && existsSync(target)) pending.push(target);
    }
  }
  return sources.join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// Importa un config de Vitest y devuelve su bloque `test`, sin suponer su forma.
async function importTestOptions(configUrl: URL): Promise<Record<string, unknown>> {
  const mod: unknown = await import(configUrl.href);
  if (!isRecord(mod) || !isRecord(mod.default) || !isRecord(mod.default.test)) {
    throw new Error(`${configUrl.pathname} debe exportar por defecto un config con bloque test`);
  }
  return mod.default.test;
}

describe('testLayout (tests separados en unit e integration)', () => {
  it('test_layout_todo_test_en_unit_o_integration', () => {
    const files = serverTestFiles().map((f) => `server/test/${f}`);
    expect(files.length).toBeGreaterThan(0);
    expect(outsideLayout(files)).toEqual([]);
    expect(files.every((f) => LAYOUT_ROOTS.some((root) => f.startsWith(root)))).toBe(true);
  });

  it('test_layout_unit_sin_base_ni_http', () => {
    const files = serverTestFiles();
    const unitFiles = files.filter((f) => f.startsWith('unit/'));
    const integrationFiles = files.filter((f) => f.startsWith('integration/'));
    expect(unitFiles.length).toBeGreaterThan(0);
    const problems = unitFiles.flatMap((f) =>
      forbiddenInUnit(`server/test/${f}`, sourceWithTestHelpers(f)),
    );
    expect(problems).toEqual([]);
    // Contracara del criterio: un test de integration/ que no toca base, HTTP ni red va en unit/.
    expect(integrationFiles.length).toBeGreaterThan(0);
    const misplaced = integrationFiles.filter(
      (f) => forbiddenInUnit(`server/test/${f}`, sourceWithTestHelpers(f)).length === 0,
    );
    expect(misplaced, 'tests de integration/ que no tocan base, HTTP ni red').toEqual([]);
  });

  it('test_layout_proyectos_disjuntos_y_no_vacios', async () => {
    // W-05: la raíz tiene que declarar los dos proyectos del server y el de web, o `npm test`
    // dejaría de correr alguno aunque su config exista.
    const rootOptions = await importTestOptions(new URL('../../../../vitest.config.js', import.meta.url));
    const rootProjects = rootOptions.projects;
    if (!isStringArray(rootProjects)) {
      throw new Error('vitest.config.ts debe declarar test.projects como un array de strings');
    }
    expect(rootProjects).toEqual(
      expect.arrayContaining([
        'server/vitest.unit.config.ts',
        'server/vitest.integration.config.ts',
        'web',
      ]),
    );

    const includes: Record<string, string[]> = {};
    for (const configFile of ['vitest.unit.config.js', 'vitest.integration.config.js']) {
      const { name, include } = await importTestOptions(
        new URL(`../../../${configFile}`, import.meta.url),
      );
      if (typeof name !== 'string') throw new Error(`${configFile} debe declarar test.name`);
      if (!isStringArray(include)) {
        throw new Error(`${configFile} debe declarar test.include como un array de strings`);
      }
      includes[name] = include;
    }
    expect(Object.keys(includes).sort()).toEqual(['server-integration', 'server-unit']);
    const files = serverTestFiles().map((f) => `test/${f}`);
    expect(projectCoverage(files, includes)).toEqual([]);
    // Defensa: cada proyecto tiene al menos un archivo propio.
    for (const [project, globs] of Object.entries(includes)) {
      expect(
        files.some((f) => globs.some((g) => path.posix.matchesGlob(f, g))),
        `el proyecto ${project} no matchea ningún test`,
      ).toBe(true);
    }
  });

  it('test_layout_scripts_por_tipo', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    expect(scripts['test:unit']).toBe('vitest run --project server-unit --project web');
    expect(scripts['test:integration']).toBe('vitest run --project server-integration');
    expect(scripts.test).toBe('vitest run');
  });

  it('test_layout_test_fuera_de_carpeta_rechazado', () => {
    const problems = outsideLayout([
      'server/test/unit/domain/Email.test.ts',
      'server/test/domain/X.test.ts',
      'server/test/integration/http/app.test.ts',
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('server/test/domain/X.test.ts');
  });

  it('test_layout_import_prohibido_en_unit_rechazado', () => {
    // Los fuentes sintéticos se arman por partes: este archivo vive en unit/ y se escanea a sí mismo.
    const fromKeyword = 'from';
    const openParen = '(';
    const withDb = forbiddenInUnit(
      'server/test/unit/application/A.test.ts',
      `import { createTestDb } ${fromKeyword} '../../support/sqliteTestDb.js';\n`,
    );
    expect(withDb).toHaveLength(1);
    expect(withDb[0]).toContain('server/test/unit/application/A.test.ts');
    expect(withDb[0]).toContain('sqliteTestDb');

    const withApp = forbiddenInUnit(
      'server/test/unit/http/B.test.ts',
      `const app = createApp${openParen}deps);\n`,
    );
    expect(withApp).toHaveLength(1);
    expect(withApp[0]).toContain('server/test/unit/http/B.test.ts');
    expect(withApp[0]).toContain(`createApp${openParen}`);

    expect(
      forbiddenInUnit(
        'server/test/unit/domain/C.test.ts',
        "import { createAuthContext } from '../../support/authContext.js';\n",
      ),
    ).toEqual([]);
  });

  it('test_layout_proyecto_vacio_rechazado', () => {
    const problems = projectCoverage(['test/unit/domain/A.test.ts', 'test/integration/http/B.test.ts'], {
      'server-unit': ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
      'server-integration': ['test/nada/**/*.test.ts'],
    });
    expect(problems.some((p) => p.includes('server-integration'))).toBe(true);
    expect(problems.some((p) => p.includes('test/integration/http/B.test.ts'))).toBe(false);
    const both = projectCoverage(['test/unit/domain/A.test.ts'], {
      'server-unit': ['test/unit/**/*.test.ts'],
      'server-integration': ['test/**/*.test.ts'],
    });
    expect(both).toHaveLength(1);
    expect(both[0]).toContain('test/unit/domain/A.test.ts');
  });

  it('test_layout_mudanza_conserva_los_98_archivos', () => {
    const before = readFileSync(beforeListPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
    expect(before).toHaveLength(98);
    expect(new Set(before).size).toBe(98);
    expect(missingAfterMove(before, serverTestFiles())).toEqual([]);
    const after = new Set(serverTestFiles());
    for (const file of before) {
      const matches = [`unit/${file}`, `integration/${file}`].filter((f) => after.has(f));
      expect(matches, `${file} debe existir una sola vez en unit/ o integration/`).toHaveLength(1);
    }
  });

  it('test_layout_archivo_previo_faltante_rechazado', () => {
    const problems = missingAfterMove(
      ['domain/Email.test.ts', 'domain/Fantasma.test.ts'],
      ['unit/domain/Email.test.ts', 'integration/http/app.test.ts'],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('domain/Fantasma.test.ts');
  });
});
