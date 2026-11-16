import { createHash } from 'node:crypto';
import type {
  GeneratedSessionToken,
  SessionTokenGenerator,
} from '../../src/application/auth/SessionTokenGenerator.js';

/**
 * Generador determinista de tokens de recuperación con el formato real: 43 caracteres base64url
 * (como 32 bytes en base64url).
 */
export class FakeResetTokenGenerator implements SessionTokenGenerator {
  private counter = 0;
  /** Se ejecuta dentro de `generate`, antes de devolver: sirve para intercalar otra ejecución. */
  onGenerate: (() => void) | null = null;

  /** Cuántas veces se llamó a `generate`. */
  get generateCalls(): number {
    return this.counter;
  }

  generate(): GeneratedSessionToken {
    this.counter += 1;
    const token = `rst${String(this.counter).padStart(10, '0')}${'A'.repeat(30)}`;
    this.onGenerate?.();
    return { token, tokenHash: this.hash(token) };
  }

  /** SHA-256 hex determinista: igual que el real, el hash no contiene el token en claro. */
  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
