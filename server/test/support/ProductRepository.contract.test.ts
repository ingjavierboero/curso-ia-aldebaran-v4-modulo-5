import { afterEach, describe, expect, it } from 'vitest';
import { DuplicateProductName } from '../../src/domain/product/errors.js';
import { Price } from '../../src/domain/product/Price.js';
import { Product } from '../../src/domain/product/Product.js';
import type { ProductRepository } from '../../src/domain/product/ProductRepository.js';
import { DrizzleProductRepository } from '../../src/infrastructure/db/DrizzleProductRepository.js';
import { InvalidStoredValue } from '../../src/infrastructure/db/storedValue.js';
import { InMemoryProductRepository } from './InMemoryProductRepository.js';
import { createTestDb, type TestDb } from './sqliteTestDb.js';

const T0 = new Date('2026-11-16T12:00:00.000Z');

function makeProduct(id: string, name: string, price: string, currency: 'ARS' | 'USD' = 'ARS'): Product {
  return Product.create({ id, name, price: Price.parse(price, currency), createdAt: T0 });
}

const opened: TestDb[] = [];

const implementations: [string, () => ProductRepository][] = [
  ['InMemoryProductRepository', () => new InMemoryProductRepository()],
  [
    'DrizzleProductRepository',
    () => {
      const t = createTestDb();
      opened.push(t);
      return new DrizzleProductRepository(t.db);
    },
  ],
];

// El doble en memoria y el repositorio real cumplen el mismo contrato del puerto.
describe.each(implementations)('contrato ProductRepository — %s', (_name, create) => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('test_product_repo_contrato_insert_find_list', () => {
    const repo = create();
    expect(repo.list()).toEqual([]);

    repo.insert(makeProduct('p-1', 'Sistema de Turnos', '15000.5'));
    repo.insert(makeProduct('p-2', 'Agenda Web', '999999999.99', 'USD'));
    repo.insert(makeProduct('p-3', 'Facturador', '0.01').deactivated());

    const found = repo.findById('p-1');
    expect(found?.name).toBe('Sistema de Turnos');
    expect(found?.nameNormalized).toBe('sistema de turnos');
    // el precio vuelve igual, en centavos enteros
    expect(found?.price.cents).toBe(1_500_050);
    expect(found?.price.currency).toBe('ARS');
    expect(found?.price.toDecimalString()).toBe('15000.50');
    expect(found?.status).toBe('activo');
    expect(found?.createdAt.toISOString()).toBe(T0.toISOString());
    expect(repo.findById('p-2')?.price.cents).toBe(99_999_999_999);
    expect(repo.findById('p-2')?.price.currency).toBe('USD');
    expect(repo.findById('p-3')?.price.cents).toBe(1);
    expect(repo.findById('p-3')?.status).toBe('inactivo');
    expect(repo.findById('no-existe')).toBeNull();

    expect(repo.findByNameNormalized('sistema de turnos')?.id).toBe('p-1');
    expect(repo.findByNameNormalized('otro')).toBeNull();

    // Activos e Inactivos, ordenados por nombre
    expect(repo.list().map((p) => p.id)).toEqual(['p-2', 'p-3', 'p-1']);

    // findByIds: ordenados por nombre, sin los inexistentes ni repetidos; [] → []
    expect(repo.findByIds(['p-1', 'no-existe', 'p-2', 'p-1']).map((p) => p.id)).toEqual(['p-2', 'p-1']);
    expect(repo.findByIds([])).toEqual([]);
    expect(repo.findByIds(['no-existe'])).toEqual([]);

    // update guarda nombre, precio, moneda y estado
    const current = repo.findById('p-1') as Product;
    repo.update(current.withData({ name: 'Turnos Pro', price: Price.parse('20', 'USD') }).deactivated());
    const updated = repo.findById('p-1');
    expect(updated?.name).toBe('Turnos Pro');
    expect(updated?.nameNormalized).toBe('turnos pro');
    expect(updated?.price.cents).toBe(2000);
    expect(updated?.price.currency).toBe('USD');
    expect(updated?.status).toBe('inactivo');
    expect(repo.findByNameNormalized('sistema de turnos')).toBeNull();
    expect(repo.findByNameNormalized('turnos pro')?.id).toBe('p-1');
  });

  it('test_product_repo_nombre_duplicado_rechazado', () => {
    const repo = create();
    repo.insert(makeProduct('p-1', 'Sistema de Turnos', '100'));
    repo.insert(makeProduct('p-2', 'Agenda Web', '200'));

    // insert directo con el mismo nombre normalizado, sin control previo
    expect(() => {
      repo.insert(makeProduct('p-3', 'sistema de turnos', '300'));
    }).toThrow(DuplicateProductName);
    expect(repo.findById('p-3')).toBeNull();

    const agenda = repo.findById('p-2') as Product;
    expect(() => {
      repo.update(agenda.withData({ name: 'SISTEMA DE TURNOS', price: agenda.price }));
    }).toThrow(DuplicateProductName);
    expect(repo.findById('p-2')?.name).toBe('Agenda Web');

    // cambiar solo mayúsculas del propio nombre no es duplicado
    repo.update(agenda.withData({ name: 'agenda web', price: agenda.price }));
    expect(repo.findById('p-2')?.name).toBe('agenda web');
    expect(repo.list()).toHaveLength(2);
  });

  it('un id repetido no se informa como nombre duplicado', () => {
    const repo = create();
    repo.insert(makeProduct('p-1', 'Sistema de Turnos', '100'));

    let thrown: unknown;
    try {
      repo.insert(makeProduct('p-1', 'Agenda Web', '200'));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DuplicateProductName);
    expect(repo.findById('p-1')?.name).toBe('Sistema de Turnos');
  });
});

describe('DrizzleProductRepository — filas corruptas', () => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  const insertRaw = (t: TestDb, name: string, nameNormalized: string, priceCents: number) =>
    t.db.$client
      .prepare(
        "INSERT INTO products (id, name, name_normalized, price_cents, currency, status, created_at) VALUES ('p-x', ?, ?, ?, 'ARS', 'activo', '2026-11-16T00:00:00.000Z')",
      )
      .run(name, nameNormalized, priceCents);

  function expectStoredError(fn: () => unknown, field: string, value: string): void {
    let thrown: unknown;
    try {
      fn();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(InvalidStoredValue);
    const error = thrown as InvalidStoredValue;
    expect(error.name).toBe('InvalidStoredValue');
    expect(error.message).toContain(field);
    // no expone el dato guardado
    expect(error.message).not.toContain(value);
  }

  it('un precio guardado fuera de rango (el CHECK solo exige > 0) es un error de infraestructura', () => {
    const t = createTestDb();
    opened.push(t);
    insertRaw(t, 'Turnos', 'turnos', 100_000_000_000);
    const repo = new DrizzleProductRepository(t.db);

    expectStoredError(() => repo.findById('p-x'), 'products.price_cents', '100000000000');
    expectStoredError(() => repo.list(), 'products.price_cents', '100000000000');
  });

  it('un name_normalized que no coincide con el nombre es un error de infraestructura', () => {
    const t = createTestDb();
    opened.push(t);
    insertRaw(t, 'Sistema de Turnos', 'otra-cosa', 100);
    const repo = new DrizzleProductRepository(t.db);

    expectStoredError(() => repo.findById('p-x'), 'products.name_normalized', 'otra-cosa');
    expectStoredError(() => repo.findByIds(['p-x']), 'products.name_normalized', 'otra-cosa');
  });
});
