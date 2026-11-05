import { createHash, randomBytes } from 'node:crypto';
import type { GeneratedSessionToken, SessionTokenGenerator } from '../../application/auth/SessionTokenGenerator.js';

/** Token de 32 bytes aleatorios (256 bits) en base64url; en la base solo se guarda su SHA-256 hex. */
export class CryptoSessionTokenGenerator implements SessionTokenGenerator {
  generate(): GeneratedSessionToken {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
