import { describe, expect, it } from 'vitest';
import { defaultSecureCookie } from '../../src/infrastructure/http/sessionCookie.js';

describe('defaultSecureCookie', () => {
  it('sin NODE_ENV la cookie lleva Secure (un deploy sin la variable no la emite sin Secure)', () => {
    expect(defaultSecureCookie({})).toBe(true);
  });

  it('con NODE_ENV production o cualquier valor que no sea development/test la cookie lleva Secure', () => {
    expect(defaultSecureCookie({ NODE_ENV: 'production' })).toBe(true);
    expect(defaultSecureCookie({ NODE_ENV: 'staging' })).toBe(true);
    expect(defaultSecureCookie({ NODE_ENV: '' })).toBe(true);
  });

  it('con NODE_ENV development o test la cookie no lleva Secure (HTTP local)', () => {
    expect(defaultSecureCookie({ NODE_ENV: 'development' })).toBe(false);
    expect(defaultSecureCookie({ NODE_ENV: 'test' })).toBe(false);
  });
});
