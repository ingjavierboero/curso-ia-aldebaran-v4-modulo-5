import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Se lee como texto a propósito: el spec pide no sumar un parser de YAML como dependencia.
const ciPath = fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url));

function readCi(): string {
  return readFileSync(ciPath, 'utf8');
}

interface Line {
  indent: number;
  text: string;
}

// Quita comentarios (de línea completa y finales) y líneas vacías, y guarda la indentación.
// El workflow no tiene `#` dentro de strings, así que alcanza con cortar en ` #`.
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

function jobBlock(raw: string): Line[] {
  return childBlock(childBlock(toLines(raw), 'jobs'), 'ci');
}

interface Step {
  keys: Map<string, { value: string; index: number }>;
  lines: Line[];
}

// Cada ítem `- ` de `steps:` se convierte en un bloque cuyas claves propias son las que están a la
// altura de la primera (`- name:` pasa a ser `name:` dos columnas más adentro).
function parseSteps(raw: string): Step[] {
  const block = childBlock(jobBlock(raw), 'steps');
  if (block.length === 0) {
    return [];
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
  return items.map((lines) => ({ keys: ownKeys(lines), lines }));
}

function stepValue(step: Step, key: string): string | undefined {
  return step.keys.get(key)?.value;
}

function stepChild(step: Step, key: string): Line[] {
  const entry = step.keys.get(key);
  return entry === undefined ? [] : childrenOf(step.lines, entry.index);
}

function findStepUsing(raw: string, action: string): Step | undefined {
  return parseSteps(raw).find((step) => stepValue(step, 'uses')?.startsWith(`${action}@`) === true);
}

describe('workflow de CI en pull requests', () => {
  it('test_ci_dispara_en_pull_request', () => {
    const top = toLines(readCi());
    const on = ownKeys(top).get('on');
    expect(on, 'falta la clave `on`').toBeDefined();
    if (on?.value !== '') {
      expect(['pull_request', '[pull_request]']).toContain(on?.value);
    } else {
      const triggers = [...ownKeys(childrenOf(top, on.index)).keys()];
      expect(triggers, '`pull_request` tiene que ser el único trigger').toEqual(['pull_request']);
    }
  });

  it('test_ci_orden_de_pasos', () => {
    const steps = parseSteps(readCi());
    const expected = ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test'];
    const positions = expected.map((command) =>
      steps.findIndex((step) => stepValue(step, 'name') === command && stepValue(step, 'run') === command),
    );
    for (const [i, command] of expected.entries()) {
      expect(positions[i], `falta el paso con nombre propio "${command}" que corre \`${command}\``).not.toBe(-1);
    }
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('test_ci_node_24_y_timeout', () => {
    const raw = readCi();
    const job = jobBlock(raw);
    expect(ownKeys(job).get('timeout-minutes')?.value, 'el job `ci` necesita `timeout-minutes: 10`').toBe('10');

    // R-05: la concurrencia por PR cancela la corrida anterior. Vale a nivel workflow o del job.
    const top = toLines(raw);
    const concurrency = [...childBlock(top, 'concurrency'), ...childBlock(job, 'concurrency')];
    expect(ownKeys(concurrency).get('cancel-in-progress')?.value, 'falta `concurrency` con `cancel-in-progress: true`')
      .toBe('true');

    const setupNode = findStepUsing(raw, 'actions/setup-node');
    expect(setupNode, 'no hay un paso con actions/setup-node').toBeDefined();
    const nodeVersion = setupNode === undefined ? undefined : ownKeys(stepChild(setupNode, 'with')).get('node-version');
    expect(nodeVersion?.value, 'setup-node necesita `node-version: 24`').toBe('24');
  });

  it('test_ci_mock_mode_en_tests', () => {
    const testStep = parseSteps(readCi()).find((step) => stepValue(step, 'run') === 'npm test');
    expect(testStep, 'no hay un paso que corra `npm test`').toBeDefined();
    const env = testStep === undefined ? [] : stepChild(testStep, 'env');
    expect(env.length, 'el paso de tests no declara `env:`').toBeGreaterThan(0);
    expect(ownKeys(env).get('MOCK_MODE')?.value, 'el paso de tests necesita `MOCK_MODE: "true"`').toBe('true');
  });

  it('test_ci_sin_secretos_rechazado', () => {
    const raw = readCi();
    // Cualquier mención a `secrets` (secrets.X, secrets["X"], toJSON(secrets), secrets: inherit) y el
    // token del workflow quedan afuera: el CI corre sin credenciales.
    expect(raw).not.toMatch(/\bsecrets\b/);
    expect(raw).not.toMatch(/\bgithub\.token\b/);

    // R-04: el checkout no deja el token guardado en el repo clonado.
    const checkout = findStepUsing(raw, 'actions/checkout');
    expect(checkout, 'no hay un paso con actions/checkout').toBeDefined();
    const persist = checkout === undefined ? undefined : ownKeys(stepChild(checkout, 'with')).get('persist-credentials');
    expect(persist?.value, 'el checkout necesita `persist-credentials: false`').toBe('false');
  });

  it('test_ci_permisos_escritura_rechazado', () => {
    const text = readCi();
    expect(text).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
    expect(text).not.toMatch(/\bwrite\b/);
  });

  it('test_ci_action_sin_sha_rechazada', () => {
    const usesLines = readCi()
      .split('\n')
      .filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(usesLines.length, 'el workflow no usa ninguna action').toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line, 'toda action se fija por SHA de 40 caracteres con el tag en comentario').toMatch(
        /uses:\s*[^\s@]+@[0-9a-f]{40}\s+#\s*v\d+\S*\s*$/,
      );
    }
  });

  it('test_ci_pull_request_target_rechazado', () => {
    expect(readCi()).not.toMatch(/pull_request_target/);
  });
});
