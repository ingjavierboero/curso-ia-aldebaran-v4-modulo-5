import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Se lee como texto a propósito: el spec pide no sumar un parser de YAML como dependencia.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const dependabotPath = join(repoRoot, '.github', 'dependabot.yml');

function readDependabot(): string {
  return readFileSync(dependabotPath, 'utf8');
}

interface Line {
  indent: number;
  text: string;
}

// Quita comentarios (de línea completa y finales) y líneas vacías, y guarda la indentación.
// El archivo no tiene `#` dentro de strings, así que alcanza con cortar en ` #`.
function toLines(raw: string): Line[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, '').trimEnd())
    .filter((line) => line.trim() !== '')
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return quoted?.[2] ?? trimmed;
}

// Las líneas hijas de `lines[index]`: todas las siguientes más indentadas que ella.
function childrenOf(lines: Line[], index: number): Line[] {
  const parent = lines[index];
  if (parent === undefined) {
    return [];
  }
  const children: Line[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.indent <= parent.indent) {
      break;
    }
    children.push(line);
  }
  return children;
}

// Las claves de primer nivel de un bloque (las de menor indentación), con su valor en línea.
function ownKeys(block: Line[]): Map<string, { value: string; index: number }> {
  const keys = new Map<string, { value: string; index: number }>();
  if (block.length === 0) {
    return keys;
  }
  const level = Math.min(...block.map((line) => line.indent));
  block.forEach((line, index) => {
    const match = /^([\w-]+):(?:\s+(.*))?$/.exec(line.text);
    if (line.indent === level && match?.[1] !== undefined) {
      keys.set(match[1], { value: unquote(match[2] ?? ''), index });
    }
  });
  return keys;
}

function childBlock(block: Line[], key: string): Line[] {
  const entry = ownKeys(block).get(key);
  return entry === undefined ? [] : childrenOf(block, entry.index);
}

interface UpdateEntry {
  ecosystem: string;
  directory: string;
  interval: string;
  lines: Line[];
}

function entryValue(entry: UpdateEntry, key: string): string | undefined {
  return ownKeys(entry.lines).get(key)?.value;
}

function entryChild(entry: UpdateEntry, key: string): Line[] {
  return childBlock(entry.lines, key);
}

// Cada ítem `- ` de `updates:` se convierte en un bloque cuyas claves propias son las que están a la
// altura de la primera (`- package-ecosystem:` pasa a ser `package-ecosystem:` dos columnas más
// adentro). Lanza un error que nombra la clave obligatoria que falte.
function readUpdates(raw: string): UpdateEntry[] {
  const block = childBlock(toLines(raw), 'updates');
  if (block.length === 0) {
    throw new Error('falta la clave obligatoria `updates`');
  }
  const itemIndent = Math.min(...block.map((line) => line.indent));
  const items: Line[][] = [];
  for (const line of block) {
    if (line.indent === itemIndent && line.text.startsWith('- ')) {
      items.push([{ indent: itemIndent + 2, text: line.text.slice(2).trim() }]);
    } else {
      items.at(-1)?.push(line);
    }
  }
  return items.map((lines, position) => {
    const keys = ownKeys(lines);
    const ecosystem = keys.get('package-ecosystem')?.value;
    if (ecosystem === undefined || ecosystem === '') {
      throw new Error(`la entrada ${String(position)} de \`updates\` no tiene \`package-ecosystem\``);
    }
    const directory = keys.get('directory')?.value;
    if (directory === undefined || directory === '') {
      throw new Error(`la entrada \`${ecosystem}\` no tiene \`directory\``);
    }
    const interval = ownKeys(childBlock(lines, 'schedule')).get('interval')?.value;
    if (interval === undefined || interval === '') {
      throw new Error(`la entrada \`${ecosystem}\` no tiene \`schedule.interval\``);
    }
    return { ecosystem, directory, interval, lines };
  });
}

// El `directory` de cada ecosistema tiene que contener su manifiesto, relativo a la raíz del repo.
function assertManifest(ecosystem: string, directory: string): void {
  const base = join(repoRoot, directory);
  const required: Record<string, { path: string; dir: boolean }[]> = {
    npm: [
      { path: 'package.json', dir: false },
      { path: 'package-lock.json', dir: false },
    ],
    'github-actions': [{ path: join('.github', 'workflows'), dir: true }],
  };
  const manifests = required[ecosystem];
  if (manifests === undefined) {
    throw new Error(`ecosistema no soportado: \`${ecosystem}\` (directory \`${directory}\`)`);
  }
  for (const manifest of manifests) {
    const full = join(base, manifest.path);
    const ok = existsSync(full) && (manifest.dir ? statSync(full).isDirectory() : statSync(full).isFile());
    if (!ok) {
      throw new Error(`el directory \`${directory}\` de \`${ecosystem}\` no contiene \`${manifest.path}\``);
    }
  }
}

