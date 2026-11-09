import type { Email } from './Email.js';
import { InvalidName } from './errors.js';

export type UserRole = 'admin' | 'editor' | 'consulta';
export type UserStatus = 'activo' | 'inactivo';

export interface UserProps {
  id: string;
  name: string;
  email: Email;
  role: UserRole;
  status: UserStatus;
  passwordHash: string;
  createdAt: Date;
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
}

export const USER_NAME_MAX_LENGTH = 100;

/** Nombre de usuario: trim, de 1 a 100 caracteres; si no, `InvalidName`. */
export function parseUserName(raw: string): string {
  if (typeof raw !== 'string') throw new InvalidName();
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > USER_NAME_MAX_LENGTH) throw new InvalidName();
  return trimmed;
}
