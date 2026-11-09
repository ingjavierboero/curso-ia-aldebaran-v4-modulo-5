import type {
  GeneratedSessionToken,
  SessionTokenGenerator,
} from '../../src/application/auth/SessionTokenGenerator.js';

export class FakeSessionTokenGenerator implements SessionTokenGenerator {
  private counter = 0;

  generate(): GeneratedSessionToken {
    this.counter += 1;
    const token = `token-${this.counter}`;
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return `sha256:${token}`;
  }
}
