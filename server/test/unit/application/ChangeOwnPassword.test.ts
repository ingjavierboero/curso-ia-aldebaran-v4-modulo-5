import { describe, expect, it } from 'vitest';
import {
  IncorrectCurrentPassword,
  InvalidCredentials,
  Unauthenticated,
} from '../../../src/application/auth/errors.js';
import { PasswordUnchanged, WeakPassword } from '../../../src/domain/user/errors.js';
import type { UserRole } from '../../../src/domain/user/User.js';
import { createAuthContext } from '../../support/authContext.js';

const CURRENT = 'clave-actual-1';
const NEW = 'clave-nueva-22';

/** Un usuario con 2 sesiones abiertas: `current` es la del pedido, `other` la de otro dispositivo. */
async function withTwoSessions(role: UserRole = 'editor') {
  const ctx = createAuthContext();
  const user = ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com', role, password: CURRENT });
  const current = await ctx.login.execute({ email: 'ana@empresa.com', password: CURRENT });
  const other = await ctx.login.execute({ email: 'ana@empresa.com', password: CURRENT });
  return { ctx, user, current, other };
}

describe('ChangeOwnPassword', () => {
  // Después del cambio la nueva verifica y la anterior no (AC-03, NFR-01)
  it('test_change_own_password_guarda_la_nueva', async () => {
    const { ctx, user, current } = await withTwoSessions();

    await ctx.changeOwnPassword.execute({
      actor: user,
      sessionToken: current.token,
      currentPassword: CURRENT,
      newPassword: NEW,
    });

    const stored = ctx.users.findById('u-ana');
    expect(stored?.passwordHash).toBe(`hashed:${NEW}`);
    expect(await ctx.hasher.verify(stored?.passwordHash ?? '', NEW)).toBe(true);
    expect(await ctx.hasher.verify(stored?.passwordHash ?? '', CURRENT)).toBe(false);
    // la nueva se hashea una sola vez; nunca se guarda en texto plano
    expect(ctx.hasher.hashCalls).toEqual([NEW]);
    expect(stored?.passwordHash).not.toBe(NEW);
    // el resto del usuario no cambia
    expect(stored?.name).toBe(user.name);
    expect(stored?.email.value).toBe('ana@empresa.com');
    expect(stored?.role).toBe('editor');
    expect(stored?.status).toBe('activo');

    expect((await ctx.login.execute({ email: 'ana@empresa.com', password: NEW })).user.id).toBe('u-ana');
    await expect(ctx.login.execute({ email: 'ana@empresa.com', password: CURRENT })).rejects.toBeInstanceOf(
      InvalidCredentials,
    );
  });

  // Un usuario Consulta (solo lectura) cambia la propia: no hay permiso de Authorization (AC-04)
  it('test_change_own_password_perfil_consulta', async () => {
    const { ctx, user, current } = await withTwoSessions('consulta');

    await ctx.changeOwnPassword.execute({
      actor: user,
      sessionToken: current.token,
      currentPassword: CURRENT,
      newPassword: NEW,
    });

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${NEW}`);
  });

  // Actual incorrecta: IncorrectCurrentPassword, el hash no cambia y las 2 sesiones siguen (AC-05)
  it('test_change_own_password_actual_incorrecta_rechazado', async () => {
    const { ctx, user, current } = await withTwoSessions();

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: 'clave-equivocada',
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(IncorrectCurrentPassword);

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
    expect(ctx.sessions.all()).toHaveLength(2);
    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(ctx.uow.runs).toBe(0);
  });

  // Nueva de 7 caracteres: WeakPassword antes de tocar la base, sin cambios (AC-06)
  it('test_change_own_password_nueva_corta_rechazado', async () => {
    const { ctx, user, current } = await withTwoSessions();
    const verifiesBefore = ctx.hasher.verifyCalls.length;

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: '1234567',
      }),
    ).rejects.toBeInstanceOf(WeakPassword);

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
    expect(ctx.sessions.all()).toHaveLength(2);
    expect(ctx.hasher.verifyCalls).toHaveLength(verifiesBefore);
    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(ctx.uow.runs).toBe(0);
  });

  // Nueva de 1025 caracteres: WeakPassword, sin cambios (AC-07)
  it('test_change_own_password_nueva_larga_rechazado', async () => {
    const { ctx, user, current } = await withTwoSessions();
    const verifiesBefore = ctx.hasher.verifyCalls.length;

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: 'x'.repeat(1025),
      }),
    ).rejects.toBeInstanceOf(WeakPassword);

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
    expect(ctx.sessions.all()).toHaveLength(2);
    expect(ctx.hasher.verifyCalls).toHaveLength(verifiesBefore);
    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(ctx.uow.runs).toBe(0);
  });

  // Nueva igual a la actual: PasswordUnchanged, sin cambios (AC-08)
  it('test_change_own_password_igual_a_la_actual_rechazado', async () => {
    const { ctx, user, current } = await withTwoSessions();

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: CURRENT,
      }),
    ).rejects.toBeInstanceOf(PasswordUnchanged);

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
    expect(ctx.sessions.all()).toHaveLength(2);
    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(ctx.uow.runs).toBe(0);
  });

  // Con 2 sesiones, la otra se borra y la del pedido sigue (FR-07, AC-09)
  it('test_change_own_password_cierra_las_demas_sesiones', async () => {
    const { ctx, user, current, other } = await withTwoSessions();
    const bruno = ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', password: 'clave-bruno' });
    const brunoSession = await ctx.login.execute({ email: 'bruno@empresa.com', password: 'clave-bruno' });

    await ctx.changeOwnPassword.execute({
      actor: user,
      sessionToken: current.token,
      currentPassword: CURRENT,
      newPassword: NEW,
    });

    expect(ctx.authenticateSession.execute(current.token).id).toBe('u-ana');
    expect(() => ctx.authenticateSession.execute(other.token)).toThrow(Unauthenticated);
    // las sesiones de otros usuarios no se tocan
    expect(ctx.authenticateSession.execute(brunoSession.token).id).toBe(bruno.id);
    expect(ctx.sessions.all().map((s) => s.tokenHash).sort()).toEqual(
      [ctx.tokens.hash(current.token), ctx.tokens.hash(brunoSession.token)].sort(),
    );
  });

  // Dado de baja mientras se hashea la nueva: Unauthenticated y nada cambia (AC-15)
  it('test_change_own_password_usuario_inactivo_no_autorizado', async () => {
    const { ctx, user, current } = await withTwoSessions();
    ctx.hasher.onHash = () => {
      ctx.users.update(user.deactivated());
    };

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(Unauthenticated);

    expect(ctx.hasher.hashCalls).toEqual([NEW]);
    expect(ctx.uow.runs).toBe(1);
    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
    expect(ctx.sessions.all()).toHaveLength(2);
  });

  it('un usuario ya Inactivo o inexistente al empezar: Unauthenticated sin verificar ni hashear', async () => {
    const { ctx, user, current } = await withTwoSessions();
    ctx.users.update(user.deactivated());

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(Unauthenticated);
    await expect(
      ctx.changeOwnPassword.execute({
        actor: { id: 'no-existe', role: 'admin' },
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(Unauthenticated);

    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(ctx.uow.runs).toBe(0);
    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
  });

  // La sesión del pedido no es del actor: Unauthenticated y nada cambia (NFR-02, R-05)
  it('test_change_own_password_sesion_de_otro_usuario_rechazado', async () => {
    const { ctx, user } = await withTwoSessions();
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', password: 'clave-bruno' });
    const brunoSession = await ctx.login.execute({ email: 'bruno@empresa.com', password: 'clave-bruno' });

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: brunoSession.token,
        currentPassword: CURRENT,
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(Unauthenticated);
    // un token que no corresponde a ninguna sesión, tampoco
    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: 'token-inexistente',
        currentPassword: CURRENT,
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(Unauthenticated);

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(`hashed:${CURRENT}`);
    expect(ctx.users.findById('u-bruno')?.passwordHash).toBe('hashed:clave-bruno');
    expect(ctx.sessions.all()).toHaveLength(3);
  });

  // El hash cambió entre la verificación y la transacción: IncorrectCurrentPassword y no escribe (R-04)
  it('test_change_own_password_cambio_concurrente_rechazado', async () => {
    const { ctx, user, current } = await withTwoSessions();
    ctx.hasher.onHash = () => {
      ctx.users.updatePasswordHash(user.withPasswordHash('hashed:cambiada-en-otra-pestaña'));
    };

    await expect(
      ctx.changeOwnPassword.execute({
        actor: user,
        sessionToken: current.token,
        currentPassword: CURRENT,
        newPassword: NEW,
      }),
    ).rejects.toBeInstanceOf(IncorrectCurrentPassword);

    expect(ctx.uow.runs).toBe(1);
    expect(ctx.users.findById('u-ana')?.passwordHash).toBe('hashed:cambiada-en-otra-pestaña');
    expect(ctx.sessions.all()).toHaveLength(2);
  });
});
