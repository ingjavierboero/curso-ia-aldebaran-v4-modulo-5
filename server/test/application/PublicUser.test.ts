import { describe, expect, it } from 'vitest';
import { toPublicUser } from '../../src/application/auth/dto/PublicUser.js';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';

describe('PublicUser', () => {
  it('PublicUser no tiene la propiedad passwordHash', () => {
    const user = new User({
      id: 'u-1',
      name: 'Ana Pérez',
      email: Email.create('admin@empresa.com'),
      role: 'editor',
      status: 'activo',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$secreto',
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
    });

    const dto = toPublicUser(user);

    expect(dto).not.toHaveProperty('passwordHash');
    expect(Object.keys(dto).sort()).toEqual(['email', 'id', 'name', 'role', 'status']);
    expect(dto).toEqual({
      id: 'u-1',
      name: 'Ana Pérez',
      email: 'admin@empresa.com',
      role: 'editor',
      status: 'activo',
    });
    expect(JSON.stringify(dto)).not.toContain('argon2id');
  });
});
