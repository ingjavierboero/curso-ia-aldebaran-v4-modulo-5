import type { UserRole } from '../user/User.js';
import { Forbidden } from './errors.js';

/** Acciones sujetas a permiso. Crece con cada módulo (clientes, facturación, pagos…). */
export type Action = 'users.read' | 'users.manage';

/** Perfil → acciones permitidas (FR-11). Lo que no figura acá está prohibido (deny-by-default). */
export const PERMISSIONS: Record<UserRole, ReadonlySet<Action>> = {
  admin: new Set<Action>(['users.read', 'users.manage']),
  editor: new Set<Action>(),
  consulta: new Set<Action>(),
};

export function can(role: UserRole, action: Action): boolean {
  // Un perfil desconocido en tiempo de ejecución (dato corrupto) no tiene ningún permiso.
  if (!Object.hasOwn(PERMISSIONS, role)) return false;
  return PERMISSIONS[role].has(action);
}

/** Lanza `Forbidden` si el perfil no permite la acción. */
export function assertCan(role: UserRole, action: Action): void {
  if (!can(role, action)) throw new Forbidden();
}
