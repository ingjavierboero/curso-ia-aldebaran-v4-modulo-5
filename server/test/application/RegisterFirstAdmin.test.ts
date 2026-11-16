import { describe, expect, it } from 'vitest';
import { FirstAdminAlreadyExists } from '../../src/application/auth/errors.js';
import { RegisterFirstAdmin } from '../../src/application/auth/RegisterFirstAdmin.js';
import { Email } from '../../src/domain/shared/Email.js';
import { InvalidEmail } from '../../src/domain/shared/errors.js';
import { InvalidName, WeakPassword } from '../../src/domain/user/errors.js';
import { User } from '../../src/domain/user/User.js';
import { createAuthContext } from '../support/authContext.js';
import { FakeClock } from '../support/FakeClock.js';
import { FakePasswordHasher } from '../support/FakePasswordHasher.js';
import { InMemorySessionRepository } from '../support/InMemorySessionRepository.js';
import { InMemoryUnitOfWork } from '../support/InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from '../support/InMemoryUserRepository.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';

const VALID = { name: 'Ana Pérez', email: 'admin@empresa.com', password: 'contraseña-segura' };

describe('RegisterFirstAdmin', () => {
  // RegisterFirstAdmin con sistema vacío crea un Admin Activo que puede hacer Login
  it('test_register_first_admin_sistema_vacio_crea_admin_activo_que_hace_login', async () => {
    const ctx = createAuthContext();

    const created = await ctx.registerFirstAdmin.execute({
      name: '  Ana Pérez ',
      email: ' Admin@Empresa.com',
      password: 'contraseña-segura',
    });

    expect(created).toEqual({
      id: 'id-1',
      name: 'Ana Pérez',
      email: 'admin@empresa.com',
      role: 'admin',
      status: 'activo',
    });
    expect(ctx.users.countAll()).toBe(1);
    const stored = ctx.users.findById('id-1');
    expect(stored?.passwordHash).toBe('hashed:contraseña-segura');
    expect(stored?.createdAt).toEqual(ctx.clock.now());

    const session = await ctx.login.execute({ email: 'admin@empresa.com', password: 'contraseña-segura' });
    expect(session.user).toEqual(created);
  });

  // RegisterFirstAdmin con contraseña de 7 caracteres es rechazado con WeakPassword y no crea usuario
  it('test_register_first_admin_contrasena_de_7_rechazado_weak_password_sin_crear_usuario', async () => {
    const ctx = createAuthContext();

    await expect(
      ctx.registerFirstAdmin.execute({ ...VALID, password: '1234567' }),
    ).rejects.toBeInstanceOf(WeakPassword);
    expect(ctx.users.countAll()).toBe(0);
    expect(ctx.hasher.hashCalls).toHaveLength(0);
  });

  // RegisterFirstAdmin con email inválido es rechazado con InvalidEmail
  it('test_register_first_admin_email_invalido_rechazado_invalid_email', async () => {
    const ctx = createAuthContext();

    await expect(
      ctx.registerFirstAdmin.execute({ ...VALID, email: 'admin@empresa' }),
    ).rejects.toBeInstanceOf(InvalidEmail);
    expect(ctx.users.countAll()).toBe(0);
  });

  // RegisterFirstAdmin con nombre faltante es rechazado con InvalidName
  it('test_register_first_admin_nombre_faltante_rechazado_invalid_name', async () => {
    const ctx = createAuthContext();

    await expect(ctx.registerFirstAdmin.execute({ ...VALID, name: '   ' })).rejects.toBeInstanceOf(
      InvalidName,
    );
    expect(ctx.users.countAll()).toBe(0);
  });

  // RegisterFirstAdmin con un usuario existente es rechazado con FirstAdminAlreadyExists (conflict) sin llamar a hash
  it('test_register_first_admin_con_usuario_existente_rechazado_conflict_sin_hash', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ email: 'otro@empresa.com' });

    await expect(ctx.registerFirstAdmin.execute(VALID)).rejects.toBeInstanceOf(FirstAdminAlreadyExists);
    expect(ctx.hasher.hashCalls).toHaveLength(0);
    expect(ctx.users.countAll()).toBe(1);
  });

  it('RegisterFirstAdmin vuelve a verificar dentro de la unidad de trabajo si otro registro ganó la carrera durante el hash', async () => {
    const ctx = createAuthContext();
    ctx.hasher.onHash = () => {
      ctx.seedUser({ id: 'ganador', email: 'ganador@empresa.com' });
    };

    await expect(ctx.registerFirstAdmin.execute(VALID)).rejects.toBeInstanceOf(FirstAdminAlreadyExists);
    expect(ctx.hasher.hashCalls).toHaveLength(1);
    expect(ctx.users.all().map((u) => u.id)).toEqual(['ganador']);
  });

  // El repositorio lanza EmailAlreadyInUse; el caso de uso lo sigue informando como FirstAdminAlreadyExists
  it('test_register_first_admin_email_duplicado_sigue_siendo_ya_existe', async () => {
    // Simula la carrera que solo resuelve el UNIQUE de email: el conteo dice 0 pero el email ya está.
    class RacingUserRepository extends InMemoryUserRepository {
      override countAll(): number {
        return 0;
      }
    }
    const users = new RacingUserRepository();
    users.insert(
      new User({
        id: 'ganador',
        name: 'Otro Admin',
        email: Email.create(VALID.email),
        role: 'admin',
        status: 'activo',
        passwordHash: 'h',
        createdAt: new Date('2026-11-04T12:00:00.000Z'),
      }),
    );
    const registerFirstAdmin = new RegisterFirstAdmin({
      uow: new InMemoryUnitOfWork(users, new InMemorySessionRepository()),
      hasher: new FakePasswordHasher(),
      ids: new SequentialIdGenerator(),
      clock: new FakeClock(),
    });

    await expect(registerFirstAdmin.execute(VALID)).rejects.toBeInstanceOf(FirstAdminAlreadyExists);
    expect(users.all().map((u) => u.id)).toEqual(['ganador']);
  });
});
