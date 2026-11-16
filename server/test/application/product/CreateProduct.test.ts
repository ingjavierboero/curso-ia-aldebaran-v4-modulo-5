import { describe, expect, it } from 'vitest';
import { DuplicateProductName, InvalidPrice } from '../../../src/domain/product/errors.js';
import { createCatalogContext } from '../../support/catalogContext.js';

describe('CreateProduct', () => {
  // Alta con precio 15000,50 en pesos: Activo y en el listado con el precio como texto (AC-08)
  it('test_create_product_activo', () => {
    const ctx = createCatalogContext();

    const created = ctx.createProduct.execute(ctx.editor, { name: ' Sistema de Turnos ', price: '15000.5', currency: 'ARS' });

    expect(created).toEqual({
      id: 'id-1',
      name: 'Sistema de Turnos',
      price: '15000.50',
      currency: 'ARS',
      status: 'activo',
      createdAt: '2026-11-04T12:00:00.000Z',
    });
    expect(ctx.products.findById('id-1')?.price.cents).toBe(1_500_050);
    expect(ctx.listProducts.execute(ctx.consulta)).toEqual([created]);

    const cheap = ctx.createProduct.execute(ctx.admin, { name: 'Agenda', price: '0.01', currency: 'USD' });
    expect(cheap.price).toBe('0.01');
    expect(cheap.currency).toBe('USD');
  });

  // "sistema de turnos" con "Sistema de Turnos" existente: DuplicateProductName y nada cambia (AC-11)
  it('test_create_product_nombre_duplicado_rechazado', () => {
    const ctx = createCatalogContext();
    ctx.seedProduct({ id: 'p-turnos', name: 'Sistema de Turnos' });
    ctx.seedProduct({ id: 'p-agenda', name: 'Agenda' });

    expect(() =>
      ctx.createProduct.execute(ctx.editor, { name: 'sistema de turnos', price: '10', currency: 'ARS' }),
    ).toThrow(DuplicateProductName);
    expect(() => ctx.updateProduct.execute(ctx.editor, 'p-agenda', { name: ' SISTEMA DE TURNOS ' })).toThrow(
      DuplicateProductName,
    );
    expect(() => ctx.createProduct.execute(ctx.editor, { name: 'Otro', price: '0', currency: 'ARS' })).toThrow(
      InvalidPrice,
    );

    expect(ctx.products.list().map((p) => [p.id, p.name])).toEqual([
      ['p-agenda', 'Agenda'],
      ['p-turnos', 'Sistema de Turnos'],
    ]);
  });
});
