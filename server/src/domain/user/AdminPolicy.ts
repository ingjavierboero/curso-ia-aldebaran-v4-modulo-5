import { LastActiveAdmin } from './errors.js';
import type { User } from './User.js';

/**
 * El sistema nunca queda sin un Admin Activo (FR-09). Si `before` es Admin Activo, `after` deja de
 * serlo (baja o cambio de perfil) y `activeAdmins` (contado dentro de la misma transacción, NFR-02)
 * es 1 o menos, lanza `LastActiveAdmin`.
 */
export function assertKeepsAnActiveAdmin(before: User, after: User, activeAdmins: number): void {
  if (before.isActiveAdmin() && !after.isActiveAdmin() && activeAdmins <= 1) {
    throw new LastActiveAdmin();
  }
}
