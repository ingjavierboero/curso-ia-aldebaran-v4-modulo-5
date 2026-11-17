import { describe, expect, it } from 'vitest';
import { DuplicateBillingEmail, DuplicateCuit } from '../../../../src/domain/client/errors.js';
import { InvalidIvaCondition } from '../../../../src/domain/shared/errors.js';
import { CUITS, createCatalogContext } from '../../../support/catalogContext.js';

describe('UpdateClient', () => {
  // Razón social y domicilio nuevos; el detalle los muestra (AC-03)
  it('test_update_client_modifica_datos', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes', businessName: 'Los Andes S.A.', address: 'Calle Vieja 1' });

    const updated = ctx.updateClient.execute(ctx.editor, 'c-andes', {
      businessName: ' Los Andes Sociedad Anónima ',
      address: 'Calle Nueva 2',
    });

    expect(updated).toEqual({
      id: 'c-andes',
      businessName: 'Los Andes Sociedad Anónima',
      cuit: CUITS.losAndes,
      address: 'Calle Nueva 2',
      billingEmail: 'pagos@losandes.com',
      ivaCondition: { code: 1, name: 'IVA Responsable Inscripto' },
      status: 'activo',
      createdAt: '2026-11-04T12:00:00.000Z',
    });
    expect(ctx.getClient.execute(ctx.consulta, 'c-andes')).toEqual({ ...updated, products: [] });

    const withIva = ctx.updateClient.execute(ctx.admin, 'c-andes', { ivaCondition: 5, billingEmail: 'Cobros@LosAndes.com' });
    expect(withIva.ivaCondition).toEqual({ code: 5, name: 'Consumidor Final' });
    expect(withIva.billingEmail).toBe('cobros@losandes.com');
    expect(withIva.businessName).toBe('Los Andes Sociedad Anónima');
  });

  // Modificar sin cambiar el CUIT (ni el email) no es un duplicado consigo mismo
  it('test_update_client_mismo_cuit_propio_no_es_duplicado', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes', cuit: CUITS.losAndes, billingEmail: 'pagos@losandes.com' });

    const updated = ctx.updateClient.execute(ctx.editor, 'c-andes', {
      businessName: 'Los Andes S.A.',
      cuit: '30-71111111-1',
      address: 'Otra 3',
      billingEmail: 'PAGOS@losandes.com',
      ivaCondition: 1,
    });

    expect(updated.cuit).toBe(CUITS.losAndes);
    expect(updated.billingEmail).toBe('pagos@losandes.com');
    expect(ctx.clients.findById('c-andes')?.address).toBe('Otra 3');
  });

  // Pagos@LosAndes.com ya es de otro cliente: DuplicateBillingEmail y nada cambia (AC-07)
  it('test_update_client_email_duplicado_rechazado', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes', cuit: CUITS.losAndes, billingEmail: 'pagos@losandes.com' });
    ctx.seedClient({ id: 'c-sur', businessName: 'Del Sur', cuit: CUITS.delSur, billingEmail: 'pagos@delsur.com' });

    expect(() =>
      ctx.updateClient.execute(ctx.editor, 'c-sur', { businessName: 'Cambiado', billingEmail: 'Pagos@LosAndes.com' }),
    ).toThrow(DuplicateBillingEmail);
    expect(() => ctx.updateClient.execute(ctx.editor, 'c-sur', { cuit: CUITS.losAndes })).toThrow(DuplicateCuit);
    // Si chocan los dos a la vez, gana el email (misma semántica que el repositorio).
    expect(() =>
      ctx.updateClient.execute(ctx.editor, 'c-sur', { cuit: CUITS.losAndes, billingEmail: 'pagos@losandes.com' }),
    ).toThrow(DuplicateBillingEmail);
    expect(() => ctx.updateClient.execute(ctx.editor, 'c-sur', { ivaCondition: 2 })).toThrow(InvalidIvaCondition);

    const sur = ctx.clients.findById('c-sur');
    expect(sur?.businessName).toBe('Del Sur');
    expect(sur?.billingEmail.value).toBe('pagos@delsur.com');
    expect(sur?.cuit.value).toBe(CUITS.delSur);
    expect(sur?.ivaCondition.code).toBe(1);
  });
});
