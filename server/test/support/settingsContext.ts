import { GetBillingSettings } from '../../src/application/settings/GetBillingSettings.js';
import { UpdateBillingSettings } from '../../src/application/settings/UpdateBillingSettings.js';
import { Email } from '../../src/domain/shared/Email.js';
import { User, type UserRole, type UserStatus } from '../../src/domain/user/User.js';
import { FakeClock } from './FakeClock.js';
import { InMemorySessionRepository } from './InMemorySessionRepository.js';
import { InMemorySettingsRepository } from './InMemorySettingsRepository.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from './InMemoryUserRepository.js';

/**
 * Arma los casos de uso de la configuración de facturación sobre dobles en memoria, sin base ni HTTP.
 * Siembra un usuario Activo de cada perfil (`admin`, `editor`, `consulta`) y un Admin Inactivo
 * (`inactiveAdmin`). `clockStart` fija el reloj, que por defecto es el de `FakeClock`.
 */
export function createSettingsContext(clockStart?: Date | string) {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const settings = new InMemorySettingsRepository();
  const uow = new InMemoryUnitOfWork({ users, sessions, settings });
  const clock = new FakeClock(clockStart);

  function seedUser(id: string, role: UserRole, status: UserStatus = 'activo'): User {
    const user = new User({
      id,
      name: `Usuario ${id}`,
      email: Email.create(`${id}@empresa.com`),
      role,
      status,
      passwordHash: 'hashed:contraseña-segura',
      createdAt: clock.now(),
    });
    users.insert(user);
    return user;
  }

  const admin = seedUser('u-admin', 'admin');
  const editor = seedUser('u-editor', 'editor');
  const consulta = seedUser('u-consulta', 'consulta');
  const inactiveAdmin = seedUser('u-admin-baja', 'admin', 'inactivo');

  return {
    users,
    settings,
    uow,
    clock,
    admin,
    editor,
    consulta,
    inactiveAdmin,
    getBillingSettings: new GetBillingSettings({ users, settings }),
    updateBillingSettings: new UpdateBillingSettings({ uow, clock }),
  };
}

export type SettingsContext = ReturnType<typeof createSettingsContext>;
