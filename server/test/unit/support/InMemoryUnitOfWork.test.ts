import { describe, expect, it } from 'vitest';
import { PasswordResetToken } from '../../../src/domain/auth/PasswordResetToken.js';
import { Session } from '../../../src/domain/auth/Session.js';
import { Client } from '../../../src/domain/client/Client.js';
import { Cuit } from '../../../src/domain/client/Cuit.js';
import { IvaCondition } from '../../../src/domain/shared/IvaCondition.js';
import { Price } from '../../../src/domain/product/Price.js';
import { Product } from '../../../src/domain/product/Product.js';
import { Email } from '../../../src/domain/shared/Email.js';
import { BillingHour } from '../../../src/domain/settings/BillingHour.js';
import { BillingSettings } from '../../../src/domain/settings/BillingSettings.js';
import { PointOfSale } from '../../../src/domain/settings/PointOfSale.js';
import { User } from '../../../src/domain/user/User.js';
import { InMemoryClientProductRepository } from '../../support/InMemoryClientProductRepository.js';
import { InMemoryClientRepository } from '../../support/InMemoryClientRepository.js';
import { InMemoryPasswordResetTokenRepository } from '../../support/InMemoryPasswordResetTokenRepository.js';
import { InMemoryProductRepository } from '../../support/InMemoryProductRepository.js';
import { InMemorySessionRepository } from '../../support/InMemorySessionRepository.js';
import { InMemorySettingsRepository } from '../../support/InMemorySettingsRepository.js';
import { InMemoryUnitOfWork } from '../../support/InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from '../../support/InMemoryUserRepository.js';

const CREATED = new Date('2026-11-04T12:00:00.000Z');

function makeUser(id: string, email: string): User {
  return new User({
    id,
    name: 'Ana',
    email: Email.create(email),
    role: 'admin',
    status: 'activo',
    passwordHash: 'h',
    createdAt: CREATED,
  });
}

function makeSession(id: string, userId: string): Session {
  return new Session({ id, userId, tokenHash: `hash-${id}`, createdAt: CREATED, lastActivityAt: CREATED });
}

function setup() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const uow = new InMemoryUnitOfWork({ users, sessions });
  return { users, sessions, uow };
}

