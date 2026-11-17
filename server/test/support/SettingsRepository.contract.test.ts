import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityStartDate } from '../../src/domain/settings/ActivityStartDate.js';
import { BillingHour } from '../../src/domain/settings/BillingHour.js';
import { BillingSettings } from '../../src/domain/settings/BillingSettings.js';
import { IssuerIvaCondition } from '../../src/domain/settings/IssuerIvaCondition.js';
import { PointOfSale } from '../../src/domain/settings/PointOfSale.js';
import type { SettingsRepository } from '../../src/domain/settings/SettingsRepository.js';
import { createDb, type Db } from '../../src/infrastructure/db/client.js';
import { DrizzleSettingsRepository } from '../../src/infrastructure/db/DrizzleSettingsRepository.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { InvalidStoredValue } from '../../src/infrastructure/db/storedValue.js';
import { InMemorySettingsRepository } from './InMemorySettingsRepository.js';
import { createTestDb, type TestDb } from './sqliteTestDb.js';

const T0 = new Date('2026-11-16T12:00:00.000Z');
const T1 = new Date('2026-11-16T13:30:00.000Z');

/** Proyección plana de la configuración, para comparar sin depender de la identidad de los objetos. */
function plain(settings: BillingSettings) {
  return {
    billingHour: settings.billingHour.value,
    pointOfSale: settings.pointOfSale?.value ?? null,
    issuerLegalName: settings.issuerLegalName,
    issuerAddress: settings.issuerAddress,
    issuerIvaCondition: settings.issuerIvaCondition?.code ?? null,
    issuerIibb: settings.issuerIibb,
    issuerActivityStartDate: settings.issuerActivityStartDate?.value ?? null,
    issuerTradeName: settings.issuerTradeName,
  };
}

const DEFAULTS = {
  billingHour: '11:00',
  pointOfSale: null,
  issuerLegalName: null,
  issuerAddress: null,
  issuerIvaCondition: null,
  issuerIibb: null,
  issuerActivityStartDate: null,
  issuerTradeName: null,
};

function complete(): BillingSettings {
  return BillingSettings.defaults().withChanges({
    billingHour: BillingHour.parse('09:30'),
    pointOfSale: PointOfSale.of(99999),
    issuerLegalName: 'Aldebaran Software SRL',
    issuerAddress: 'Av. Corrientes 1234, CABA',
    issuerIvaCondition: IssuerIvaCondition.of(6),
    issuerIibb: '901-123456-7',
    issuerActivityStartDate: ActivityStartDate.rehydrate('2020-03-01'),
    issuerTradeName: 'Aldebaran',
  });
}

interface Harness {
  repo: SettingsRepository;
  /** Cantidad de filas guardadas (0 o 1). */
  rows(): number;
  /** `updated_at` de la fila guardada, o null si no hay. */
  updatedAt(): string | null;
}

const opened: TestDb[] = [];

const implementations: [string, () => Harness][] = [
  [
    'InMemorySettingsRepository',
    () => {
      const repo = new InMemorySettingsRepository();
      return {
        repo,
        rows: () => (repo.updatedAt === null ? 0 : 1),
        updatedAt: () => repo.updatedAt?.toISOString() ?? null,
      };
    },
  ],
  [
    'DrizzleSettingsRepository',
    () => {
      const t = createTestDb();
      opened.push(t);
      const sqlite = t.db.$client;
      return {
        repo: new DrizzleSettingsRepository(t.db),
        rows: () => (sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }).n,
        updatedAt: () =>
          (sqlite.prepare('SELECT updated_at FROM settings WHERE id = 1').get() as { updated_at: string } | undefined)
            ?.updated_at ?? null,
      };
    },
  ],
];

