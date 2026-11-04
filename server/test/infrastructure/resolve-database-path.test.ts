import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDatabasePath } from '../../src/infrastructure/db/client.js';

describe('resolveDatabasePath', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aldebaran-root-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('con DATABASE_PATH definida la devuelve tal cual', () => {
    const custom = join(workDir, 'otra', 'base.db');

    expect(resolveDatabasePath({ DATABASE_PATH: custom })).toBe(custom);
  });

  it('sin DATABASE_PATH devuelve <raíz del repo>/data/aldebaran.db', () => {
    const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

    expect(resolveDatabasePath({})).toBe(join(repoRoot, 'data', 'aldebaran.db'));
  });

  it('la raíz es el package.json que declara workspaces, no el primer package.json ni AGENTS.md', () => {
    // <tmp>/repo/package.json con workspaces; <tmp>/repo/server/package.json sin workspaces;
    // un AGENTS.md señuelo dentro de server/ que el marcador viejo hubiera tomado como raíz.
    const repo = join(workDir, 'repo');
    const srcDir = join(repo, 'server', 'src', 'infrastructure', 'db');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', workspaces: ['server'] }));
    writeFileSync(join(repo, 'server', 'package.json'), JSON.stringify({ name: '@x/server' }));
    writeFileSync(join(repo, 'server', 'AGENTS.md'), '# señuelo');
    const moduleUrl = pathToFileURL(join(srcDir, 'client.js')).href;

    expect(resolveDatabasePath({}, moduleUrl)).toBe(join(repo, 'data', 'aldebaran.db'));
  });
});
