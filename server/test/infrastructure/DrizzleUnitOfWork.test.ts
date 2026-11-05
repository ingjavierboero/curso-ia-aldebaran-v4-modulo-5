import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';
import { DrizzleUnitOfWork } from '../../src/infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

function makeUser(id: string, email: string): User {
  return new User({
    id,
    name: 'Ana',
    email: Email.create(email),
    role: 'admin',
    status: 'activo',
    passwordHash: 'h',
    createdAt: new Date('2026-11-04T12:00:00.000Z'),
  });
}

describe('DrizzleUnitOfWork', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => {
    t.cleanup();
  });

  it('confirma los cambios y devuelve el resultado de fn', () => {
    const uow = new DrizzleUnitOfWork(t.db);

    const result = uow.run(({ users }) => {
      users.insert(makeUser('u-1', 'a@empresa.com'));
      return users.countAll();
    });

    expect(result).toBe(1);
    expect(new DrizzleUserRepository(t.db).countAll()).toBe(1);
  });

  it('DrizzleUnitOfWork revierte la transacción si fn lanza', () => {
    const outside = new DrizzleUserRepository(t.db);
    outside.insert(makeUser('u-0', 'previo@empresa.com'));
    const uow = new DrizzleUnitOfWork(t.db);
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ users }) => {
        users.insert(makeUser('u-1', 'a@empresa.com'));
        expect(users.countAll()).toBe(2);
        throw boom;
      }),
    ).toThrow(boom);

    expect(outside.countAll()).toBe(1);
    expect(outside.findById('u-1')).toBeNull();
    expect(outside.findById('u-0')).not.toBeNull();
    expect(t.db.$client.inTransaction).toBe(false);
  });

  it('rechaza una fn que devuelve una Promise y no deja sus cambios síncronos', () => {
    const uow = new DrizzleUnitOfWork(t.db);

    expect(() =>
      uow.run(({ users }) => {
        users.insert(makeUser('u-1', 'a@empresa.com'));
        return Promise.resolve();
      }),
    ).toThrow(TypeError);

    expect(new DrizzleUserRepository(t.db).countAll()).toBe(0);
  });

  it('abre la transacción con BEGIN IMMEDIATE (toma el lock de escritura al empezar)', () => {
    const uow = new DrizzleUnitOfWork(t.db);
    const sqlite = t.db.$client;
    const original = sqlite.transaction.bind(sqlite);
    const behaviors: string[] = [];
    // espía sobre el método nativo: registra qué variante de la transacción se invoca
    sqlite.transaction = ((fn: (...args: unknown[]) => unknown) => {
      const tx = original(fn);
      return new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === 'deferred' || prop === 'immediate' || prop === 'exclusive') behaviors.push(prop);
          return Reflect.get(target, prop, receiver);
        },
      });
    }) as typeof sqlite.transaction;

    try {
      uow.run(({ users }) => users.countAll());
    } finally {
      sqlite.transaction = original;
    }

    expect(behaviors).toEqual(['immediate']);
  });
});
