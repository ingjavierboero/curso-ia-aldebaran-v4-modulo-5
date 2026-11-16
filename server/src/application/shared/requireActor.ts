import { type Action, assertCan } from '../../domain/auth/Authorization.js';
import { Forbidden } from '../../domain/auth/errors.js';
import type { User } from '../../domain/user/User.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { Actor } from './Actor.js';

/**
 * Se llama dentro de `uow.run`, antes de tocar nada: vuelve a leer al actor y exige que exista, esté
 * Activo y que su perfil ACTUAL permita la acción. Así un Admin degradado o dado de baja entre el
 * chequeo inicial y la transacción (por ejemplo, durante el hash del alta) no la completa (FR-12).
 * Compartido por los casos de uso de escritura de todos los módulos (usuarios, clientes, productos).
 */
export function requireActor(users: UserRepository, actor: Actor, action: Action): User {
  const current = users.findById(actor.id);
  if (!current || !current.isActive()) throw new Forbidden();
  assertCan(current.role, action);
  return current;
}