function findEntry(ecosystem: string): UpdateEntry | undefined {
  return readUpdates(readDependabot()).find((entry) => entry.ecosystem === ecosystem);
}

describe('configuración de Dependabot', () => {
  it('declara exactamente una entrada por ecosistema (npm y github-actions)', () => {
    const top = ownKeys(toLines(readDependabot()));
    expect(top.get('version')?.value, 'el archivo necesita `version: 2`').toBe('2');
    const ecosystems = readUpdates(readDependabot()).map((entry) => entry.ecosystem);
    expect(ecosystems.toSorted()).toEqual(['github-actions', 'npm']);
  });

  it('test_dependabot_npm_semanal_en_raiz', () => {
    const npm = findEntry('npm');
    expect(npm, 'falta la entrada `npm`').toBeDefined();
    expect(npm?.directory).toBe('/');
    expect(npm?.interval).toBe('weekly');
    expect(() => {
      assertManifest('npm', npm?.directory ?? '');
    }).not.toThrow();
  });

  it('test_dependabot_github_actions_semanal_en_raiz', () => {
    const actions = findEntry('github-actions');
    expect(actions, 'falta la entrada `github-actions`').toBeDefined();
    expect(actions?.directory).toBe('/');
    expect(actions?.interval).toBe('weekly');
    expect(() => {
      assertManifest('github-actions', actions?.directory ?? '');
    }).not.toThrow();
    // Sin `versioning-strategy`: Dependabot mantiene el SHA fijado y el comentario de versión.
    expect(readDependabot()).not.toMatch(/versioning-strategy/);
  });

  it('test_dependabot_agrupa_todas_las_actualizaciones', () => {
    const entries = readUpdates(readDependabot());
    expect(entries.length).toBe(2);
    for (const entry of entries) {
      const groups = entryChild(entry, 'groups');
      const names = [...ownKeys(groups).keys()];
      expect(names.length, `\`${entry.ecosystem}\` necesita un grupo`).toBe(1);
      const group = childBlock(groups, names[0] ?? '');
      const patterns = ownKeys(group).get('patterns');
      const inline = patterns?.value ?? '';
      const listed = patterns === undefined ? [] : childrenOf(group, patterns.index).map((line) => line.text);
      const values = inline === ''
        ? listed.map((text) => unquote(text.replace(/^-\s*/, '')))
        : inline.replace(/^\[|\]$/g, '').split(',').map((value) => unquote(value));
      expect(values, `el grupo de \`${entry.ecosystem}\` necesita \`patterns: ["*"]\``).toEqual(['*']);
    }
  });

  it('test_dependabot_limite_un_pr_abierto_por_ecosistema', () => {
    const entries = readUpdates(readDependabot());
    expect(entries.length).toBe(2);
    for (const entry of entries) {
      expect(entryValue(entry, 'open-pull-requests-limit'), `\`${entry.ecosystem}\` necesita límite 1`).toBe('1');
    }
  });

  it('test_dependabot_sin_credenciales', () => {
    const keys = toLines(readDependabot())
      .map((line) => /^-?\s*([\w-]+):/.exec(line.text)?.[1])
      .filter((key): key is string => key !== undefined);
    expect(keys.length).toBeGreaterThan(0);
    for (const forbidden of ['registries', 'token', 'password', 'key']) {
      expect(keys, `el archivo no debe declarar \`${forbidden}\``).not.toContain(forbidden);
    }
  });

  it('test_dependabot_clave_faltante_error', () => {
    const raw = [
      'version: 2',
      'updates:',
      '  - package-ecosystem: "npm"',
      '    directory: "/"',
      '    schedule:',
      '      day: "monday"',
    ].join('\n');
    expect(() => readUpdates(raw)).toThrow(/schedule\.interval/);
  });

  it('test_dependabot_directorio_invalido_rechazado', () => {
    expect(() => {
      assertManifest('npm', '/no-existe');
    }).toThrow(/npm.*\/no-existe|\/no-existe.*npm/);
    expect(() => {
      assertManifest('github-actions', '/no-existe');
    }).toThrow(/github-actions.*\/no-existe|\/no-existe.*github-actions/);
  });
});
