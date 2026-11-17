import { describe, expect, it } from 'vitest';
import { InvalidCurrency, InvalidPrice } from '../../../../src/domain/product/errors.js';
import { ProductNotFound } from '../../../../src/application/product/errors.js';
import { createCatalogContext } from '../../../support/catalogContext.js';

describe('UpdateProduct', () => {
  // Nombre, precio y moneda de pesos a dólares: el listado muestra los valores nuevos (AC-10)
  it('test_update_product_nombre_precio_moneda', () => {
    const ctx = createCatalogContext();
    ctx.seedProduct({ id: 'p-turnos', name: 'Sistema de Turnos', price: '15000.50', currency: 'ARS' });

    const updated = ctx.updateProduct.execute(ctx.editor, 'p-turnos', {
      name: 'Turnos Pro',
      price: '120.5',
      currency: 'USD',
    });

    expect(updated).toEqual({
      id: 'p-turnos',
      name: 'Turnos Pro',
      price: '120.50',
      currency: 'USD',
      status: 'activo',
      createdAt: '2026-11-04T12:00:00.000Z',
    });
    expect(ctx.listProducts.execute(ctx.consulta)).toEqual([updated]);

    // Los campos ausentes no cambian.
    expect(ctx.updateProduct.execute(ctx.admin, 'p-turnos', { currency: 'ARS' })).toEqual({ ...updated, currency: 'ARS' });
    expect(ctx.updateProduct.execute(ctx.admin, 'p-turnos', { price: '99' })).toEqual({
      ...updated,
      currency: 'ARS',
      price: '99.00',
    });

    expect(() => ctx.updateProduct.execute(ctx.editor, 'p-turnos', { price: '0' })).toThrow(InvalidPrice);
    expect(() => ctx.updateProduct.execute(ctx.editor, 'p-turnos', { currency: 'EUR' })).toThrow(InvalidCurrency);
    expect(() => ctx.updateProduct.execute(ctx.editor, 'no-existe', { name: 'X' })).toThrow(ProductNotFound);
    expect(ctx.products.findById('p-turnos')?.price.toDecimalString()).toBe('99.00');
  });
});
