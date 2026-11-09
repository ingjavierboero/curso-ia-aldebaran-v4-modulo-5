import { describe, expect, it } from 'vitest';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from './InMemoryUserRepository.js';

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

describe('InMemoryUnitOfWork', () => {
  it('confirma los cambios cuando fn termina bien', () => {
    const users = new InMemoryUserRepository();
    const uow = new InMemoryUnitOfWork(users);

    const result = uow.run(({ users: tx }) => {
      tx.insert(makeUser('u-1', 'a@empresa.com'));
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(users.countAll()).toBe(1);
  });

  it('revierte lo insertado dentro de run si fn lanza, y propaga el error', () => {
    const users = new InMemoryUserRepository();
    users.insert(makeUser('u-0', 'previo@empresa.com'));
    const uow = new InMemoryUnitOfWork(users);
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

  it('rechaza una fn que devuelve una Promise y no deja sus cambios síncronos', () => {
    const users = new InMemoryUserRepository();
    const uow = new InMemoryUnitOfWork(users);

    expect(() =>
      uow.run(({ users: tx }) => {
        tx.insert(makeUser('u-1', 'a@empresa.com'));
        return Promise.resolve();
      }),
    ).toThrow(TypeError);

    expect(users.countAll()).toBe(0);
  });
});
