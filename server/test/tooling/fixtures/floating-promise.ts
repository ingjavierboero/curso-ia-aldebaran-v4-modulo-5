// Fixture del linter: contiene a propósito una promesa sin esperar ni manejar.
// El lint normal lo ignora (ignorePatterns en .oxlintrc.json); test/tooling/lint.test.ts lo lintea
// en forma dirigida para comprobar que oxlint reporta no-floating-promises.

async function fetchValue(): Promise<number> {
  return Promise.resolve(42);
}

export function fireAndForget(): void {
  fetchValue();
}
