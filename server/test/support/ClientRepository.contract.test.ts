import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '../../src/domain/client/Client.js';
import type { ClientRepository } from '../../src/domain/client/ClientRepository.js';
import { Cuit } from '../../src/domain/client/Cuit.js';
import { DuplicateBillingEmail, DuplicateCuit } from '../../src/domain/client/errors.js';
import { IvaCondition } from '../../src/domain/shared/IvaCondition.js';
import { Email } from '../../src/domain/shared/Email.js';
import { DrizzleClientRepository } from '../../src/infrastructure/db/DrizzleClientRepository.js';
import { InvalidStoredValue } from '../../src/infrastructure/db/storedValue.js';
import { InMemoryClientRepository } from './InMemoryClientRepository.js';
import { createTestDb, type TestDb } from './sqliteTestDb.js';

const T0 = new Date('2026-11-16T12:00:00.000Z');

// CUIT válidos (prefijo admitido y dígito verificador correcto)
const CUIT_A = '30711111111';
const CUIT_B = '20123456786';
const CUIT_C = '27333333339';

function makeClient(id: string, businessName: string, cuit: string, email: string, iva = 1): Client {
  return Client.create({
    id,
    businessName,
    cuit: Cuit.parse(cuit),
    address: 'Av. Siempre Viva 742',
    billingEmail: Email.create(email),
    ivaCondition: IvaCondition.of(iva),
    createdAt: T0,
  });
}

const opened: TestDb[] = [];

const implementations: [string, () => ClientRepository][] = [
  ['InMemoryClientRepository', () => new InMemoryClientRepository()],
  [
    'DrizzleClientRepository',
    () => {
      const t = createTestDb();
      opened.push(t);
      return new DrizzleClientRepository(t.db);
    },
  ],
];

