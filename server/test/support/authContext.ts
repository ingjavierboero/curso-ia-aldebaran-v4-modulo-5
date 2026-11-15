import { AuthenticateSession } from '../../src/application/auth/AuthenticateSession.js';
import { GetSetupStatus } from '../../src/application/auth/GetSetupStatus.js';
import { Login } from '../../src/application/auth/Login.js';
import { Logout } from '../../src/application/auth/Logout.js';
import { PeekSession } from '../../src/application/auth/PeekSession.js';
import { RegisterFirstAdmin } from '../../src/application/auth/RegisterFirstAdmin.js';
import { CreateUser } from '../../src/application/user/CreateUser.js';
import { DeactivateUser } from '../../src/application/user/DeactivateUser.js';
import { ListUsers } from '../../src/application/user/ListUsers.js';
import { ReactivateUser } from '../../src/application/user/ReactivateUser.js';
import { UpdateUser } from '../../src/application/user/UpdateUser.js';
import { Email } from '../../src/domain/user/Email.js';
import { User, type UserRole, type UserStatus } from '../../src/domain/user/User.js';
import { FakeClock } from './FakeClock.js';
import { FakePasswordHasher } from './FakePasswordHasher.js';
import { FakeSessionTokenGenerator } from './FakeSessionTokenGenerator.js';
import { InMemorySessionRepository } from './InMemorySessionRepository.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from './InMemoryUserRepository.js';
import { SequentialIdGenerator } from './SequentialIdGenerator.js';

export const DUMMY_HASH = 'hashed:__dummy-password__';

export interface SeedUserOptions {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
}

/** Arma los casos de uso de auth sobre dobles en memoria, sin base ni HTTP. */
export function createAuthContext() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const uow = new InMemoryUnitOfWork(users, sessions);
  const clock = new FakeClock();
  const hasher = new FakePasswordHasher();
  const tokens = new FakeSessionTokenGenerator();
  const ids = new SequentialIdGenerator();

  const login = new Login({ users, sessions, hasher, tokens, ids, clock, dummyHash: DUMMY_HASH });
  const logout = new Logout({ sessions, tokens });
  const authenticateSession = new AuthenticateSession({ users, sessions, tokens, clock });
  const peekSession = new PeekSession({ users, sessions, tokens, clock });
  const registerFirstAdmin = new RegisterFirstAdmin({ uow, hasher, ids, clock });
  const getSetupStatus = new GetSetupStatus({ users });
  const listUsers = new ListUsers({ users });
  const createUser = new CreateUser({ uow, hasher, ids, clock });
  const updateUser = new UpdateUser({ uow });
  const deactivateUser = new DeactivateUser({ uow });
  const reactivateUser = new ReactivateUser({ uow });

  function seedUser(options: SeedUserOptions = {}): User {
    const password = options.password ?? 'contraseña-segura';
    const user = new User({
      id: options.id ?? `seed-${users.countAll() + 1}`,
      name: options.name ?? 'Ana Pérez',
      email: Email.create(options.email ?? 'admin@empresa.com'),
      role: options.role ?? 'admin',
      status: options.status ?? 'activo',
      passwordHash: `hashed:${password}`,
      createdAt: clock.now(),
    });
    users.insert(user);
    return user;
  }

  return {
    users,
    sessions,
    uow,
    clock,
    hasher,
    tokens,
    ids,
    login,
    logout,
    authenticateSession,
    peekSession,
    registerFirstAdmin,
    getSetupStatus,
    listUsers,
    createUser,
    updateUser,
    deactivateUser,
    reactivateUser,
    seedUser,
  };
}
