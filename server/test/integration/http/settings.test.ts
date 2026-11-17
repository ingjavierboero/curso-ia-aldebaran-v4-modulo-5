import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '../../../src/domain/user/User.js';
import { sessionAs as sessionOf } from '../../support/httpSession.js';
import { type TestApp, createTestApp } from '../../support/testApp.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

const sessionAs = (role: UserRole): Promise<string> => sessionOf(t, role);

const PATH = '/api/settings/billing';

interface SettingsRow {
  id: number;
  billing_hour: string;
  point_of_sale: number | null;
  issuer_legal_name: string | null;
  issuer_address: string | null;
  issuer_iva_condition: number | null;
  issuer_iibb: string | null;
  issuer_activity_start: string | null;
  issuer_trade_name: string | null;
  updated_at: string;
}

/**
 * Las columnas de facturación de `settings`, leídas directo de la base. Lista explícita: columnas que
 * agreguen otros módulos no cambian lo que comparan estos tests.
 */
function settingsRows(): SettingsRow[] {
  return t.db.$client
    .prepare(
      'SELECT id, billing_hour, point_of_sale, issuer_legal_name, issuer_address, issuer_iva_condition, ' +
        'issuer_iibb, issuer_activity_start, issuer_trade_name, updated_at FROM settings ORDER BY id',
    )
    .all() as SettingsRow[];
}

function patch(cookie: string, body: unknown) {
  return request(t.app).patch(PATH).set('Cookie', cookie).send(body as object);
}

/** `FakeClock` arranca en 2026-11-04T12:00Z: en Argentina, hoy es el 04/11/2026. */
const TODAY = '2026-11-04';
const TOMORROW = '2026-11-05';

const ISSUER_IVA_ERROR =
  'La condición frente al IVA de la empresa emisora debe ser IVA Sujeto Exento, Responsable ' +
  'Monotributo, Monotributista Social o Monotributo Trabajador Independiente Promovido';

