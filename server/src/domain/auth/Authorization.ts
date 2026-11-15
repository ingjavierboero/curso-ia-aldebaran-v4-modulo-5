import type { UserRole } from '../user/User.js';
import { Forbidden } from './errors.js';

/** Acciones sujetas a permiso. Crece con cada módulo (clientes, facturación, pagos…). */
export type Action = 'users.read' | 'users.manage';

/**
 * Perfil → acciones permitidas (FR-11). Lo que no figura acá está prohibido (deny-by-default).
 * No se exporta y está congelada (la tabla y cada lista): nadie puede ampliar un permiso en tiempo de
 * ejecución. Se consulta solo con `can`/`assertCan`.
 */
const PERMISSIONS: Readonly<Record<UserRole, readonly Action[]>> = Object.freeze({
  admin: Object.freeze<Action[]>(['users.read', 'users.manage']),
  editor: Object.freeze<Action[]>([]),
  consulta: Object.freeze<Action[]>([]),
});

export function can(role: UserRole, action: Action): boolean {
  // Un perfil desconocido en tiempo de ejecución (dato corrupto) no tiene ningún permiso.
  if (!Object.hasOwn(PERMISSIONS, role)) return false;
  return PERMISSIONS[role].includes(action);
}

/** Lanza `Forbidden` si el perfil no permite la acción. */
export function assertCan(role: UserRole, action: Action): void {
  if (!can(role, action)) throw new Forbidden();
}
