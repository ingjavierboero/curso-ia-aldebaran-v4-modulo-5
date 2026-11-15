import { describe, expect, it } from 'vitest';
import { Session } from '../../src/domain/auth/Session.js';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';
import { InMemorySessionRepository } from './InMemorySessionRepository.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from './InMemoryUserRepository.js';

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
  const uow = new InMemoryUnitOfWork(users, sessions);
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
