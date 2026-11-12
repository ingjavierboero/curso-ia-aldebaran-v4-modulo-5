import type { PasswordHasher } from '../../src/domain/auth/PasswordHasher.js';

/** Hash reversible y trivial: `hashed:<plain>`. Registra cada llamada para poder afirmar sobre ellas. */
export class FakePasswordHasher implements PasswordHasher {
  readonly hashCalls: string[] = [];
  readonly verifyCalls: Array<{ hash: string; plain: string }> = [];
  /** Se ejecuta durante `hash`, antes de resolver: sirve para simular una carrera. */
  onHash: (() => void) | null = null;

  // El executor corre en forma síncrona y una excepción dentro de él rechaza la promesa: mismo
  // comportamiento que el `async` sin `await` de antes.
  hash(plain: string): Promise<string> {
    return new Promise((resolve) => {
      this.hashCalls.push(plain);
      this.onHash?.();
      resolve(`hashed:${plain}`);
    });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.verifyCalls.push({ hash, plain });
      resolve(hash === `hashed:${plain}`);
    });
  }
}
