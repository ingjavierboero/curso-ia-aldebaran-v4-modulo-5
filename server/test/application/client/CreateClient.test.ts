import { describe, expect, it } from 'vitest';
import { DuplicateBillingEmail, DuplicateCuit, InvalidCuit } from '../../../src/domain/client/errors.js';
import { CUITS, createCatalogContext } from '../../support/catalogContext.js';

const VALID = {
  businessName: 'Los Andes S.A.',
  cuit: CUITS.losAndes,
  address: 'Av. Siempre Viva 742',
  billingEmail: 'pagos@losandes.com',
  ivaCondition: 1,
};

describe('CreateClient', () => {
  // Alta con datos válidos: Activo, con fecha de alta, y aparece en el listado (AC-01)
  it('test_create_client_activo_con_fecha_de_alta', () => {
    const ctx = createCatalogContext();

    const created = ctx.createClient.execute(ctx.editor, {
      businessName: '  Los Andes S.A. ',
      cuit: '30-71111111-1',
      address: ' Av. Siempre Viva 742 ',
      billingEmail: ' Pagos@LosAndes.com',
      ivaCondition: 6,
    });

    expect(created).toEqual({
      id: 'id-1',
      businessName: 'Los Andes S.A.',
      cuit: '30711111111',
      address: 'Av. Siempre Viva 742',
      billingEmail: 'pagos@losandes.com',
      ivaCondition: { code: 6, name: 'Responsable Monotributo' },
      status: 'activo',
      createdAt: '2026-11-04T12:00:00.000Z',
    });
    expect(ctx.clients.findById('id-1')?.status).toBe('activo');
    expect(ctx.clients.findById('id-1')?.createdAt).toEqual(ctx.clock.now());
    expect(ctx.listClients.execute(ctx.admin)).toEqual([created]);

    const byAdmin = ctx.createClient.execute(ctx.admin, {
      ...VALID,
      businessName: 'Del Sur SRL',
      cuit: CUITS.delSur,
      billingEmail: 'admin@delsur.com',
    });
    expect(byAdmin.status).toBe('activo');
    expect(ctx.clients.list()).toHaveLength(2);
  });

  // Mismo CUIT que otro cliente: DuplicateCuit y nada cambia (AC-07)
  it('test_create_client_cuit_duplicado_rechazado', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes', cuit: CUITS.losAndes, billingEmail: 'pagos@losandes.com' });

    expect(() =>
      ctx.createClient.execute(ctx.editor, { ...VALID, cuit: '30-71111111-1', billingEmail: 'otro@empresa.com' }),
    ).toThrow(DuplicateCuit);
    expect(() =>
      ctx.createClient.execute(ctx.editor, { ...VALID, cuit: CUITS.delSur, billingEmail: 'Pagos@LosAndes.com' }),
    ).toThrow(DuplicateBillingEmail);

    expect(ctx.clients.list().map((c) => c.id)).toEqual(['c-andes']);
  });

  it('valida con el dominio antes de abrir la transacción', () => {
    const ctx = createCatalogContext();
    const runsBefore = ctx.uow.runs;

    expect(() => ctx.createClient.execute(ctx.editor, { ...VALID, cuit: '30711111118' })).toThrow(InvalidCuit);

    expect(ctx.uow.runs).toBe(runsBefore);
    expect(ctx.clients.list()).toHaveLength(0);
  });
});