describe('InMemoryUnitOfWork', () => {
  it('confirma los cambios cuando fn termina bien', () => {
    const { users, uow } = setup();

    const result = uow.run(({ users: tx }) => {
      tx.insert(makeUser('u-1', 'a@empresa.com'));
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(users.countAll()).toBe(1);
  });

  it('pasa los repositorios de usuarios y de sesiones a fn', () => {
    const { users, sessions, uow } = setup();
    users.insert(makeUser('u-1', 'a@empresa.com'));

    uow.run(({ sessions: tx }) => {
      tx.insert(makeSession('s-1', 'u-1'));
    });

    expect(sessions.all().map((s) => s.id)).toEqual(['s-1']);
  });

  it('revierte lo insertado dentro de run si fn lanza, y propaga el error', () => {
    const { users, uow } = setup();
    users.insert(makeUser('u-0', 'previo@empresa.com'));
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ users: tx }) => {
        tx.insert(makeUser('u-1', 'a@empresa.com'));
        throw boom;
      }),
    ).toThrow(boom);

    expect(users.countAll()).toBe(1);
    expect(users.findById('u-1')).toBeNull();
    expect(users.findById('u-0')).not.toBeNull();
  });

  // Un error dentro de run deja usuarios y sesiones como estaban
  it('test_in_memory_uow_error_revierte_usuarios_y_sesiones', () => {
    const { users, sessions, uow } = setup();
    const ana = makeUser('u-1', 'a@empresa.com');
    users.insert(ana);
    sessions.insert(makeSession('s-1', 'u-1'));
    sessions.insert(makeSession('s-2', 'u-1'));
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ users: txUsers, sessions: txSessions }) => {
        txUsers.update(ana.deactivated());
        expect(txSessions.deleteByUserId('u-1')).toBe(2);
        throw boom;
      }),
    ).toThrow(boom);

    expect(users.findById('u-1')?.status).toBe('activo');
    expect(sessions.all().map((s) => s.id)).toEqual(['s-1', 's-2']);
  });

  // FEAT-008: un error dentro de run deja resetTokens sin cambios
  it('test_uow_error_revierte_reset_tokens', () => {
    const users = new InMemoryUserRepository();
    const sessions = new InMemorySessionRepository();
    const resetTokens = new InMemoryPasswordResetTokenRepository();
    const uow = new InMemoryUnitOfWork({ users, sessions, resetTokens });
    const t0 = new Date('2026-11-16T12:00:00.000Z');
    resetTokens.insert(PasswordResetToken.issue({ id: 't-1', userId: 'u-1', tokenHash: 'a'.repeat(64), now: t0 }));
    const boom = new Error('boom');
    const later = new Date('2026-11-16T12:06:00.000Z');

    expect(() =>
      uow.run(({ resetTokens: tx }) => {
        expect(tx).toBe(resetTokens);
        tx.invalidateAllForUser('u-1', later);
        tx.insert(PasswordResetToken.issue({ id: 't-2', userId: 'u-1', tokenHash: 'b'.repeat(64), now: later }));
        throw boom;
      }),
    ).toThrow(boom);

    expect(resetTokens.findByTokenHash('a'.repeat(64))?.invalidatedAt).toBeNull();
    expect(resetTokens.findByTokenHash('b'.repeat(64))).toBeNull();
    expect(resetTokens.latestCreatedAtForUser('u-1')?.toISOString()).toBe(t0.toISOString());
  });

  it('sin los repositorios opcionales usa repositorios propios vacíos', () => {
    const { uow } = setup();

    const seen = uow.run(({ resetTokens, clients, products, clientProducts, settings }) => ({
      latest: resetTokens.latestCreatedAtForUser('u-1'),
      clients: clients.list(),
      products: products.list(),
      assigned: clientProducts.listProductIdsOf('c-1'),
      billingHour: settings.get().billingHour.value,
    }));

    expect(seen).toEqual({ latest: null, clients: [], products: [], assigned: [], billingHour: '11:00' });
  });

  // FEAT-010: un error dentro de run deja clientes, productos y asignaciones como estaban
  it('test_uow_error_revierte_clientes_productos', () => {
    const users = new InMemoryUserRepository();
    const sessions = new InMemorySessionRepository();
    const clients = new InMemoryClientRepository();
    const products = new InMemoryProductRepository();
    const clientProducts = new InMemoryClientProductRepository();
    const uow = new InMemoryUnitOfWork({ users, sessions, clients, products, clientProducts });
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
    clients.insert(makeClient('c-1', '30711111111', 'c1@empresa.com'));
    products.insert(makeProduct('p-1', 'Turnos'));
    clientProducts.assign('c-1', 'p-1', t0);
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ clients: txClients, products: txProducts, clientProducts: txAssignments }) => {
        expect(txClients).toBe(clients);
        expect(txProducts).toBe(products);
        expect(txAssignments).toBe(clientProducts);
        txClients.update((txClients.findById('c-1') as Client).deactivated());
        txClients.insert(makeClient('c-2', '20123456786', 'c2@empresa.com'));
        txProducts.update((txProducts.findById('p-1') as Product).deactivated());
        txProducts.insert(makeProduct('p-2', 'Agenda'));
        expect(txAssignments.unassign('c-1', 'p-1')).toBe(true);
        txAssignments.assign('c-2', 'p-2', t0);
        throw boom;
      }),
    ).toThrow(boom);

    expect(clients.list().map((c) => [c.id, c.status])).toEqual([['c-1', 'activo']]);
    expect(products.list().map((p) => [p.id, p.status])).toEqual([['p-1', 'activo']]);
    expect(clientProducts.listProductIdsOf('c-1')).toEqual(['p-1']);
    expect(clientProducts.listProductIdsOf('c-2')).toEqual([]);
  });

  // FEAT-011: un error dentro de run deja la configuración como estaba
  it('test_uow_error_revierte_settings', () => {
    const users = new InMemoryUserRepository();
    const sessions = new InMemorySessionRepository();
    const settings = new InMemorySettingsRepository();
    const uow = new InMemoryUnitOfWork({ users, sessions, settings });
    const t0 = new Date('2026-11-16T12:00:00.000Z');
    const later = new Date('2026-11-16T13:00:00.000Z');
    settings.saveBilling(
      BillingSettings.defaults().withChanges({ billingHour: BillingHour.parse('09:00'), pointOfSale: PointOfSale.of(3) }),
      t0,
    );
    const boom = new Error('boom');

    expect(() =>
      uow.run(({ settings: tx }) => {
        expect(tx).toBe(settings);
        tx.saveBilling(
          tx.get().withChanges({ billingHour: BillingHour.parse('18:45'), issuerLegalName: 'Otra SRL' }),
          later,
        );
        expect(tx.get().billingHour.value).toBe('18:45');
        throw boom;
      }),
    ).toThrow(boom);

    const after = settings.get();
    expect(after.billingHour.value).toBe('09:00');
    expect(after.pointOfSale?.value).toBe(3);
    expect(after.issuerLegalName).toBeNull();
    expect(settings.updatedAt?.toISOString()).toBe(t0.toISOString());

    // sin fila previa, el rollback vuelve a no tener fila
    const empty = new InMemorySettingsRepository();
    const uowEmpty = new InMemoryUnitOfWork({ users, sessions, settings: empty });
    expect(() =>
      uowEmpty.run(({ settings: tx }) => {
        tx.saveBilling(tx.get().withChanges({ billingHour: BillingHour.parse('18:45') }), later);
        throw boom;
      }),
    ).toThrow(boom);
    expect(empty.updatedAt).toBeNull();
    expect(empty.get().billingHour.value).toBe('11:00');
  });

  it('rechaza una fn que devuelve una Promise y no deja sus cambios síncronos', () => {
    const { users, uow } = setup();

    expect(() =>
      uow.run(({ users: tx }) => {
        tx.insert(makeUser('u-1', 'a@empresa.com'));
        return Promise.resolve();
      }),
    ).toThrow(TypeError);

    expect(users.countAll()).toBe(0);
  });
});
