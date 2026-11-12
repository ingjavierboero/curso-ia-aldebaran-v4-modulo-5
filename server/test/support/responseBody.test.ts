import { describe, expect, it } from 'vitest';
import { responseBody } from './responseBody.js';

describe('responseBody', () => {
  it('test_body_con_forma_esperada_se_estrecha', () => {
    const raw: unknown = {
      user: { id: 'u-1', email: 'admin@empresa.com', role: 'admin' },
      count: 3,
      ok: true,
    };

    const body = responseBody(raw, {
      user: { id: 'string', email: 'string' },
      count: 'number',
      ok: 'boolean',
    });

    // el valor tipado es el mismo objeto, sin copiar ni recortar campos
    expect(body).toBe(raw);
    const email: string = body.user.email;
    const count: number = body.count;
    const ok: boolean = body.ok;
    expect(email).toBe('admin@empresa.com');
    expect(count).toBe(3);
    expect(ok).toBe(true);

    const withObject = responseBody(raw, { user: 'object' });
    expect(Object.keys(withObject.user).sort()).toEqual(['email', 'id', 'role']);

    const withUnknown = responseBody(raw, { count: 'unknown' });
    expect(withUnknown.count).toBe(3);
  });

  it('test_body_con_campo_faltante_error', () => {
    expect(() => responseBody({ error: 'x' }, { user: 'object' })).toThrow(Error);
    expect(() => responseBody({ error: 'x' }, { user: 'object' })).toThrow(/user/);
    expect(() => responseBody({ user: { id: 'u-1' } }, { user: { email: 'string' } })).toThrow(/user\.email/);
    expect(() => responseBody({ user: { id: 'u-1' } }, { user: { email: 'string' } })).toThrow(/falta/);
    // un campo con el tipo equivocado también nombra el campo
    expect(() => responseBody({ error: 42 }, { error: 'string' })).toThrow(/error.*string/);
    expect(() => responseBody({ user: null }, { user: { id: 'string' } })).toThrow(/user/);
    // 'unknown' exige que el campo exista
    expect(() => responseBody({}, { count: 'unknown' })).toThrow(/count/);
  });

  it('test_body_no_objeto_rechazado', () => {
    expect(() => responseBody(null, { error: 'string' })).toThrow(/no es un objeto/);
    expect(() => responseBody('Internal Server Error', { error: 'string' })).toThrow(/no es un objeto/);
    expect(() => responseBody(undefined, { error: 'string' })).toThrow(/no es un objeto/);
    expect(() => responseBody([{ error: 'x' }], { error: 'string' })).toThrow(/no es un objeto/);
  });
});
