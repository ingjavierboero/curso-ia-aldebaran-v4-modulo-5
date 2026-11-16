import type { Email } from '../shared/Email.js';
import type { Cuit } from './Cuit.js';
import { InvalidClientData } from './errors.js';
import type { IvaCondition } from './IvaCondition.js';

export const CLIENT_STATUSES = ['activo', 'inactivo'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** Los datos que un Admin o Editor da de alta o modifica de un cliente (FR-01, FR-02). */
export interface ClientData {
  businessName: string;
  cuit: Cuit;
  address: string;
  billingEmail: Email;
  ivaCondition: IvaCondition;
}

export interface ClientProps extends ClientData {
  id: string;
  status: ClientStatus;
  createdAt: Date;
}

/**
 * Cliente: entidad inmutable. El constructor rehidrata sin validar (lo usa el repositorio);
 * `create` y `withData` validan razón social y domicilio.
 */
export class Client {
  readonly id: string;
  readonly businessName: string;
  readonly cuit: Cuit;
  readonly address: string;
  readonly billingEmail: Email;
  readonly ivaCondition: IvaCondition;
  readonly status: ClientStatus;
  readonly createdAt: Date;

  constructor(props: ClientProps) {
    this.id = props.id;
    this.businessName = props.businessName;
    this.cuit = props.cuit;
    this.address = props.address;
    this.billingEmail = props.billingEmail;
    this.ivaCondition = props.ivaCondition;
    this.status = props.status;
    // Copia defensiva: la entidad no comparte la Date con quien la creó.
    this.createdAt = new Date(props.createdAt.getTime());
  }

  /** Alta (FR-01): el cliente queda Activo con su fecha de alta. */
  static create(input: ClientData & { id: string; createdAt: Date }): Client {
    return new Client({
      id: input.id,
      ...validated(input),
      status: 'activo',
      createdAt: input.createdAt,
    });
  }

  isActive(): boolean {
    return this.status === 'activo';
  }

  /** Un cliente nuevo con los datos cambiados (FR-02); id, estado y fecha de alta no cambian. */
  withData(data: ClientData): Client {
    return new Client({ ...this.toProps(), ...validated(data) });
  }

  /** Baja (FR-03): Inactivo. Idempotente: si ya estaba Inactivo devuelve el mismo cliente. */
  deactivated(): Client {
    if (this.status === 'inactivo') return this;
    return new Client({ ...this.toProps(), status: 'inactivo' });
  }

  /** Reactivación (FR-03): Activo. Idempotente: si ya estaba Activo devuelve el mismo cliente. */
  reactivated(): Client {
    if (this.status === 'activo') return this;
    return new Client({ ...this.toProps(), status: 'activo' });
  }

  private toProps(): ClientProps {
    return {
      id: this.id,
      businessName: this.businessName,
      cuit: this.cuit,
      address: this.address,
      billingEmail: this.billingEmail,
      ivaCondition: this.ivaCondition,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}

function validated(data: ClientData): ClientData {
  return {
    businessName: parseBusinessName(data.businessName),
    cuit: data.cuit,
    address: parseAddress(data.address),
    billingEmail: data.billingEmail,
    ivaCondition: data.ivaCondition,
  };
}

export const CLIENT_BUSINESS_NAME_MAX_LENGTH = 200;
export const CLIENT_ADDRESS_MAX_LENGTH = 200;

function parseBoundedText(raw: string, max: number, message: string): string {
  if (typeof raw !== 'string') throw new InvalidClientData(message);
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > max) throw new InvalidClientData(message);
  return trimmed;
}

/** Razón social: trim, de 1 a 200 caracteres (S-01); si no, `InvalidClientData`. */
export function parseBusinessName(raw: string): string {
  return parseBoundedText(
    raw,
    CLIENT_BUSINESS_NAME_MAX_LENGTH,
    'La razón social debe tener entre 1 y 200 caracteres',
  );
}

/** Domicilio: trim, de 1 a 200 caracteres (S-01); si no, `InvalidClientData`. */
export function parseAddress(raw: string): string {
  return parseBoundedText(raw, CLIENT_ADDRESS_MAX_LENGTH, 'El domicilio debe tener entre 1 y 200 caracteres');
}
