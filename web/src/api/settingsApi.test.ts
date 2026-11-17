import { describe, expect, it } from 'vitest';
import { mockFetch } from '../test/fetchMock';
import { EMPTY_SETTINGS, FULL_SETTINGS, WITHOUT_IIBB } from '../test/settingsFixtures';
import { ApiError, NetworkError } from './client';
import { getBillingSettings, updateBillingSettings } from './settingsApi';

describe('settingsApi', () => {
  it('lee y actualiza la configuración en /api/settings/billing y devuelve el DTO sin envoltorio', async () => {
    const fetchMock = mockFetch({
      'GET /api/settings/billing': [
        { status: 200, body: EMPTY_SETTINGS },
        { status: 200, body: WITHOUT_IIBB },
      ],
      'PATCH /api/settings/billing': { status: 200, body: FULL_SETTINGS },
    });

    await expect(getBillingSettings()).resolves.toEqual(EMPTY_SETTINGS);
    await expect(getBillingSettings()).resolves.toEqual(WITHOUT_IIBB);
    await expect(
      updateBillingSettings({ billingHour: '23:59', issuer: { iibb: 'CM 901-123456-7' } }),
    ).resolves.toEqual(FULL_SETTINGS);

    const [patch] = fetchMock.callsTo('PATCH', '/api/settings/billing');
    expect(patch?.body).toEqual({ billingHour: '23:59', issuer: { iibb: 'CM 901-123456-7' } });
    expect(patch?.init?.credentials).toBe('include');
  });

  it('una respuesta 2xx con forma inválida es NetworkError', async () => {
    const bad = [
      { settings: FULL_SETTINGS },
      { ...FULL_SETTINGS, billingHour: 1100 },
      { ...FULL_SETTINGS, pointOfSale: '5' },
      { ...FULL_SETTINGS, pointOfSale: 2.5 },
      { ...FULL_SETTINGS, issuer: null },
      { ...FULL_SETTINGS, issuer: { ...FULL_SETTINGS.issuer, legalName: 3 } },
      { ...FULL_SETTINGS, issuer: { ...FULL_SETTINGS.issuer, ivaCondition: { code: 1, name: 'IVA Responsable Inscripto' } } },
      { ...FULL_SETTINGS, issuer: { ...FULL_SETTINGS.issuer, ivaCondition: 6 } },
      { ...FULL_SETTINGS, missing: [{ field: 'otro', label: 'otro' }] },
      { ...FULL_SETTINGS, missing: null },
      { ...FULL_SETTINGS, updatedAt: 0 },
    ];
    mockFetch({
      'GET /api/settings/billing': bad.map((body) => ({ status: 200, body })),
      'PATCH /api/settings/billing': { status: 200, body: { ok: true } },
    });

    for (const body of bad) {
      await expect(getBillingSettings(), JSON.stringify(body)).rejects.toBeInstanceOf(NetworkError);
    }
    await expect(updateBillingSettings({ billingHour: '10:00' })).rejects.toBeInstanceOf(NetworkError);
  });

  it('un 400 llega como ApiError con el mensaje del server', async () => {
    mockFetch({
      'PATCH /api/settings/billing': { status: 400, body: { error: 'El punto de venta debe ser un entero entre 1 y 99999' } },
    });

    const err: unknown = await updateBillingSettings({ pointOfSale: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe('El punto de venta debe ser un entero entre 1 y 99999');
  });
});
