import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoSessionTokenGenerator } from '../../src/infrastructure/auth/CryptoSessionTokenGenerator.js';
import { UuidGenerator } from '../../src/infrastructure/auth/UuidGenerator.js';
import { SystemClock } from '../../src/infrastructure/clock/SystemClock.js';

describe('CryptoSessionTokenGenerator', () => {
  it('genera 32 bytes aleatorios en base64url y guarda solo su SHA-256 hex', () => {
    const tokens = new CryptoSessionTokenGenerator();

    const a = tokens.generate();
    const b = tokens.generate();

    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a.token, 'base64url')).toHaveLength(32);
    expect(a.tokenHash).toBe(createHash('sha256').update(a.token).digest('hex'));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(a.token)).toBe(a.tokenHash);
    expect(b.token).not.toBe(a.token);
  });
});

describe('UuidGenerator', () => {
  it('devuelve UUID v4 distintos', () => {
    const ids = new UuidGenerator();
    const a = ids.next();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids.next()).not.toBe(a);
  });
});

describe('SystemClock', () => {
  it('devuelve la hora actual como Date', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    const after = Date.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});