// El doble en memoria y el repositorio real cumplen el mismo contrato del puerto.
describe.each(implementations)('contrato ClientRepository — %s', (_name, create) => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('test_client_repo_contrato_insert_find_list', () => {
    const repo = create();
    expect(repo.list()).toEqual([]);

    repo.insert(makeClient('c-2', 'Zeta SA', CUIT_A, 'pagos@zeta.com', 6));
    repo.insert(makeClient('c-1', 'Los Andes SRL', CUIT_B, 'pagos@losandes.com', 1));
    repo.insert(makeClient('c-3', 'Beta SA', CUIT_C, 'pagos@beta.com', 16).deactivated());

    const found = repo.findById('c-1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('c-1');
    expect(found?.businessName).toBe('Los Andes SRL');
    expect(found?.cuit.value).toBe(CUIT_B);
    expect(found?.address).toBe('Av. Siempre Viva 742');
    expect(found?.billingEmail.value).toBe('pagos@losandes.com');
    expect(found?.ivaCondition.code).toBe(1);
    expect(found?.ivaCondition.name).toBe('IVA Responsable Inscripto');
    expect(found?.status).toBe('activo');
    expect(found?.createdAt.toISOString()).toBe(T0.toISOString());
    expect(repo.findById('no-existe')).toBeNull();

    expect(repo.findByCuit(Cuit.parse('30-71111111-1'))?.id).toBe('c-2');
    expect(repo.findByCuit(Cuit.parse('30700000008'))).toBeNull();
    // el email ya viene normalizado: no distingue mayúsculas
    expect(repo.findByBillingEmail(Email.create('Pagos@LosAndes.com'))?.id).toBe('c-1');
    expect(repo.findByBillingEmail(Email.create('otro@losandes.com'))).toBeNull();

    // Activos e Inactivos, ordenados por razón social
    const listed = repo.list();
    expect(listed.map((c) => c.id)).toEqual(['c-3', 'c-1', 'c-2']);
    expect(listed[0]?.status).toBe('inactivo');
    expect(listed[0]?.ivaCondition.code).toBe(16);

    // update guarda los datos y el estado
    const current = repo.findById('c-1') as Client;
    repo.update(
      current
        .withData({
          businessName: 'Andes Nuevos SRL',
          cuit: current.cuit,
          address: 'Calle Nueva 1',
          billingEmail: Email.create('cobros@andes.com'),
          ivaCondition: IvaCondition.of(5),
        })
        .deactivated(),
    );
    const updated = repo.findById('c-1');
    expect(updated?.businessName).toBe('Andes Nuevos SRL');
    expect(updated?.address).toBe('Calle Nueva 1');
    expect(updated?.billingEmail.value).toBe('cobros@andes.com');
    expect(updated?.ivaCondition.code).toBe(5);
    expect(updated?.status).toBe('inactivo');
    expect(updated?.createdAt.toISOString()).toBe(T0.toISOString());
    expect(repo.findByBillingEmail(Email.create('pagos@losandes.com'))).toBeNull();
  });

  it('test_client_repo_cuit_duplicado_rechazado', () => {
    const repo = create();
    repo.insert(makeClient('c-1', 'Los Andes SRL', CUIT_A, 'pagos@losandes.com'));
    repo.insert(makeClient('c-2', 'Zeta SA', CUIT_B, 'pagos@zeta.com'));

    // insert directo con el mismo CUIT, sin control previo: lo frena la restricción
    expect(() => {
      repo.insert(makeClient('c-3', 'Otra SA', CUIT_A, 'otra@otra.com'));
    }).toThrow(DuplicateCuit);
    expect(repo.findById('c-3')).toBeNull();

    // update que toma el CUIT de otro cliente
    const zeta = repo.findById('c-2') as Client;
    expect(() => {
      repo.update(new Client({ ...propsOf(zeta), cuit: Cuit.parse(CUIT_A) }));
    }).toThrow(DuplicateCuit);
    expect(repo.findById('c-2')?.cuit.value).toBe(CUIT_B);
    expect(repo.list().map((c) => c.id)).toEqual(['c-1', 'c-2']);
  });

  it('test_client_repo_email_duplicado_rechazado', () => {
    const repo = create();
    repo.insert(makeClient('c-1', 'Los Andes SRL', CUIT_A, 'pagos@losandes.com'));
    repo.insert(makeClient('c-2', 'Zeta SA', CUIT_B, 'pagos@zeta.com'));

    // el email llega normalizado por el dominio: Pagos@LosAndes.com es el mismo
    expect(() => {
      repo.insert(makeClient('c-3', 'Otra SA', CUIT_C, 'Pagos@LosAndes.com'));
    }).toThrow(DuplicateBillingEmail);
    expect(repo.findById('c-3')).toBeNull();

    const zeta = repo.findById('c-2') as Client;
    expect(() => {
      repo.update(new Client({ ...propsOf(zeta), billingEmail: Email.create('pagos@losandes.com') }));
    }).toThrow(DuplicateBillingEmail);
    expect(repo.findById('c-2')?.billingEmail.value).toBe('pagos@zeta.com');

    // modificar un cliente sin cambiar su propio email ni su CUIT no es duplicado
    repo.update(new Client({ ...propsOf(zeta), address: 'Otra 2' }));
    expect(repo.findById('c-2')?.address).toBe('Otra 2');
  });

  // SQLite chequea primero el UNIQUE de billing_email (el último índice creado por la migración 0003)
  it('CUIT y email duplicados a la vez: gana DuplicateBillingEmail, en insert y en update', () => {
    const repo = create();
    repo.insert(makeClient('c-1', 'Los Andes SRL', CUIT_A, 'pagos@losandes.com'));
    repo.insert(makeClient('c-2', 'Zeta SA', CUIT_B, 'pagos@zeta.com'));

    expect(() => {
      repo.insert(makeClient('c-3', 'Otra SA', CUIT_A, 'pagos@losandes.com'));
    }).toThrow(DuplicateBillingEmail);
    expect(repo.findById('c-3')).toBeNull();

    const zeta = repo.findById('c-2') as Client;
    expect(() => {
      repo.update(
        new Client({ ...propsOf(zeta), cuit: Cuit.parse(CUIT_A), billingEmail: Email.create('pagos@losandes.com') }),
      );
    }).toThrow(DuplicateBillingEmail);
    expect(repo.findById('c-2')?.cuit.value).toBe(CUIT_B);
    expect(repo.findById('c-2')?.billingEmail.value).toBe('pagos@zeta.com');
  });

  it('un id repetido no se informa como CUIT ni email duplicado', () => {
    const repo = create();
    repo.insert(makeClient('c-1', 'Los Andes SRL', CUIT_A, 'pagos@losandes.com'));

    let thrown: unknown;
    try {
      repo.insert(makeClient('c-1', 'Otra SA', CUIT_B, 'otra@otra.com'));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DuplicateCuit);
    expect(thrown).not.toBeInstanceOf(DuplicateBillingEmail);
    expect(repo.findById('c-1')?.businessName).toBe('Los Andes SRL');
  });
});

describe('DrizzleClientRepository — filas corruptas', () => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  const insertRaw = (t: TestDb, cuit: string, email: string) =>
    t.db.$client
      .prepare(
        "INSERT INTO clients (id, business_name, cuit, address, billing_email, iva_condition, status, created_at) VALUES ('c-x', 'R', ?, 'D', ?, 1, 'activo', '2026-11-16T00:00:00.000Z')",
      )
      .run(cuit, email);

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

  it('un CUIT guardado con dígito verificador inválido es un error de infraestructura', () => {
    const t = createTestDb();
    opened.push(t);
    insertRaw(t, '30711111118', 'a@b.co');
    const repo = new DrizzleClientRepository(t.db);

    expectStoredError(() => repo.findById('c-x'), 'clients.cuit', '30711111118');
    expectStoredError(() => repo.list(), 'clients.cuit', '30711111118');
  });

  it('un email de facturación guardado inválido es un error de infraestructura', () => {
    const t = createTestDb();
    opened.push(t);
    insertRaw(t, CUIT_A, 'sin-arroba');
    const repo = new DrizzleClientRepository(t.db);

    expectStoredError(() => repo.findById('c-x'), 'clients.billing_email', 'sin-arroba');
  });
});

function propsOf(client: Client) {
  return {
    id: client.id,
    businessName: client.businessName,
    cuit: client.cuit,
    address: client.address,
    billingEmail: client.billingEmail,
    ivaCondition: client.ivaCondition,
    status: client.status,
    createdAt: client.createdAt,
  };
}
