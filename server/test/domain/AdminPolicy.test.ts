import { describe, expect, it } from 'vitest';
import { assertKeepsAnActiveAdmin } from '../../src/domain/user/AdminPolicy.js';
import { Email } from '../../src/domain/shared/Email.js';
import { LastActiveAdmin } from '../../src/domain/user/errors.js';
import { User, type UserRole, type UserStatus } from '../../src/domain/user/User.js';

function makeUser(role: UserRole = 'admin', status: UserStatus = 'activo'): User {
  return new User({
    id: 'u-1',
    name: 'Ana',
    email: Email.create('ana@empresa.com'),
    role,
    status,
    passwordHash: 'h',
    createdAt: new Date('2026-11-04T12:00:00.000Z'),
  });
}

describe('AdminPolicy', () => {
  // Baja o cambio de perfil del único Admin Activo lanza LastActiveAdmin; con 2 no lanza (AC-10, AC-11)
  it('test_admin_policy_ultimo_admin_rechazado', () => {
    const admin = makeUser();
    const deactivated = admin.deactivated();
    const demoted = admin.withProfile({ name: admin.name, email: admin.email, role: 'editor' });

    expect(() => { assertKeepsAnActiveAdmin(admin, deactivated, 1); }).toThrow(LastActiveAdmin);
    expect(() => { assertKeepsAnActiveAdmin(admin, demoted, 1); }).toThrow(LastActiveAdmin);

    expect(() => { assertKeepsAnActiveAdmin(admin, deactivated, 2); }).not.toThrow();
    expect(() => { assertKeepsAnActiveAdmin(admin, demoted, 2); }).not.toThrow();
  });

  it('no aplica si el usuario sigue siendo Admin Activo o si antes no lo era', () => {
    const admin = makeUser();
    const renamed = admin.withProfile({ name: 'Ana María', email: admin.email, role: 'admin' });
    const editor = makeUser('editor');
    const inactiveAdmin = makeUser('admin', 'inactivo');

    expect(() => { assertKeepsAnActiveAdmin(admin, renamed, 1); }).not.toThrow();
    expect(() => { assertKeepsAnActiveAdmin(editor, editor.deactivated(), 1); }).not.toThrow();
    expect(() => {
      assertKeepsAnActiveAdmin(inactiveAdmin, inactiveAdmin.withProfile({ name: 'Ana', email: inactiveAdmin.email, role: 'consulta' }), 1);
    }).not.toThrow();
  });
});
