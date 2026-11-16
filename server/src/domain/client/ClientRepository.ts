import type { Email } from '../shared/Email.js';
import type { Client } from './Client.js';
import type { Cuit } from './Cuit.js';

/** Puerto síncrono (ADR-003): nada de Promises, para poder usarse dentro de una UnitOfWork. */
export interface ClientRepository {
  /**
   * Lanza `DuplicateCuit` si el CUIT ya es de otro cliente y `DuplicateBillingEmail` si el email de
   * facturación ya es de otro cliente (UNIQUE, NFR-01). Si chocan los dos a la vez, gana
   * `DuplicateBillingEmail`.
   */
  insert(client: Client): void;
  /** Guarda todos los datos y el estado del cliente con ese id. Mismos errores de unicidad que `insert`. */
  update(client: Client): void;
  findById(id: string): Client | null;
  findByCuit(cuit: Cuit): Client | null;
  /** Sin distinguir mayúsculas: el `Email` ya viene normalizado (FR-07). */
  findByBillingEmail(email: Email): Client | null;
  /**
   * Todos los clientes, Activos e Inactivos, en orden binario por razón social y después por id. No es
   * el orden visible de FR-16: ese lo aplica la capa de aplicación con la colación en español
   * (`application/shared/spanishOrder.ts`).
   */
  list(): Client[];
}
