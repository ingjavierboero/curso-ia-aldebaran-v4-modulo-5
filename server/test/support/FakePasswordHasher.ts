import type { PasswordHasher } from '../../src/domain/auth/PasswordHasher.js';

/** Hash reversible y trivial: `hashed:<plain>`. Registra cada llamada para poder afirmar sobre ellas. */
export class FakePasswordHasher implements PasswordHasher {
  readonly hashCalls: string[] = [];
  readonly verifyCalls: Array<{ hash: string; plain: string }> = [];
  /** Se ejecuta durante `hash`, antes de resolver: sirve para simular una carrera. */
  onHash: (() => void) | null = null;

  async hash(plain: string): Promise<string> {
    this.hashCalls.push(plain);
    this.onHash?.();
    return `hashed:${plain}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls.push({ hash, plain });
    return hash === `hashed:${plain}`;
  }
}