const ALL_MISSING = [
  { field: 'issuerLegalName', label: 'razón social' },
  { field: 'issuerAddress', label: 'domicilio comercial' },
  { field: 'issuerIvaCondition', label: 'condición frente al IVA' },
  { field: 'issuerIibb', label: 'número de ingresos brutos' },
  { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
  { field: 'pointOfSale', label: 'punto de venta' },
];

const EMPTY_ISSUER = {
  legalName: null,
  address: null,
  ivaCondition: null,
  iibb: null,
  activityStartDate: null,
  tradeName: null,
};

const FULL_ISSUER = {
  legalName: 'Aldebaran Software S.A.',
  address: 'Av. Corrientes 1234, CABA',
  ivaCondition: 6,
  iibb: '901-123456-7',
  activityStartDate: '2020-03-01',
  tradeName: 'Aldebaran',
};

/** Una configuración guardada completa, para comprobar que un pedido rechazado no la toca. */
async function seedFullSettings(admin: string): Promise<SettingsRow[]> {
  const res = await patch(admin, { billingHour: '09:30', pointOfSale: 3, issuer: FULL_ISSUER });
  expect(res.status).toBe(200);
  const rows = settingsRows();
  expect(rows).toHaveLength(1);
  return rows;
}

describe('configuración de facturación por HTTP', () => {
  // AC-01: recién instalado, sin fila en la base.
  it('test_http_get_settings_recien_instalado', async () => {
    const admin = await sessionAs('admin');

    const res = await request(t.app).get(PATH).set('Cookie', admin);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      billingHour: '11:00',
      pointOfSale: null,
      issuer: EMPTY_ISSUER,
      missing: ALL_MISSING,
      updatedAt: null,
    });
    expect(settingsRows()).toEqual([]);
  });

  // AC-02, AC-04
  it('test_http_patch_hora_y_punto_de_venta', async () => {
    const admin = await sessionAs('admin');

    const res = await patch(admin, { billingHour: '08:45', pointOfSale: 12 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      billingHour: '08:45',
      pointOfSale: 12,
      issuer: EMPTY_ISSUER,
      missing: ALL_MISSING.filter((m) => m.field !== 'pointOfSale'),
      updatedAt: t.clock.now().toISOString(),
    });
    expect(settingsRows()).toEqual([
      {
        id: 1,
        billing_hour: '08:45',
        point_of_sale: 12,
        issuer_legal_name: null,
        issuer_address: null,
        issuer_iva_condition: null,
        issuer_iibb: null,
        issuer_activity_start: null,
        issuer_trade_name: null,
        updated_at: t.clock.now().toISOString(),
      },
    ]);

    const read = await request(t.app).get(PATH).set('Cookie', admin);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ billingHour: '08:45', pointOfSale: 12 });
  });

  // AC-03
  it('test_http_patch_hora_invalida_rechazada', async () => {
    const admin = await sessionAs('admin');
    const before = await seedFullSettings(admin);

    for (const billingHour of ['24:00', '23:60']) {
      const res = await patch(admin, { billingHour });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'La hora de facturación debe estar entre 00:00 y 23:59, con el formato HH:MM',
      });
    }

    expect(settingsRows()).toEqual(before);
    const read = await request(t.app).get(PATH).set('Cookie', admin);
    expect(read.body).toMatchObject({ billingHour: '09:30' });
  });

  // AC-05
  it('test_http_patch_punto_de_venta_invalido_rechazado', async () => {
    const admin = await sessionAs('admin');
    const before = await seedFullSettings(admin);

    for (const pointOfSale of [0, 100000]) {
      const res = await patch(admin, { pointOfSale });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'El punto de venta debe ser un número entero entre 1 y 99999' });
    }
    // Un decimal no es un entero: lo rechaza la forma del body.
    const decimal = await patch(admin, { pointOfSale: 2.5 });
    expect(decimal.status).toBe(400);
    expect(decimal.body).toEqual({ error: 'El campo "pointOfSale" debe ser un número entero' });

    expect(settingsRows()).toEqual(before);
  });

  // AC-06, AC-11
  it('test_http_patch_emisor_completo', async () => {
    const admin = await sessionAs('admin');

    const res = await patch(admin, { pointOfSale: 7, issuer: FULL_ISSUER });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      billingHour: '11:00',
      pointOfSale: 7,
      issuer: {
        legalName: 'Aldebaran Software S.A.',
        address: 'Av. Corrientes 1234, CABA',
        ivaCondition: { code: 6, name: 'Responsable Monotributo' },
        iibb: '901-123456-7',
        activityStartDate: '2020-03-01',
        tradeName: 'Aldebaran',
      },
      missing: [],
      updatedAt: t.clock.now().toISOString(),
    });
    expect(settingsRows()).toEqual([
      {
        id: 1,
        billing_hour: '11:00',
        point_of_sale: 7,
        issuer_legal_name: 'Aldebaran Software S.A.',
        issuer_address: 'Av. Corrientes 1234, CABA',
        issuer_iva_condition: 6,
        issuer_iibb: '901-123456-7',
        issuer_activity_start: '2020-03-01',
        issuer_trade_name: 'Aldebaran',
        updated_at: t.clock.now().toISOString(),
      },
    ]);

    const read = await request(t.app).get(PATH).set('Cookie', admin);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ ...res.body, updatedAt: null });
  });

  // AC-07
  it('test_http_patch_condicion_iva_emisor_invalida_rechazada', async () => {
    const admin = await sessionAs('admin');

    const res = await patch(admin, { issuer: { ivaCondition: 1 } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: ISSUER_IVA_ERROR });
    expect(settingsRows()).toEqual([]);
  });

  // AC-08
  it('test_http_patch_fecha_inicio_invalida_rechazada', async () => {
    const admin = await sessionAs('admin');

    for (const activityStartDate of ['2020-02-31', TOMORROW]) {
      const res = await patch(admin, { issuer: { activityStartDate } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'La fecha de inicio de actividades debe ser una fecha existente entre el 01/01/1900 y hoy',
      });
    }
    expect(settingsRows()).toEqual([]);

    const today = await patch(admin, { issuer: { activityStartDate: TODAY } });
    expect(today.status).toBe(200);
    expect(today.body).toMatchObject({ issuer: { activityStartDate: TODAY } });
    expect(settingsRows()).toMatchObject([{ issuer_activity_start: TODAY }]);
  });

  // AC-09
  it('test_http_patch_iibb_invalido_rechazado_y_trim', async () => {
    const admin = await sessionAs('admin');

    const blank = await patch(admin, { issuer: { iibb: '   ' } });
    expect(blank.status).toBe(400);
    expect(blank.body).toEqual({ error: 'El número de ingresos brutos debe tener entre 1 y 50 caracteres' });

    const tooLong = await patch(admin, { issuer: { iibb: '1'.repeat(51) } });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toEqual({ error: 'El campo "iibb" admite como máximo 50 caracteres' });
    expect(settingsRows()).toEqual([]);

    const padded = await patch(admin, { issuer: { iibb: '  901-123456-7  ' } });
    expect(padded.status).toBe(200);
    expect(padded.body).toMatchObject({ issuer: { iibb: '901-123456-7' } });
    expect(settingsRows()).toMatchObject([{ issuer_iibb: '901-123456-7' }]);
  });

  // AC-10, AC-12
  it('test_http_patch_con_faltantes_devuelve_missing', async () => {
    const admin = await sessionAs('admin');
    const { iibb: _iibb, activityStartDate: _date, ...partial } = FULL_ISSUER;

    const res = await patch(admin, { pointOfSale: 1, issuer: partial });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      issuer: { legalName: FULL_ISSUER.legalName, iibb: null, activityStartDate: null },
      missing: [
        { field: 'issuerIibb', label: 'número de ingresos brutos' },
        { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
      ],
    });
    expect(settingsRows()).toMatchObject([
      { issuer_legal_name: FULL_ISSUER.legalName, issuer_iibb: null, issuer_activity_start: null },
    ]);

    const read = await request(t.app).get(PATH).set('Cookie', admin);
    expect(read.body).toMatchObject({
      missing: [
        { field: 'issuerIibb', label: 'número de ingresos brutos' },
        { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
      ],
    });

    // AC-12: sin punto de venta ni fecha de inicio, faltan exactamente esos dos, en el orden fijo.
    t.cleanup();
    t = await createTestApp();
    const admin2 = await sessionAs('admin');
    const { activityStartDate: _date2, ...withoutDate } = FULL_ISSUER;

    const res2 = await patch(admin2, { issuer: withoutDate });

    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject({ pointOfSale: null, issuer: { activityStartDate: null } });
    expect((res2.body as { missing: unknown }).missing).toEqual([
      { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
      { field: 'pointOfSale', label: 'punto de venta' },
    ]);
  });

  // AC-13
  it('test_http_patch_editor_consulta_forbidden', async () => {
    const admin = await sessionAs('admin');
    const before = await seedFullSettings(admin);
    const expected: unknown = (await request(t.app).get(PATH).set('Cookie', admin)).body;

    for (const role of ['editor', 'consulta'] as const) {
      const cookie = await sessionAs(role);

      const res = await patch(cookie, { billingHour: '07:00', pointOfSale: 8, issuer: { legalName: 'X' } });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'No tenés permiso para realizar esta acción' });

      const read = await request(t.app).get(PATH).set('Cookie', cookie);
      expect(read.status).toBe(200);
      expect(read.body).toEqual(expected);
    }

    expect(settingsRows()).toEqual(before);
  });

  // AC-14
  it('test_http_patch_mixto_invalido_no_cambia_nada', async () => {
    const admin = await sessionAs('admin');
    const before = await seedFullSettings(admin);

    const res = await patch(admin, {
      billingHour: '06:00',
      pointOfSale: 9,
      issuer: { legalName: 'Otra Razón Social', ivaCondition: 1 },
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: ISSUER_IVA_ERROR });
    expect(settingsRows()).toEqual(before);
  });

  // S-01: una razón social en blanco la rechaza el dominio (`InvalidIssuerText`) y no se guarda nada.
  it('test_http_patch_razon_social_en_blanco_rechazada', async () => {
    const admin = await sessionAs('admin');
    const before = await seedFullSettings(admin);

    const res = await patch(admin, { issuer: { legalName: '   ' } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La razón social de la empresa emisora debe tener entre 1 y 200 caracteres' });
    expect(settingsRows()).toEqual(before);
  });

  it('test_http_patch_body_vacio_invalido', async () => {
    const admin = await sessionAs('admin');

    const AT_LEAST_ONE = 'Indicá al menos uno de los campos "billingHour", "pointOfSale" o "issuer"';
    const AT_LEAST_ONE_ISSUER =
      'Indicá al menos uno de los campos de "issuer": "legalName", "address", "ivaCondition", "iibb", ' +
      '"activityStartDate" o "tradeName"';
    const cases: [unknown, string][] = [
      [{}, AT_LEAST_ONE],
      [{ desconocido: 1 }, AT_LEAST_ONE],
      [{ issuer: {} }, AT_LEAST_ONE_ISSUER],
      [{ issuer: 'Aldebaran' }, 'El campo "issuer" debe ser un objeto'],
      [{ issuer: [] }, 'El campo "issuer" debe ser un objeto'],
      [{ issuer: null }, 'El campo "issuer" debe ser un objeto'],
      [{ billingHour: null }, 'El campo "billingHour" debe ser texto'],
      [{ billingHour: 930 }, 'El campo "billingHour" debe ser texto'],
      [{ billingHour: 'x'.repeat(11) }, 'El campo "billingHour" admite como máximo 10 caracteres'],
      [{ pointOfSale: '3' }, 'El campo "pointOfSale" debe ser un número entero'],
      [{ pointOfSale: null }, 'El campo "pointOfSale" debe ser un número entero'],
      [{ issuer: { legalName: 42 } }, 'El campo "legalName" debe ser texto'],
      [{ issuer: { legalName: null } }, 'El campo "legalName" debe ser texto'],
      [{ issuer: { ivaCondition: null } }, 'El campo "ivaCondition" debe ser un número entero'],
      [{ issuer: { ivaCondition: '6' } }, 'El campo "ivaCondition" debe ser un número entero'],
      [{ issuer: { ivaCondition: 6.5 } }, 'El campo "ivaCondition" debe ser un número entero'],
      [{ issuer: { legalName: 'x'.repeat(201) } }, 'El campo "legalName" admite como máximo 200 caracteres'],
      [{ issuer: { iibb: '1'.repeat(51) } }, 'El campo "iibb" admite como máximo 50 caracteres'],
      [
        { issuer: { activityStartDate: '2020-03-01T00:00' } },
        'El campo "activityStartDate" admite como máximo 10 caracteres',
      ],
    ];
    for (const [body, error] of cases) {
      const res = await patch(admin, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body, JSON.stringify(body)).toEqual({ error });
    }

    expect(settingsRows()).toEqual([]);
  });

  it('test_http_settings_sin_sesion_no_autorizado', async () => {
    const get = await request(t.app).get(PATH);
    expect(get.status).toBe(401);
    expect(get.body).toEqual({ error: 'Sesión no válida' });

    const res = await request(t.app).patch(PATH).send({ billingHour: '07:00' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sesión no válida' });
    expect(settingsRows()).toEqual([]);

    // Control: con sesión la misma ruta existe; el 401 viene de exigir sesión, no de una ruta ausente.
    const admin = await sessionAs('admin');
    const withSession = await request(t.app).get(PATH).set('Cookie', admin);
    expect(withSession.status).toBe(200);
  });

  // AC-01: mediana de 5 lecturas, después de un calentamiento.
  it('test_http_get_settings_rapido', async () => {
    const admin = await sessionAs('admin');
    await seedFullSettings(admin);

    const warmup = await request(t.app).get(PATH).set('Cookie', admin);
    expect(warmup.status).toBe(200);

    const durations: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const res = await request(t.app).get(PATH).set('Cookie', admin);
      durations.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    durations.sort((a, b) => a - b);
    expect(durations[2]).toBeLessThan(200);
  });
});
