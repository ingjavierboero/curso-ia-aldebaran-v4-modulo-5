import type { Email } from '../shared/Email.js';
import { InvalidName, InvalidRole } from './errors.js';

export const USER_ROLES = ['admin', 'editor', 'consulta'] as const;
export const USER_STATUSES = ['activo', 'inactivo'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserProps {
  id: string;
  name: string;
  email: Email;
  role: UserRole;
  status: UserStatus;
  passwordHash: string;
  createdAt: Date;
}

/** Los datos que un Admin puede modificar de un usuario (FR-05, FR-06), ya validados. */
export interface UserProfile {
  name: string;
  email: Email;
  role: UserRole;
}

export class User {
  readonly id: string;
  readonly name: string;
  readonly email: Email;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly passwordHash: string;
  readonly createdAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.role = props.role;
    this.status = props.status;
    this.passwordHash = props.passwordHash;
    // Copia defensiva: la entidad no comparte la Date con quien la creó.
    this.createdAt = new Date(props.createdAt.getTime());
  }

  isActive(): boolean {
    return this.status === 'activo';
  }

  isActiveAdmin(): boolean {
    return this.isActive() && this.role === 'admin';
  }

  /** Un usuario nuevo con nombre, email y perfil cambiados; el original no cambia. */
  withProfile(profile: UserProfile): User {
    return new User({ ...this.toProps(), name: profile.name, email: profile.email, role: profile.role });
  }

  /** Un usuario nuevo con otro hash de contraseña (FEAT-007); el original no cambia. */
  withPasswordHash(passwordHash: string): User {
    return new User({ ...this.toProps(), passwordHash });
  }

  /** Un usuario nuevo en estado Inactivo (FR-07). */
  deactivated(): User {
    return new User({ ...this.toProps(), status: 'inactivo' });
  }

  /** Un usuario nuevo en estado Activo (FR-08). */
  reactivated(): User {
    return new User({ ...this.toProps(), status: 'activo' });
  }

  private toProps(): UserProps {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      status: this.status,
      passwordHash: this.passwordHash,
      createdAt: this.createdAt,
    };
  }
}

export const USER_NAME_MAX_LENGTH = 100;

/** Nombre de usuario: trim, de 1 a 100 caracteres; si no, `InvalidName`. */
export function parseUserName(raw: string): string {
  if (typeof raw !== 'string') throw new InvalidName();
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > USER_NAME_MAX_LENGTH) throw new InvalidName();
  return trimmed;
}

function isUserRole(raw: string): raw is UserRole {
  return (USER_ROLES as readonly string[]).includes(raw);
}

/** Perfil: exactamente uno de `USER_ROLES` (sin normalizar); si no, `InvalidRole`. */
export function parseUserRole(raw: string): UserRole {
  if (typeof raw !== 'string' || !isUserRole(raw)) throw new InvalidRole();
  return raw;
}
