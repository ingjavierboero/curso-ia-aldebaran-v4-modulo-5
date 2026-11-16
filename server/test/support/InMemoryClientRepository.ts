import type { Client } from '../../src/domain/client/Client.js';
import type { ClientRepository } from '../../src/domain/client/ClientRepository.js';
import type { Cuit } from '../../src/domain/client/Cuit.js';
import { DuplicateBillingEmail, DuplicateCuit } from '../../src/domain/client/errors.js';
import type { Email } from '../../src/domain/shared/Email.js';

/** Comparación binaria, como el orden por defecto de SQLite (`ORDER BY business_name, id`). */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Doble en memoria con las mismas reglas de unicidad que los UNIQUE de `clients`. */
export class InMemoryClientRepository implements ClientRepository {
  private readonly rows = new Map<string, Client>();

  insert(client: Client): void {
    if (this.rows.has(client.id)) throw new Error(`UNIQUE clients.id: ${client.id}`);
    this.assertUnique(client);
    this.rows.set(client.id, client);
  }

  /** Igual que un UPDATE por id: si no existe, no hace nada. */
  update(client: Client): void {
    if (!this.rows.has(client.id)) return;
    this.assertUnique(client);
    this.rows.set(client.id, client);
  }

  findById(id: string): Client | null {
    return this.rows.get(id) ?? null;
  }

  findByCuit(cuit: Cuit): Client | null {
    for (const client of this.rows.values()) {
      if (client.cuit.equals(cuit)) return client;
    }
    return null;
  }

  findByBillingEmail(email: Email): Client | null {
    for (const client of this.rows.values()) {
      if (client.billingEmail.equals(email)) return client;
    }
    return null;
  }

  list(): Client[] {
    return [...this.rows.values()].sort(
      (a, b) => compareText(a.businessName, b.businessName) || compareText(a.id, b.id),
    );
  }

  /** Foto del contenido, para que `InMemoryUnitOfWork` pueda hacer rollback. */
  snapshot(): Map<string, Client> {
    return new Map(this.rows);
  }

  restore(snapshot: Map<string, Client>): void {
    this.rows.clear();
    for (const [id, client] of snapshot) this.rows.set(id, client);
  }

  /**
   * Mismo resultado que SQLite con la migración 0003 cuando chocan los dos UNIQUE a la vez: informa
   * `billing_email` (el último índice creado). Por eso el email se chequea primero.
   */
  private assertUnique(client: Client): void {
    const emailOwner = this.findByBillingEmail(client.billingEmail);
    if (emailOwner && emailOwner.id !== client.id) throw new DuplicateBillingEmail();
    const cuitOwner = this.findByCuit(client.cuit);
    if (cuitOwner && cuitOwner.id !== client.id) throw new DuplicateCuit();
  }
}
