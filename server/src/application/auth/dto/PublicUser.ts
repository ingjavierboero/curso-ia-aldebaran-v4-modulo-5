import type { User, UserRole, UserStatus } from '../../../domain/user/User.js';

/** Lo único que los casos de uso devuelven de un usuario (FR-08): nunca `passwordHash`. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email.value,
    role: user.role,
    status: user.status,
  };
}
