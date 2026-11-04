import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Sube desde el directorio de `moduleUrl` hasta encontrar `marker`: una ruta relativa que debe
 * existir, o un predicado sobre el directorio candidato.
 * Resuelve igual desde `src/` (tsx/vitest) que desde un build en `dist/`.
 */
export function findUp(moduleUrl: string, marker: string | ((dir: string) => boolean)): string {
  const matches = typeof marker === 'string' ? (dir: string) => existsSync(join(dir, marker)) : marker;
  const label = typeof marker === 'string' ? marker : 'el marcador';
  let dir = dirname(fileURLToPath(moduleUrl));
  for (;;) {
    if (matches(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No se encontró ${label} subiendo desde ${fileURLToPath(moduleUrl)}`);
    dir = parent;
  }
}

/** Raíz del monorepo: el directorio cuyo `package.json` declara `workspaces`. */
export function isWorkspaceRoot(dir: string): boolean {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown };
    return pkg.workspaces !== undefined && pkg.workspaces !== null;
  } catch {
    return false;
  }
}
