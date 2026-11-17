import { asc, eq } from 'drizzle-orm';
import { Client } from '../../domain/client/Client.js';
import type { ClientRepository } from '../../domain/client/ClientRepository.js';
import { Cuit } from '../../domain/client/Cuit.js';
import { DuplicateBillingEmail, DuplicateCuit } from '../../domain/client/errors.js';
import { IvaCondition } from '../../domain/shared/IvaCondition.js';
import { Email } from '../../domain/shared/Email.js';
import type { SqliteHandle } from './handle.js';
import { parseIsoDate } from './parseIsoDate.js';
import { clients } from './schema.js';
import { isConstraintViolation } from './sqliteConstraint.js';
import { rehydrate } from './storedValue.js';

type ClientRow = typeof clients.$inferSelect;

/**
 * `ClientRepository` síncrono sobre SQLite (ADR-003). CUIT y email de facturación se guardan ya
 * normalizados por el dominio; la condición frente al IVA, como su código de ARCA.
 */
export class DrizzleClientRepository implements ClientRepository {
  constructor(private readonly db: SqliteHandle) {}

  insert(client: Client): void {
    translatingUniqueViolations(() => {
      this.db.insert(clients).values(toRow(client)).run();
    });
  }

  update(client: Client): void {
    const { id: _id, createdAt: _createdAt, ...changes } = toRow(client);
    translatingUniqueViolations(() => {
      this.db.update(clients).set(changes).where(eq(clients.id, client.id)).run();
    });
  }

  findById(id: string): Client | null {
    const row = this.db.select().from(clients).where(eq(clients.id, id)).get();
    return row ? toEntity(row) : null;
  }

  findByCuit(cuit: Cuit): Client | null {
    const row = this.db.select().from(clients).where(eq(clients.cuit, cuit.value)).get();
    return row ? toEntity(row) : null;
  }

  findByBillingEmail(email: Email): Client | null {
    const row = this.db.select().from(clients).where(eq(clients.billingEmail, email.value)).get();
    return row ? toEntity(row) : null;
  }

  list(): Client[] {
    return this.db.select().from(clients).orderBy(asc(clients.businessName), asc(clients.id)).all().map(toEntity);
  }
}

function toRow(client: Client): ClientRow {
  return {
    id: client.id,
    businessName: client.businessName,
    cuit: client.cuit.value,
    address: client.address,
    billingEmail: client.billingEmail.value,
    ivaCondition: client.ivaCondition.code,
    status: client.status,
    createdAt: client.createdAt.toISOString(),
  };
}

/** Un valor guardado que el dominio rechaza es un dato corrupto: `InvalidStoredValue`. */
function toEntity(row: ClientRow): Client {
  return new Client({
    id: row.id,
    businessName: row.businessName,
    cuit: rehydrate('clients.cuit', () => Cuit.parse(row.cuit)),
    address: row.address,
    billingEmail: rehydrate('clients.billing_email', () => Email.create(row.billingEmail)),
    ivaCondition: rehydrate('clients.iva_condition', () => IvaCondition.of(row.ivaCondition)),
    status: row.status,
    createdAt: parseIsoDate(row.createdAt, 'clients.created_at'),
  });
}

/** Mensajes exactos de SQLite para los UNIQUE de `clients.cuit` y `clients.billing_email`. */
const UNIQUE_CUIT_MESSAGE = /^UNIQUE constraint failed: clients\.cuit$/;
const UNIQUE_BILLING_EMAIL_MESSAGE = /^UNIQUE constraint failed: clients\.billing_email$/;

function translatingUniqueViolations(write: () => void): void {
  try {
    write();
  } catch (err) {
    if (isConstraintViolation(err, 'SQLITE_CONSTRAINT_UNIQUE', UNIQUE_CUIT_MESSAGE)) throw new DuplicateCuit();
    if (isConstraintViolation(err, 'SQLITE_CONSTRAINT_UNIQUE', UNIQUE_BILLING_EMAIL_MESSAGE)) {
      throw new DuplicateBillingEmail();
    }
    throw err;
  }
}
