import { describe, expect, it } from 'vitest';
import { createAuthContext } from '../support/authContext.js';

describe('GetSetupStatus', () => {
  it('GetSetupStatus indica que falta el primer Admin solo mientras no hay usuarios', () => {
    const ctx = createAuthContext();

    expect(ctx.getSetupStatus.execute()).toEqual({ needsFirstAdmin: true });

    ctx.seedUser();

    expect(ctx.getSetupStatus.execute()).toEqual({ needsFirstAdmin: false });
  });
});
