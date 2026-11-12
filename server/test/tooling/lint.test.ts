import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const oxlintBin = path.join(repoRoot, 'node_modules', '.bin', 'oxlint');
const fixtureRelative = 'server/test/tooling/fixtures/floating-promise.ts';

interface RunResult {
  code: number;
  output: string;
}

function runOxlint(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    // timeout menor que el del test: un oxlint colgado se mata antes de que venza el test.
    execFile(oxlintBin, args, { cwd: repoRoot, timeout: 25_000 }, (error, stdout, stderr) => {
      let output = `${stdout}\n${stderr}`;
      let code = 0;
      if (error !== null) {
        if (typeof error.code === 'number') {
          code = error.code;
        } else {
          // ENOENT, timeout, etc.: la salida tiene que decir la causa real.
          code = 1;
          output += `\n${error.message}`;
        }
      }
      resolve({ code, output });
    });
  });
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8')) as unknown;
}

function readIgnorePatterns(): string[] {
  const config = readJson('.oxlintrc.json') as { ignorePatterns?: unknown };
  const patterns = config.ignorePatterns;
  if (!Array.isArray(patterns) || !patterns.every((p): p is string => typeof p === 'string')) {
    throw new Error('.oxlintrc.json debe declarar ignorePatterns como un array de strings');
  }
  return patterns;
}

// Semántica tipo gitignore, relativa a la raíz (donde vive .oxlintrc.json):
// - un "/" inicial ancla el patrón a la raíz;
// - un patrón sin "/" intermedio matchea en cualquier nivel;
// - si el patrón matchea un directorio, excluye todo lo que tiene adentro.
function isIgnoredBy(pattern: string, relativePath: string): boolean {
  const trimmed = pattern.replace(/\/+$/, '');
  let glob: string;
  if (trimmed.startsWith('/')) {
    glob = trimmed.slice(1);
  } else if (!trimmed.includes('/')) {
    glob = `**/${trimmed}`;
  } else {
    glob = trimmed;
  }
  const segments = relativePath.split('/');
  for (let i = 1; i <= segments.length; i++) {
    const candidate = segments.slice(0, i).join('/');
    if (path.posix.matchesGlob(candidate, glob)) return true;
  }
  return false;
}

const sourceSamples = [
  'server/src/main.ts',
  'server/src/domain/user/Email.ts',
  'server/src/infrastructure/http/app.ts',
  'server/test/domain/Email.test.ts',
  'server/vitest.config.ts',
  'server/drizzle.config.ts',
  'web/src/main.tsx',
  'web/src/pages/LoginPage.tsx',
  'web/src/router.test.tsx',
  'web/vite.config.ts',
];

describe('lint (oxlint con tipos)', () => {
  it(
    'test_promesa_flotante_rechazada',
    async () => {
      // `--no-ignore` no saltea los ignorePatterns de la config (verificado con oxlint 1.93):
      // se lintea con una copia de .oxlintrc.json sin ignorePatterns, pasada con -c.
      const config = readJson('.oxlintrc.json') as Record<string, unknown>;
      delete config.ignorePatterns;
      delete config.$schema;
      const tmpDir = mkdtempSync(path.join(tmpdir(), 'aldebaran-oxlint-'));
      const configPath = path.join(tmpDir, 'oxlintrc.json');
      writeFileSync(configPath, JSON.stringify(config));
      try {
        const { code, output } = await runOxlint(['--type-aware', '-c', configPath, fixtureRelative]);
        expect(output).toContain('no-floating-promises');
        expect(code).not.toBe(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it('test_ignore_invalido_que_excluye_codigo', () => {
    const pkg = readJson('package.json') as { scripts?: Record<string, string> };
    const lintScript = pkg.scripts?.lint;
    expect(lintScript, 'package.json debe declarar el script lint').toBeTypeOf('string');
    const tokens = (lintScript ?? '').trim().split(/\s+/);
    expect(tokens[0]).toBe('oxlint');
    expect(tokens).toContain('--type-aware');
    const positional = tokens.slice(1).filter((t) => !t.startsWith('-'));
    expect(positional, 'el script lint no debe limitar rutas').toEqual([]);

    const patterns = readIgnorePatterns();
    for (const pattern of patterns) {
      for (const sample of sourceSamples) {
        expect(
          isIgnoredBy(pattern, sample),
          `el patrón de ignore "${pattern}" excluye ${sample}`,
        ).toBe(false);
      }
    }
  });

  // Estático: no depende del binario ni de su tiempo de arranque, y verifica la misma config que
  // usa `npm run lint` (oxlint respeta ignorePatterns aun con la ruta explícita del fixture).
  it('test_lint_normal_ignora_fixture', () => {
    const patterns = readIgnorePatterns();
    expect(patterns.some((p) => isIgnoredBy(p, fixtureRelative))).toBe(true);
    // El vitest.config.ts raíz se ignora con un patrón anclado: los de server/ y web/ se lintean.
    expect(patterns.some((p) => isIgnoredBy(p, 'vitest.config.ts'))).toBe(true);
  });
});
