import type { Email } from './Email.js';
import type { User } from './User.js';

/** Puerto síncrono (ADR-003): nada de Promises, para poder usarse dentro de una UnitOfWork. */
export interface UserRepository {
  countAll(): number;
  /** Cantidad de usuarios con perfil Admin y estado Activo (FR-09). */
  countActiveAdmins(): number;
  findByEmail(email: Email): User | null;
  findById(id: string): User | null;
  /** Todos los usuarios, Activos e Inactivos, ordenados por nombre. */
  listAll(): User[];
  /** Lanza `EmailAlreadyInUse` si el email ya es de otro usuario (UNIQUE de email). */
  insert(user: User): void;
  /**
   * Guarda nombre, email, perfil y estado del usuario con ese id. Lanza `EmailAlreadyInUse` si el
   * email ya es de otro usuario (UNIQUE de email).
   */
  update(user: User): void;
  /** Guarda solo el hash de contraseña del usuario con ese id (FEAT-007); `update` no lo toca. */
  updatePasswordHash(user: User): void;
}
