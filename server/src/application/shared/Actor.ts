import type { UserRole } from '../../domain/user/User.js';

/**
 * Quién ejecuta un caso de uso: el usuario de la sesión. `PublicUser` (y `User`) lo cumplen
 * estructuralmente. Las escrituras no confían en `role`: vuelven a leer al actor dentro de la
 * transacción (`requireActor`, FR-12).
 */
export interface Actor {
  id: string;
  role: UserRole;
}
