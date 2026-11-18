import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertRunDir } from './e2eSettings.js';

// Borra el directorio temporal de la corrida (FEAT-017b). Solo si es un aldebaran-e2e-* hijo directo
// de os.tmpdir(): cualquier otra E2E_RUN_DIR lanza en lugar de borrar.
export default function globalTeardown(): void {
  const runDir = process.env.E2E_RUN_DIR;
  if (runDir === undefined || runDir === '') return;
  assertRunDir(runDir, tmpdir());
  rmSync(runDir, { recursive: true, force: true });
}
