import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '../../../src/domain/client/Client.js';
import type { ClientProductRepository } from '../../../src/domain/client/ClientProductRepository.js';
import { Cuit } from '../../../src/domain/client/Cuit.js';
import { ProductAlreadyAssigned } from '../../../src/domain/client/errors.js';
import { IvaCondition } from '../../../src/domain/shared/IvaCondition.js';
import { Price } from '../../../src/domain/product/Price.js';
import { Product } from '../../../src/domain/product/Product.js';
import { Email } from '../../../src/domain/shared/Email.js';
import { DrizzleClientProductRepository } from '../../../src/infrastructure/db/DrizzleClientProductRepository.js';
import { DrizzleClientRepository } from '../../../src/infrastructure/db/DrizzleClientRepository.js';
import { DrizzleProductRepository } from '../../../src/infrastructure/db/DrizzleProductRepository.js';
import { InMemoryClientProductRepository } from '../../support/InMemoryClientProductRepository.js';
import { createTestDb, type TestDb } from '../../support/sqliteTestDb.js';

const T0 = new Date('2026-11-16T12:00:00.000Z');
const T1 = new Date('2026-11-16T13:00:00.000Z');

const CUITS = ['30711111111', '20123456786'];

function makeClient(id: string, n: number): Client {
  return Client.create({
    id,
    businessName: `Cliente ${String(n)}`,
    cuit: Cuit.parse(CUITS[n] as string),
    address: 'Calle 1',
    billingEmail: Email.create(`c${String(n)}@empresa.com`),
    ivaCondition: IvaCondition.of(1),
    createdAt: T0,
  });
}

function makeProduct(id: string): Product {
  return Product.create({ id, name: `Producto ${id}`, price: Price.parse('100', 'ARS'), createdAt: T0 });
}

interface Fixture {
  repo: ClientProductRepository;
  /** Crea clientes y productos para que las FK de la versión Drizzle los acepten (en memoria no hace nada). */
  seed: (clientIds: string[], productIds: string[]) => void;
}

const opened: TestDb[] = [];

function drizzleFixture(): Fixture & { t: TestDb } {
  const t = createTestDb();
  opened.push(t);
  const clients = new DrizzleClientRepository(t.db);
  const products = new DrizzleProductRepository(t.db);
  return {
    t,
    repo: new DrizzleClientProductRepository(t.db),
    seed: (clientIds, productIds) => {
      clientIds.forEach((id, n) => {
        clients.insert(makeClient(id, n));
      });
      for (const id of productIds) products.insert(makeProduct(id));
    },
  };
}

const implementations: [string, () => Fixture][] = [
  ['InMemoryClientProductRepository', () => ({ repo: new InMemoryClientProductRepository(), seed: () => {} })],
  ['DrizzleClientProductRepository', drizzleFixture],
];

// El doble en memoria y el repositorio real cumplen el mismo contrato del puerto.
describe.each(implementations)('contrato ClientProductRepository — %s', (_name, create) => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('test_client_product_repo_assign_unassign_list', () => {
    const { repo, seed } = create();
    seed(['c-1', 'c-2'], ['p-1', 'p-2', 'p-3']);
    expect(repo.listProductIdsOf('c-1')).toEqual([]);

    repo.assign('c-1', 'p-2', T0);
    repo.assign('c-1', 'p-1', T1);
    repo.assign('c-2', 'p-1', T0);

    // ordenados por id de producto, no por orden de asignación
    expect(repo.listProductIdsOf('c-1')).toEqual(['p-1', 'p-2']);
    expect(repo.listProductIdsOf('c-2')).toEqual(['p-1']);
    expect(repo.isAssigned('c-1', 'p-2')).toBe(true);
    expect(repo.isAssigned('c-1', 'p-3')).toBe(false);
    expect(repo.isAssigned('c-2', 'p-2')).toBe(false);

    // desasignar quita solo esa asignación
    expect(repo.unassign('c-1', 'p-2')).toBe(true);
    expect(repo.isAssigned('c-1', 'p-2')).toBe(false);
    expect(repo.listProductIdsOf('c-1')).toEqual(['p-1']);
    expect(repo.listProductIdsOf('c-2')).toEqual(['p-1']);

    // desasignar algo no asignado devuelve false y no cambia nada
    expect(repo.unassign('c-1', 'p-2')).toBe(false);
    expect(repo.unassign('c-2', 'p-3')).toBe(false);
    expect(repo.listProductIdsOf('c-1')).toEqual(['p-1']);

    // se puede volver a asignar después de desasignar
    repo.assign('c-1', 'p-2', T1);
    expect(repo.isAssigned('c-1', 'p-2')).toBe(true);
  });

  it('test_client_product_repo_asignacion_duplicada_rechazada', () => {
    const { repo, seed } = create();
    seed(['c-1', 'c-2'], ['p-1']);
    repo.assign('c-1', 'p-1', T0);

    expect(() => {
      repo.assign('c-1', 'p-1', T1);
    }).toThrow(ProductAlreadyAssigned);
    expect(repo.listProductIdsOf('c-1')).toEqual(['p-1']);

    // el mismo producto a otro cliente no es duplicado
    repo.assign('c-2', 'p-1', T0);
    expect(repo.listProductIdsOf('c-2')).toEqual(['p-1']);
  });
});

describe('DrizzleClientProductRepository', () => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('rechaza por FK una asignación a un cliente o producto inexistente', () => {
    const { t, repo, seed } = drizzleFixture();
    seed(['c-1'], ['p-1']);

    for (const [clientId, productId] of [
      ['no-existe', 'p-1'],
      ['c-1', 'no-existe'],
    ] as const) {
      let thrown: unknown;
      try {
        repo.assign(clientId, productId, T0);
      } catch (err) {
        thrown = err;
      }
      // otra restricción: no se informa como asignación duplicada
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(ProductAlreadyAssigned);
      expect((thrown as Error).message).toMatch(/FOREIGN KEY/);
    }
    expect(t.db.$client.prepare('SELECT COUNT(*) AS n FROM client_products').get()).toEqual({ n: 0 });
  });

  it('guarda la fecha de la asignación en ISO 8601', () => {
    const { t, repo, seed } = drizzleFixture();
    seed(['c-1'], ['p-1']);

    repo.assign('c-1', 'p-1', T1);

    expect(t.db.$client.prepare('SELECT created_at FROM client_products').get()).toEqual({
      created_at: T1.toISOString(),
    });
  });
});
