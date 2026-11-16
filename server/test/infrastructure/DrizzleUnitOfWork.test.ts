import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '../../src/domain/client/Client.js';
import { Cuit } from '../../src/domain/client/Cuit.js';
import { IvaCondition } from '../../src/domain/client/IvaCondition.js';
import { Price } from '../../src/domain/product/Price.js';
import { Product } from '../../src/domain/product/Product.js';
import { Email } from '../../src/domain/shared/Email.js';
import { PasswordResetToken } from '../../src/domain/auth/PasswordResetToken.js';
import { Session } from '../../src/domain/auth/Session.js';
import { User } from '../../src/domain/user/User.js';
import { DrizzleClientProductRepository } from '../../src/infrastructure/db/DrizzleClientProductRepository.js';
import { DrizzleClientRepository } from '../../src/infrastructure/db/DrizzleClientRepository.js';
import { DrizzlePasswordResetTokenRepository } from '../../src/infrastructure/db/DrizzlePasswordResetTokenRepository.js';
import { DrizzleProductRepository } from '../../src/infrastructure/db/DrizzleProductRepository.js';
import { DrizzleSessionRepository } from '../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUnitOfWork } from '../../src/infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

function makeSession(id: string, tokenHash: string): Session {
  const at = new Date('2026-11-04T12:00:00.000Z');
  return new Session({ id, userId: 'u-1', tokenHash, createdAt: at, lastActivityAt: at });
}

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

  // DrizzleUnitOfWork revierte la transacción si fn lanza
  it('test_drizzle_unit_of_work_revierte_la_transaccion_si_fn_lanza', () => {
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

  // FEAT-006 (FR-07): la baja y el borrado de sesiones van en la misma transacción
  it('test_drizzle_uow_error_revierte_baja_y_sesiones', () => {
    new DrizzleUserRepository(t.db).insert(makeUser('u-1', 'a@empresa.com'));
    const outsideSessions = new DrizzleSessionRepository(t.db);
    outsideSessions.insert(makeSession('s-1', 'a'.repeat(64)));
    outsideSessions.insert(makeSession('s-2', 'b'.repeat(64)));
    const uow = new DrizzleUnitOfWork(t.db);
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ users, sessions }) => {
        const user = users.findById('u-1') as User;
        users.update(user.deactivated());
        expect(sessions.deleteByUserId('u-1')).toBe(2);
        throw boom;
      }),
    ).toThrow(boom);

    expect(new DrizzleUserRepository(t.db).findById('u-1')?.status).toBe('activo');
    expect(outsideSessions.findByTokenHash('a'.repeat(64))?.id).toBe('s-1');
    expect(outsideSessions.findByTokenHash('b'.repeat(64))?.id).toBe('s-2');
    expect(t.db.$client.inTransaction).toBe(false);
  });

  // FEAT-008: los cambios sobre resetTokens se revierten junto con los demás repositorios
  it('test_uow_error_revierte_reset_tokens', () => {
    new DrizzleUserRepository(t.db).insert(makeUser('u-1', 'a@empresa.com'));
    const outside = new DrizzlePasswordResetTokenRepository(t.db);
    const t0 = new Date('2026-11-16T12:00:00.000Z');
    outside.insert(PasswordResetToken.issue({ id: 't-1', userId: 'u-1', tokenHash: 'a'.repeat(64), now: t0 }));
    const uow = new DrizzleUnitOfWork(t.db);
    const boom = new Error('boom');
    const later = new Date('2026-11-16T12:06:00.000Z');

    expect(() =>
      uow.run(({ resetTokens }) => {
        resetTokens.invalidateAllForUser('u-1', later);
        resetTokens.insert(PasswordResetToken.issue({ id: 't-2', userId: 'u-1', tokenHash: 'b'.repeat(64), now: later }));
        expect(resetTokens.latestCreatedAtForUser('u-1')?.toISOString()).toBe(later.toISOString());
        throw boom;
      }),
    ).toThrow(boom);

    expect(outside.findByTokenHash('a'.repeat(64))?.invalidatedAt).toBeNull();
    expect(outside.findByTokenHash('b'.repeat(64))).toBeNull();
    expect(outside.latestCreatedAtForUser('u-1')?.toISOString()).toBe(t0.toISOString());
    expect(t.db.$client.inTransaction).toBe(false);
  });

  // FEAT-010: clientes, productos y asignaciones se revierten junto con los demás repositorios
  it('test_uow_error_revierte_clientes_productos', () => {
    const t0 = new Date('2026-11-16T12:00:00.000Z');
    const makeClient = (id: string, cuit: string, email: string) =>
      Client.create({
        id,
        businessName: `Cliente ${id}`,
        cuit: Cuit.parse(cuit),
        address: 'Calle 1',
        billingEmail: Email.create(email),
        ivaCondition: IvaCondition.of(1),
        createdAt: t0,
      });
    const makeProduct = (id: string, name: string) =>
      Product.create({ id, name, price: Price.parse('100', 'ARS'), createdAt: t0 });
    const outsideClients = new DrizzleClientRepository(t.db);
    const outsideProducts = new DrizzleProductRepository(t.db);
    const outsideAssignments = new DrizzleClientProductRepository(t.db);
    outsideClients.insert(makeClient('c-1', '30711111111', 'c1@empresa.com'));
    outsideProducts.insert(makeProduct('p-1', 'Turnos'));
    outsideAssignments.assign('c-1', 'p-1', t0);
    const uow = new DrizzleUnitOfWork(t.db);
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ clients, products, clientProducts }) => {
        clients.update((clients.findById('c-1') as Client).deactivated());
        clients.insert(makeClient('c-2', '20123456786', 'c2@empresa.com'));
        products.update((products.findById('p-1') as Product).deactivated());
        products.insert(makeProduct('p-2', 'Agenda'));
        expect(clientProducts.unassign('c-1', 'p-1')).toBe(true);
        clientProducts.assign('c-2', 'p-2', t0);
        expect(clientProducts.listProductIdsOf('c-2')).toEqual(['p-2']);
        throw boom;
      }),
    ).toThrow(boom);

    expect(outsideClients.list().map((c) => [c.id, c.status])).toEqual([['c-1', 'activo']]);
    expect(outsideProducts.list().map((p) => [p.id, p.status])).toEqual([['p-1', 'activo']]);
    expect(outsideAssignments.listProductIdsOf('c-1')).toEqual(['p-1']);
    expect(outsideAssignments.listProductIdsOf('c-2')).toEqual([]);
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
          const value: unknown = Reflect.get(target, prop, receiver);
          return value;
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