// El doble en memoria y el repositorio real cumplen el mismo contrato del puerto (W10).
describe.each(implementations)('contrato SettingsRepository — %s', (_name, create) => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  // AC-01: sin nada guardado, hora 11:00 y lo demás vacío
  it('test_settings_repo_sin_fila_devuelve_defaults', () => {
    const h = create();

    expect(plain(h.repo.get())).toEqual(DEFAULTS);
    expect(h.repo.get().missingRequired()).toHaveLength(6);
    expect(h.rows()).toBe(0);
  });

  // AC-02, AC-04, AC-06: lo guardado vuelve igual, con sus value objects
  it('test_settings_repo_guardar_y_releer', () => {
    const h = create();

    h.repo.saveBilling(complete(), T0);

    const read = h.repo.get();
    expect(plain(read)).toEqual({
      billingHour: '09:30',
      pointOfSale: 99999,
      issuerLegalName: 'Aldebaran Software SRL',
      issuerAddress: 'Av. Corrientes 1234, CABA',
      issuerIvaCondition: 6,
      issuerIibb: '901-123456-7',
      issuerActivityStartDate: '2020-03-01',
      issuerTradeName: 'Aldebaran',
    });
    expect(read).toBeInstanceOf(BillingSettings);
    expect(read.billingHour).toBeInstanceOf(BillingHour);
    expect(read.pointOfSale).toBeInstanceOf(PointOfSale);
    expect(read.issuerIvaCondition).toBe(IssuerIvaCondition.of(6));
    expect(read.issuerActivityStartDate).toBeInstanceOf(ActivityStartDate);
    expect(read.missingRequired()).toEqual([]);
    expect(h.updatedAt()).toBe(T0.toISOString());

    // una configuración parcial también vuelve igual: los opcionales vacíos siguen vacíos
    const partial = create();
    partial.repo.saveBilling(
      BillingSettings.defaults().withChanges({ billingHour: BillingHour.parse('00:00'), pointOfSale: PointOfSale.of(1) }),
      T0,
    );
    expect(plain(partial.repo.get())).toEqual({ ...DEFAULTS, billingHour: '00:00', pointOfSale: 1 });
  });

  it('test_settings_repo_upsert_idempotente', () => {
    const h = create();

    h.repo.saveBilling(complete(), T0);
    const second = h.repo.get().withChanges({
      billingHour: BillingHour.parse('23:59'),
      issuerIvaCondition: IssuerIvaCondition.of(16),
      issuerTradeName: 'Otro nombre',
    });
    h.repo.saveBilling(second, T1);

    expect(h.rows()).toBe(1);
    expect(h.updatedAt()).toBe(T1.toISOString());
    expect(plain(h.repo.get())).toEqual({
      ...plain(complete()),
      billingHour: '23:59',
      issuerIvaCondition: 16,
      issuerTradeName: 'Otro nombre',
    });

    // guardar lo mismo otra vez tampoco agrega filas
    h.repo.saveBilling(h.repo.get(), T1);
    expect(h.rows()).toBe(1);
    expect(plain(h.repo.get())).toEqual(plain(second));
  });
});

describe('DrizzleSettingsRepository — filas corruptas', () => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  /** Escribe la fila por fuera del dominio y de los CHECK, como lo haría un cambio manual en la base. */
  function insertRaw(t: TestDb, column: string, value: string | number): void {
    const sqlite = t.db.$client;
    sqlite.pragma('ignore_check_constraints = ON');
    try {
      sqlite
        .prepare(`INSERT INTO settings (id, billing_hour, updated_at) VALUES (1, '11:00', '2026-11-16T00:00:00.000Z')`)
        .run();
      sqlite.prepare(`UPDATE settings SET ${column} = ? WHERE id = 1`).run(value);
    } finally {
      sqlite.pragma('ignore_check_constraints = OFF');
    }
  }

  /**
   * `mustNotAppear`: texto que no puede aparecer en el mensaje — el dato guardado o, cuando el dato
   * es vacío o de espacios, una parte del mensaje del dominio (W5 de la revisión de Block 2). El
   * mensaje además se compara exacto: solo nombra `tabla.columna`.
   */
  function expectStoredError(fn: () => unknown, field: string, mustNotAppear: string): void {
    let thrown: unknown;
    try {
      fn();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(InvalidStoredValue);
    const error = thrown as InvalidStoredValue;
    expect(error.name).toBe('InvalidStoredValue');
    expect(error.message).toBe(`Valor inválido guardado en ${field}`);
    expect(error.message).not.toContain(mustNotAppear);
  }

  // una hora 25:00 escrita por fuera es un error de infraestructura, no los valores por defecto
  it('test_settings_repo_fila_corrupta_invalida_rechazada', () => {
    const t = createTestDb();
    opened.push(t);
    insertRaw(t, 'billing_hour', '25:00');

    expectStoredError(() => new DrizzleSettingsRepository(t.db).get(), 'settings.billing_hour', '25:00');
  });

  it.each([
    ['point_of_sale', 0, '0'],
    ['issuer_iva_condition', 1, 'condición 1'],
    ['issuer_activity_start', '2026-02-30', '2026-02-30'],
    ['issuer_legal_name', '   ', 'razón social'],
    ['issuer_address', 'x'.repeat(201), 'x'.repeat(201)],
    ['issuer_iibb', 'y'.repeat(51), 'y'.repeat(51)],
    ['issuer_trade_name', '', 'nombre de fantasía'],
  ] as const)('cada columna se revalida al leer: %s', (column, value, mustNotAppear) => {
    const t = createTestDb();
    opened.push(t);
    insertRaw(t, column, value);

    expectStoredError(() => new DrizzleSettingsRepository(t.db).get(), `settings.${column}`, mustNotAppear);
  });
});

describe('DrizzleSettingsRepository — persistencia en disco', () => {
  let dir: string | null = null;
  const dbs: Db[] = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) if (db.$client.open) db.$client.close();
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  // AC-15: lo guardado sigue ahí después de reiniciar el sistema (otra conexión al mismo archivo)
  it('test_settings_persisten_tras_reiniciar', () => {
    dir = mkdtempSync(join(tmpdir(), 'aldebaran-settings-'));
    const file = join(dir, 'aldebaran.db');

    const first = createDb(file);
    dbs.push(first);
    migrate(first);
    new DrizzleSettingsRepository(first).saveBilling(complete(), T0);
    first.$client.close();

    const second = createDb(file);
    dbs.push(second);
    migrate(second);

    expect(plain(new DrizzleSettingsRepository(second).get())).toEqual(plain(complete()));
  });
});
