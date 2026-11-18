import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Se lee como texto a propósito: el spec pide no sumar un parser de YAML como dependencia.
const ciPath = fileURLToPath(new URL('../../../../.github/workflows/ci.yml', import.meta.url));
// `e2e/e2eSettings.ts` se importa por URL y no con un import estático: queda fuera del `rootDir` de
// server/tsconfig.json (igual que en e2eConfig.test.ts).
const settingsUrl = new URL('../../../../e2e/e2eSettings.ts', import.meta.url);

function readCi(): string {
  return readFileSync(ciPath, 'utf8');
}

// El `outputDir` de Playwright: el upload de evidencia del job `e2e` tiene que apuntar ahí.
async function loadOutputDir(): Promise<string> {
  const mod: unknown = await import(settingsUrl.href);
  if (typeof mod !== 'object' || mod === null || !('E2E_OUTPUT_DIR' in mod)) {
    throw new Error('e2e/e2eSettings.ts no exporta `E2E_OUTPUT_DIR`');
  }
  const { E2E_OUTPUT_DIR } = mod;
  if (typeof E2E_OUTPUT_DIR !== 'string' || E2E_OUTPUT_DIR === '') {
    throw new Error('`E2E_OUTPUT_DIR` tiene que ser un string no vacío');
  }
  return E2E_OUTPUT_DIR;
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

type Keys = Map<string, { value: string; index: number }>;

// Las claves de primer nivel de un bloque (las de menor indentación), con su valor en línea.
function ownKeys(block: Line[]): Keys {
  const keys: Keys = new Map();
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

interface Job {
  id: string;
  lines: Line[];
  keys: Keys;
}

// Todos los jobs de `jobs:`, en el orden en que aparecen.
function parseJobs(raw: string): Job[] {
  const block = childBlock(toLines(raw), 'jobs');
  if (block.length === 0) {
    return [];
  }
  return [...ownKeys(block).entries()].map(([id, { index }]) => {
    const lines = childrenOf(block, index);
    return { id, lines, keys: ownKeys(lines) };
  });
}

function findJob(raw: string, id: string): Job | undefined {
  return parseJobs(raw).find((job) => job.id === id);
}

interface Step {
  keys: Keys;
  lines: Line[];
}

// Cada ítem `- ` de `steps:` se convierte en un bloque cuyas claves propias son las que están a la
// altura de la primera (`- name:` pasa a ser `name:` dos columnas más adentro).
function parseSteps(job: Job): Step[] {
  const block = childBlock(job.lines, 'steps');
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

function stepsUsing(job: Job, action: string): Step[] {
  return parseSteps(job).filter((step) => stepValue(step, 'uses')?.startsWith(`${action}@`) === true);
}

// Los comandos que corre un job, uno por línea (un `run: |` aporta cada línea de su bloque).
function stepCommands(step: Step): string[] {
  const run = stepValue(step, 'run');
  if (run === undefined) {
    return [];
  }
  if (/^[|>]/.test(run)) {
    return stepChild(step, 'run').map((line) => line.text);
  }
  return [run];
}

function runCommands(job: Job): string[] {
  return parseSteps(job).flatMap((step) => stepCommands(step));
}

// Cualquier comando que corra tests: `npm test`, `npm run test*`, `npm t`, vitest o playwright.
const TEST_COMMAND = /\bnpm\s+(?:run\s+)?test\b|\bnpm\s+t\b|\bvitest\b|\bplaywright\b/;

// La instalación del navegador (`[npx [--no-install]] playwright install [flags] [navegadores]`) es una
// instalación y no un comando de test. Solo palabras y flags: un `&&` o un `;` encadenado la descalifica,
// así no se puede colar un `playwright test` detrás.
const PLAYWRIGHT_INSTALL = /^(?:npx\s+(?:--no-install\s+)?|npm\s+exec\s+(?:--no\s+)?(?:--\s+)?)?playwright\s+install(?:\s+[\w-]+)*$/;

function testCommands(job: Job): string[] {
  return runCommands(job).filter((command) => TEST_COMMAND.test(command) && !PLAYWRIGHT_INSTALL.test(command));
}

function stepName(step: Step): string {
  return stepValue(step, 'name') ?? stepValue(step, 'uses') ?? stepValue(step, 'run') ?? '?';
}

function needsOf(job: Job): string[] {
  const entry = job.keys.get('needs');
  if (entry === undefined) {
    return [];
  }
  if (entry.value === '') {
    return childrenOf(job.lines, entry.index).map((line) => unquote(line.text.replace(/^-\s*/, '')));
  }
  const list = /^\[(.*)\]$/.exec(entry.value);
  const items = list?.[1] === undefined ? [entry.value] : list[1].split(',');
  return items.map((item) => unquote(item)).filter((item) => item !== '');
}

// --- Chequeos: cada uno devuelve la lista de problemas encontrados (vacía si el workflow está bien).

// R-01: solo `pull_request`, nunca `pull_request_target`.
function triggerProblems(raw: string): string[] {
  const problems: string[] = [];
  if (/pull_request_target/.test(raw)) {
    problems.push('el workflow menciona `pull_request_target`');
  }
  const top = toLines(raw);
  const on = ownKeys(top).get('on');
  if (on === undefined) {
    problems.push('falta la clave `on`');
    return problems;
  }
  const triggers =
    on.value === ''
      ? [...ownKeys(childrenOf(top, on.index)).keys()]
      : (/^\[(.*)\]$/.exec(on.value)?.[1] ?? on.value).split(',').map((item) => unquote(item));
  if (triggers.length !== 1 || triggers[0] !== 'pull_request') {
    problems.push(`\`pull_request\` tiene que ser el único trigger, hay: ${triggers.join(', ')}`);
  }
  return problems;
}

// R-06 (threat-FEAT-017b): la única excepción es el upload de evidencia del job `e2e`, con `failure()`
// exacto. Cualquier otro valor (`always()`, `failure() || always()`), otro paso u otro job no entra.
function isEvidenceUploadIf(job: Job, step: Step, stepIf: string): boolean {
  return (
    job.id === 'e2e' &&
    stepIf === 'failure()' &&
    stepValue(step, 'uses')?.startsWith('actions/upload-artifact@') === true
  );
}

// Ningún job (ni paso) puede saltear la cadena de `needs:`: ni con un `if:` que corre aunque la etapa
// anterior haya fallado, ni con `continue-on-error`, que deja el job en verde con un paso roto.
function skipChainProblems(raw: string): string[] {
  const problems: string[] = [];
  for (const job of parseJobs(raw)) {
    const jobIf = job.keys.get('if');
    if (jobIf !== undefined) {
      problems.push(`el job \`${job.id}\` declara \`if: ${jobIf.value}\``);
    }
    const jobContinue = job.keys.get('continue-on-error');
    if (jobContinue !== undefined) {
      problems.push(`el job \`${job.id}\` declara \`continue-on-error: ${jobContinue.value}\``);
    }
    for (const step of parseSteps(job)) {
      const name = stepName(step);
      const stepIf = stepValue(step, 'if');
      if (
        stepIf !== undefined &&
        /always\(\)|failure\(\)|cancelled\(\)/.test(stepIf) &&
        !isEvidenceUploadIf(job, step, stepIf)
      ) {
        problems.push(`el paso \`${name}\` del job \`${job.id}\` declara \`if: ${stepIf}\``);
      }
      const stepContinue = stepValue(step, 'continue-on-error');
      if (stepContinue !== undefined) {
        problems.push(`el paso \`${name}\` del job \`${job.id}\` declara \`continue-on-error: ${stepContinue}\``);
      }
    }
  }
  return problems;
}

// R-02: toda action, en cualquier job, fijada por SHA de 40 caracteres con el tag en comentario.
function unpinnedActions(raw: string): string[] {
  return raw
    .split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line))
    .filter((line) => !/uses:\s*[^\s@]+@[0-9a-f]{40}\s+#\s*v\d+\S*\s*$/.test(line))
    .map((line) => `action sin SHA: ${line.trim()}`);
}

// R-03: el workflow no referencia secretos, el token del workflow ni claves del proveedor del LLM.
function secretProblems(raw: string): string[] {
  const forbidden: [string, RegExp][] = [
    ['secrets', /\bsecrets\b/],
    ['github.token', /\bgithub\.token\b/],
    ['github[', /\bgithub\s*\[/],
    ['ANTHROPIC', /anthropic/i],
    ['API_KEY', /api_key/i],
  ];
  return forbidden.filter(([, pattern]) => pattern.test(raw)).map(([token]) => `el workflow referencia \`${token}\``);
}

// R-04: `permissions: contents: read` global, nada de `write` y ningún job con permisos propios.
function permissionProblems(raw: string): string[] {
  const problems: string[] = [];
  const top = toLines(raw);
  const permissions = ownKeys(top).get('permissions');
  if (permissions === undefined) {
    problems.push('falta `permissions` a nivel workflow');
  } else {
    const granted = [...ownKeys(childrenOf(top, permissions.index)).entries()].map(
      ([scope, { value }]) => `${scope}: ${value}`,
    );
    if (permissions.value !== '' || granted.length !== 1 || granted[0] !== 'contents: read') {
      problems.push(`los permisos globales tienen que ser solo \`contents: read\`, hay: ${permissions.value || granted.join(', ')}`);
    }
  }
  if (/\bwrite\b/.test(raw)) {
    problems.push('el workflow pide permisos de escritura');
  }
  for (const job of parseJobs(raw)) {
    if (job.keys.has('permissions')) {
      problems.push(`el job \`${job.id}\` declara \`permissions\` propias`);
    }
  }
  return problems;
}

// R-03: cada job hace checkout sin dejar el token guardado en el repo clonado.
function checkoutProblems(raw: string): string[] {
  const problems: string[] = [];
  for (const job of parseJobs(raw)) {
    const checkouts = stepsUsing(job, 'actions/checkout');
    if (checkouts.length === 0) {
      problems.push(`el job \`${job.id}\` no hace checkout`);
    }
    for (const checkout of checkouts) {
      if (ownKeys(stepChild(checkout, 'with')).get('persist-credentials')?.value !== 'false') {
        problems.push(`el checkout del job \`${job.id}\` necesita \`persist-credentials: false\``);
      }
    }
  }
  return problems;
}

// R-04 (threat-FEAT-017b): `npx` y `npm exec` no pueden bajar paquetes del registro si faltan en
// `node_modules` (`playwright`, `tsx`): `npx` va con `--no-install` y `npm exec` (o su alias `npm x`)
// con `--no`, y ninguno con `--yes`/`-y`, que vuelve a habilitar la descarga.
function installProblems(raw: string): string[] {
  const problems: string[] = [];
  for (const job of parseJobs(raw)) {
    for (const step of parseSteps(job)) {
      for (const command of stepCommands(step)) {
        const npx = /\bnpx\s/.test(command);
        const npmExec = /\bnpm\s+(?:exec|x)\s/.test(command);
        const unblocked =
          (npx && !/\bnpx\s+--no-install\s/.test(command)) ||
          (npmExec && !/\bnpm\s+(?:exec|x)\s+--no\s/.test(command)) ||
          ((npx || npmExec) && /\s(?:--yes|-y)(?:\s|$)/.test(command));
        if (unblocked) {
          problems.push(`el paso \`${stepName(step)}\` del job \`${job.id}\` resuelve paquetes sin bloquear la descarga`);
        }
      }
    }
  }
  return problems;
}

// R-03 y R-06 (threat-FEAT-017b): la evidencia del job `e2e` se sube solo si la etapa falla, desde el
// `outputDir` de Playwright, por 7 días, y el paso falla si no encuentra archivos.
function evidenceProblems(raw: string, outputDir: string): string[] {
  const job = findJob(raw, 'e2e');
  if (job === undefined) {
    return ['falta el job `e2e`'];
  }
  const uploads = stepsUsing(job, 'actions/upload-artifact');
  const upload = uploads[0];
  if (uploads.length !== 1 || upload === undefined) {
    return [`el job \`e2e\` tiene que tener un solo paso de actions/upload-artifact, tiene ${uploads.length}`];
  }
  const problems: string[] = [];
  const stepIf = stepValue(upload, 'if');
  if (stepIf !== 'failure()') {
    problems.push(`el upload del job \`e2e\` necesita \`if: failure()\`, tiene: ${stepIf ?? '(nada)'}`);
  }
  const withKeys = ownKeys(stepChild(upload, 'with'));
  const expected: [string, string][] = [
    ['name', 'e2e-evidencia'],
    ['path', `${outputDir}/`],
    ['retention-days', '7'],
    ['if-no-files-found', 'error'],
  ];
  for (const [key, value] of expected) {
    const actual = withKeys.get(key)?.value;
    if (actual !== value) {
      problems.push(`el upload del job \`e2e\` necesita \`${key}: ${value}\`, tiene: ${actual ?? '(nada)'}`);
    }
  }
  // Exactamente esas cuatro claves: cualquier otra cambia qué se publica o cómo.
  const allowed = new Set(expected.map(([key]) => key));
  for (const key of withKeys.keys()) {
    if (!allowed.has(key)) {
      problems.push(`el upload del job \`e2e\` no admite la clave \`${key}\` en \`with\``);
    }
  }
  return problems;
}

// Todos los pasos con `if:`, como `job/paso`.
function stepsWithIf(raw: string): string[] {
  return parseJobs(raw).flatMap((job) =>
    parseSteps(job)
      .filter((step) => step.keys.has('if'))
      .map((step) => `${job.id}/${stepName(step)}`),
  );
}

// Los tests corren en modo mock en las cuatro etapas: `MOCK_MODE: "true"` global y en ningún otro lado,
// para que ningún job ni paso lo pise.
function mockModeProblems(raw: string): string[] {
  const problems: string[] = [];
  if (ownKeys(childBlock(toLines(raw), 'env')).get('MOCK_MODE')?.value !== 'true') {
    problems.push('el workflow necesita `MOCK_MODE: "true"` en el `env:` global');
  }
  const occurrences = raw.match(/MOCK_MODE/g)?.length ?? 0;
  if (occurrences !== 1) {
    problems.push(`\`MOCK_MODE\` tiene que aparecer una sola vez, aparece ${occurrences}`);
  }
  return problems;
}

// --- Variantes sintéticas del workflow real, para probar que cada chequeo detecta su problema.

function variant(raw: string, search: string | RegExp, replacement: string): string {
  const changed = raw.replace(search, replacement);
  expect(changed, `la variante no aplicó: no se encontró ${String(search)} en ci.yml`).not.toBe(raw);
  return changed;
}

// Reemplaza `search` solo dentro del bloque del job `id` (desde su línea hasta el job siguiente).
function variantInJob(raw: string, id: string, search: string | RegExp, replacement: string): string {
  const start = raw.indexOf(`\n  ${id}:\n`);
  expect(start, `no se encontró el job \`${id}\` en ci.yml`).not.toBe(-1);
  const next = raw.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  const end = next === -1 ? raw.length : start + 1 + next;
  return raw.slice(0, start) + variant(raw.slice(start, end), search, replacement) + raw.slice(end);
}

const JOBS = ['lint', 'unit', 'integration', 'e2e'];

describe('workflow de CI en pull requests', () => {
  it('test_ci_dispara_en_pull_request', () => {
    const raw = readCi();
    expect(triggerProblems(raw)).toEqual([]);

    // "y nada más": un segundo trigger también se rechaza.
    for (const on of ['on: [pull_request, push]', 'on:\n  pull_request:\n  push:']) {
      const extra = variant(raw, /^on: pull_request$/m, on);
      expect(triggerProblems(extra), `\`${on}\` no fue rechazado`).toEqual([
        expect.stringContaining('tiene que ser el único trigger'),
      ]);
    }
  });

  it('test_ci_cuatro_jobs_lint_unit_integration_e2e', () => {
    const jobs = parseJobs(readCi());
    expect(jobs.map((job) => job.id), 'los jobs tienen que ser exactamente lint, unit, integration y e2e').toEqual(JOBS);
    for (const job of jobs) {
      expect(job.keys.get('name')?.value, `el job \`${job.id}\` tiene que llamarse igual que su id`).toBe(job.id);
    }
  });

  it('test_ci_cadena_needs', () => {
    const raw = readCi();
    const needs = Object.fromEntries(JOBS.map((id) => [id, findJob(raw, id)]));
    expect(needs.lint, 'falta el job `lint`').toBeDefined();
    expect(needs.unit, 'falta el job `unit`').toBeDefined();
    expect(needs.integration, 'falta el job `integration`').toBeDefined();
    expect(needs.e2e, 'falta el job `e2e`').toBeDefined();
    if (
      needs.lint === undefined ||
      needs.unit === undefined ||
      needs.integration === undefined ||
      needs.e2e === undefined
    ) {
      return;
    }
    expect(needsOf(needs.lint), '`lint` es la primera etapa').toEqual([]);
    expect(needsOf(needs.unit), '`unit` tiene que depender de `lint`').toEqual(['lint']);
    expect(needsOf(needs.integration), '`integration` tiene que depender de `unit`').toEqual(['unit']);
    expect(needsOf(needs.e2e), '`e2e` tiene que depender de `integration`').toEqual(['integration']);
  });

  it('test_ci_lint_corre_lint_y_typecheck', () => {
    const lint = findJob(readCi(), 'lint');
    expect(lint, 'falta el job `lint`').toBeDefined();
    const commands = lint === undefined ? [] : runCommands(lint);
    const expected = ['npm ci', 'npm run lint', 'npm run typecheck'];
    const positions = expected.map((command) => commands.indexOf(command));
    for (const [i, command] of expected.entries()) {
      expect(positions[i], `el job \`lint\` tiene que correr \`${command}\``).not.toBe(-1);
    }
    expect([...positions].sort((a, b) => a - b), '`npm ci` va antes que lint y typecheck').toEqual(positions);
    expect(lint === undefined ? [] : testCommands(lint), 'el job `lint` no corre tests').toEqual([]);
  });

  it('test_ci_unit_corre_test_unit', () => {
    const unit = findJob(readCi(), 'unit');
    expect(unit, 'falta el job `unit`').toBeDefined();
    const commands = unit === undefined ? [] : runCommands(unit);
    expect(commands[0], 'el job `unit` empieza con `npm ci`').toBe('npm ci');
    expect(unit === undefined ? [] : testCommands(unit), 'el job `unit` corre solo `npm run test:unit`').toEqual([
      'npm run test:unit',
    ]);
  });

  it('test_ci_integration_corre_test_integration', () => {
    const integration = findJob(readCi(), 'integration');
    expect(integration, 'falta el job `integration`').toBeDefined();
    const commands = integration === undefined ? [] : runCommands(integration);
    expect(commands[0], 'el job `integration` empieza con `npm ci`').toBe('npm ci');
    expect(
      integration === undefined ? [] : testCommands(integration),
      'el job `integration` corre solo `npm run test:integration`',
    ).toEqual(['npm run test:integration']);
  });

  it('test_ci_e2e_instala_chromium_y_corre_test_e2e', () => {
    const raw = readCi();
    const e2e = findJob(raw, 'e2e');
    expect(e2e, 'falta el job `e2e`').toBeDefined();
    if (e2e === undefined) {
      return;
    }
    const steps = parseSteps(e2e);
    expect(steps.length, 'el job `e2e` tiene exactamente 6 pasos').toBe(6);
    expect(stepsUsing(e2e, 'actions/checkout').length, 'el job `e2e` hace un checkout').toBe(1);
    expect(stepsUsing(e2e, 'actions/setup-node').length, 'el job `e2e` usa setup-node').toBe(1);
    expect(runCommands(e2e), 'el job `e2e` corre `npm ci`, instala Chromium y corre la prueba, en ese orden').toEqual([
      'npm ci',
      'npx --no-install playwright install --with-deps chromium',
      'npm run test:e2e',
    ]);
    expect(testCommands(e2e), 'el job `e2e` corre solo `npm run test:e2e`').toEqual(['npm run test:e2e']);
    expect(installProblems(raw)).toEqual([]);

    // Un comando de test encadenado al de instalación sigue contando como comando de test.
    const install = 'npx --no-install playwright install --with-deps chromium';
    for (const chained of [
      `${install} && npx playwright test`,
      `${install}; npm run test:e2e`,
      `${install} $(npm run test:e2e)`,
    ]) {
      const job = findJob(variantInJob(raw, 'e2e', `run: ${install}\n`, `run: ${chained}\n`), 'e2e');
      expect(job === undefined ? [] : testCommands(job), `\`${chained}\` no se contó como comando de test`).toEqual([
        chained,
        'npm run test:e2e',
      ]);
    }
  });

  it('test_ci_e2e_sube_evidencia_solo_en_falla', async () => {
    const raw = readCi();
    const outputDir = await loadOutputDir();
    expect(stepsWithIf(raw), 'el único paso con `if:` es el upload de evidencia del job `e2e`').toEqual([
      'e2e/Upload e2e evidence',
    ]);
    expect(evidenceProblems(raw, outputDir)).toEqual([]);
    expect(skipChainProblems(raw)).toEqual([]);
  });

  it('test_ci_mock_mode_global', () => {
    const raw = readCi();
    const env = childBlock(toLines(raw), 'env');
    expect(env.length, 'el workflow no declara `env:` global').toBeGreaterThan(0);
    expect(mockModeProblems(raw)).toEqual([]);

    // Un paso que pisa `MOCK_MODE` deja de correr en modo mock aunque el global siga en "true".
    const overridden = variantInJob(
      raw,
      'integration',
      /\n {8}run: npm run test:integration/,
      '\n        run: npm run test:integration\n        env:\n          MOCK_MODE: "false"',
    );
    expect(mockModeProblems(overridden)).toEqual(['`MOCK_MODE` tiene que aparecer una sola vez, aparece 2']);
  });

  it('test_ci_node_24_y_timeout_por_job', () => {
    const raw = readCi();

    // R-05: la concurrencia por PR cancela la corrida anterior.
    const concurrency = childBlock(toLines(raw), 'concurrency');
    expect(ownKeys(concurrency).get('cancel-in-progress')?.value, 'falta `concurrency` con `cancel-in-progress: true`')
      .toBe('true');

    for (const id of JOBS) {
      const job = findJob(raw, id);
      expect(job, `falta el job \`${id}\``).toBeDefined();
      if (job === undefined) {
        continue;
      }
      expect(job.keys.get('runs-on')?.value, `el job \`${id}\` corre en ubuntu-latest`).toBe('ubuntu-latest');
      expect(job.keys.get('timeout-minutes')?.value, `el job \`${id}\` necesita \`timeout-minutes: 10\``).toBe('10');
      const setupNode = stepsUsing(job, 'actions/setup-node');
      expect(setupNode.length, `el job \`${id}\` no usa actions/setup-node`).toBe(1);
      const withKeys = setupNode[0] === undefined ? new Map<string, { value: string; index: number }>() : ownKeys(stepChild(setupNode[0], 'with'));
      expect(withKeys.get('node-version')?.value, `setup-node del job \`${id}\` necesita \`node-version: 24\``).toBe('24');
      expect(withKeys.get('cache')?.value, `setup-node del job \`${id}\` necesita \`cache: npm\``).toBe('npm');
    }
  });

  it('test_ci_if_que_saltea_cadena_rechazado', () => {
    const raw = readCi();
    expect(skipChainProblems(raw)).toEqual([]);

    const skipped = variantInJob(raw, 'integration', /\n {4}needs:/, '\n    if: always()\n    needs:');
    expect(skipChainProblems(skipped)).toEqual(['el job `integration` declara `if: always()`']);

    const stepSkipped = variantInJob(
      raw,
      'unit',
      /\n {6}- name: npm run test:unit\n/,
      '\n      - name: npm run test:unit\n        if: always()\n',
    );
    expect(skipChainProblems(stepSkipped)).toEqual(['el paso `npm run test:unit` del job `unit` declara `if: always()`']);

    // La excepción del upload de evidencia es estricta: solo `failure()` exacto (R-06, threat-FEAT-017b).
    for (const value of ['always()', 'failure() || always()']) {
      const widened = variantInJob(raw, 'e2e', /\n {8}if: failure\(\)\n/, `\n        if: ${value}\n`);
      expect(skipChainProblems(widened), `\`if: ${value}\` en el upload no fue rechazado`).toEqual([
        `el paso \`Upload e2e evidence\` del job \`e2e\` declara \`if: ${value}\``,
      ]);
    }

    // `failure()` en otro paso del job `e2e` tampoco entra en la excepción.
    const onTest = variantInJob(
      raw,
      'e2e',
      /\n {6}- name: npm run test:e2e\n/,
      '\n      - name: npm run test:e2e\n        if: failure()\n',
    );
    expect(skipChainProblems(onTest)).toEqual(['el paso `npm run test:e2e` del job `e2e` declara `if: failure()`']);

    // Ni un upload con `failure()` en otro job.
    const otherJob = variantInJob(
      raw,
      'unit',
      /\n {8}run: npm run test:unit\n/,
      '\n        run: npm run test:unit\n\n      - name: Upload unit evidence\n        if: failure()\n' +
        '        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n',
    );
    expect(skipChainProblems(otherJob)).toEqual(['el paso `Upload unit evidence` del job `unit` declara `if: failure()`']);
  });

  it('test_ci_continue_on_error_rechazado', () => {
    const raw = readCi();
    expect(skipChainProblems(raw)).toEqual([]);

    const jobContinues = variantInJob(raw, 'integration', /\n {4}needs:/, '\n    continue-on-error: true\n    needs:');
    expect(skipChainProblems(jobContinues)).toEqual(['el job `integration` declara `continue-on-error: true`']);

    const stepContinues = variantInJob(
      raw,
      'unit',
      /\n {8}run: npm run test:unit/,
      '\n        run: npm run test:unit\n        continue-on-error: false',
    );
    expect(skipChainProblems(stepContinues)).toEqual([
      'el paso `npm run test:unit` del job `unit` declara `continue-on-error: false`',
    ]);
  });

  it('test_ci_action_sin_sha_rechazada', () => {
    const raw = readCi();
    expect(raw.split('\n').filter((line) => /^\s*-?\s*uses:/.test(line)).length, 'el workflow usa 9 actions').toBe(9);
    expect(unpinnedActions(raw)).toEqual([]);

    const tagged = variantInJob(raw, 'integration', /actions\/checkout@[0-9a-f]{40} # v7\.0\.1/, 'actions/checkout@v7');
    expect(unpinnedActions(tagged)).toEqual(['action sin SHA: uses: actions/checkout@v7']);

    const upload = variantInJob(raw, 'e2e', /actions\/upload-artifact@[0-9a-f]{40} # v7\.0\.2/, 'actions/upload-artifact@v7');
    expect(unpinnedActions(upload)).toEqual(['action sin SHA: uses: actions/upload-artifact@v7']);
  });

  it('test_ci_evidencia_mal_configurada_rechazada', async () => {
    const raw = readCi();
    const outputDir = await loadOutputDir();
    expect(evidenceProblems(raw, outputDir)).toEqual([]);

    const cases: [RegExp, string, string][] = [
      [/\n {10}path: .*\n/, '\n          path: test-results/\n', 'path'],
      [/\n {10}retention-days: 7\n/, '\n          retention-days: 30\n', 'retention-days'],
      [/\n {10}if-no-files-found: error\n/, '\n          if-no-files-found: ignore\n', 'if-no-files-found'],
    ];
    for (const [search, replacement, key] of cases) {
      const broken = variantInJob(raw, 'e2e', search, replacement);
      const problems = evidenceProblems(broken, outputDir);
      expect(problems, `un cambio en \`${key}\` no fue rechazado`).toHaveLength(1);
      expect(problems[0], `el problema no nombra \`${key}\``).toContain(`necesita \`${key}: `);
    }

    // Una clave extra en el `with` (p. ej. subir también los archivos ocultos) también se rechaza.
    const extra = variantInJob(
      raw,
      'e2e',
      /\n {10}if-no-files-found: error\n/,
      '\n          if-no-files-found: error\n          include-hidden-files: true\n',
    );
    expect(evidenceProblems(extra, outputDir)).toEqual([
      'el upload del job `e2e` no admite la clave `include-hidden-files` en `with`',
    ]);
  });

  it('test_ci_instalacion_sin_no_install_rechazada', () => {
    const raw = readCi();
    expect(installProblems(raw)).toEqual([]);

    const variants = [
      'npx playwright install --with-deps chromium',
      'npm exec playwright install --with-deps chromium',
      // `--yes`/`-y` después del bloqueo vuelve a habilitar la descarga.
      'npx --no-install --yes playwright install --with-deps chromium',
      'npx --no-install -y playwright install --with-deps chromium',
      'npm exec --no --yes -- playwright install --with-deps chromium',
      'npm exec --no -y -- playwright install --with-deps chromium',
      // `npm x` es un alias de `npm exec`.
      'npm x playwright install --with-deps chromium',
    ];
    for (const command of variants) {
      const unblocked = variantInJob(raw, 'e2e', 'npx --no-install playwright install --with-deps chromium', command);
      expect(installProblems(unblocked), `\`${command}\` no fue rechazado`).toEqual([
        'el paso `Install Chromium` del job `e2e` resuelve paquetes sin bloquear la descarga',
      ]);
    }
  });

  it('test_ci_sin_secretos_rechazado', () => {
    const raw = readCi();
    expect(secretProblems(raw)).toEqual([]);

    const cases: [string, string][] = [
      ['  TOKEN: ${{ secrets.X }}', 'secrets'],
      ['  TOKEN: ${{ github.token }}', 'github.token'],
      ['  ANTHROPIC_API_KEY: x', 'ANTHROPIC'],
      ['  API_KEY: x', 'API_KEY'],
    ];
    for (const [line, token] of cases) {
      const leaked = variant(raw, /\nenv:\n/, `\nenv:\n${line}\n`);
      expect(secretProblems(leaked), `no se detectó \`${token}\``).toContain(`el workflow referencia \`${token}\``);
    }
    // Mayúsculas o minúsculas da igual, y el token también se lee con la sintaxis de índice.
    const exact: [string, string][] = [
      ['  anthropic_model: x', 'ANTHROPIC'],
      ['  my_Api_Key: x', 'API_KEY'],
      ["  TOKEN: ${{ github['token'] }}", 'github['],
    ];
    for (const [line, token] of exact) {
      const leaked = variant(raw, /\nenv:\n/, `\nenv:\n${line}\n`);
      expect(secretProblems(leaked), `no se detectó \`${token}\``).toEqual([`el workflow referencia \`${token}\``]);
    }
    const inJob = variantInJob(raw, 'unit', /\n {4}steps:/, '\n    env:\n      KEY: ${{ secrets.KEY }}\n    steps:');
    expect(secretProblems(inJob)).toContain('el workflow referencia `secrets`');
  });

  it('test_ci_permisos_escritura_rechazado', () => {
    const raw = readCi();
    expect(permissionProblems(raw)).toEqual([]);

    const globalWrite = variant(raw, /\npermissions:\n {2}contents: read\n/, '\npermissions:\n  contents: write\n');
    expect(permissionProblems(globalWrite)).toEqual([
      'los permisos globales tienen que ser solo `contents: read`, hay: contents: write',
      'el workflow pide permisos de escritura',
    ]);

    const jobPermissions = variantInJob(raw, 'unit', /\n {4}steps:/, '\n    permissions:\n      contents: read\n    steps:');
    expect(permissionProblems(jobPermissions)).toEqual(['el job `unit` declara `permissions` propias']);
  });

  it('test_ci_pull_request_target_rechazado', () => {
    const raw = readCi();
    expect(triggerProblems(raw)).toEqual([]);

    for (const on of ['on: pull_request_target', 'on: [pull_request, pull_request_target]']) {
      const target = variant(raw, /^on: pull_request$/m, on);
      expect(triggerProblems(target), `\`${on}\` no fue rechazado`).toContain('el workflow menciona `pull_request_target`');
    }
  });

  it('test_ci_checkout_sin_persist_credentials_rechazado', () => {
    const raw = readCi();
    expect(checkoutProblems(raw)).toEqual([]);

    const persisted = variantInJob(raw, 'unit', /\n {10}persist-credentials: false/, '\n          persist-credentials: true');
    expect(checkoutProblems(persisted)).toEqual(['el checkout del job `unit` necesita `persist-credentials: false`']);
  });
});
