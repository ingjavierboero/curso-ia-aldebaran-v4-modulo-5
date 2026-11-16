import { describe, expect, it } from 'vitest';
import { ProductInactive, ProductNotFound } from '../../../src/application/product/errors.js';
import { createCatalogContext } from '../../support/catalogContext.js';

describe('DeactivateProduct / ReactivateProduct', () => {
  // Desactivar un producto asignado: sigue asignado, no se asigna a otro; reactivado sí (AC-12)
  it('test_deactivate_product_conserva_asignaciones', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedClient({ id: 'c-sur', businessName: 'Del Sur', cuit: '20111111112', billingEmail: 'pagos@delsur.com' });
    ctx.seedProduct({ id: 'p-turnos', name: 'Sistema de Turnos' });
    ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-turnos']);

    const deactivated = ctx.deactivateProduct.execute(ctx.editor, 'p-turnos');

    expect(deactivated.status).toBe('inactivo');
    expect(ctx.deactivateProduct.execute(ctx.admin, 'p-turnos')).toEqual(deactivated);
    expect(ctx.getClient.execute(ctx.consulta, 'c-andes').products).toEqual([deactivated]);
    expect(ctx.listProducts.execute(ctx.consulta)).toEqual([deactivated]);
    expect(() => ctx.assignProducts.execute(ctx.editor, 'c-sur', ['p-turnos'])).toThrow(ProductInactive);
    expect(ctx.clientProducts.listProductIdsOf('c-sur')).toEqual([]);

    const reactivated = ctx.reactivateProduct.execute(ctx.editor, 'p-turnos');
    expect(reactivated).toEqual({ ...deactivated, status: 'activo' });
    expect(ctx.reactivateProduct.execute(ctx.admin, 'p-turnos')).toEqual(reactivated);
    ctx.assignProducts.execute(ctx.editor, 'c-sur', ['p-turnos']);
    expect(ctx.clientProducts.listProductIdsOf('c-sur')).toEqual(['p-turnos']);
    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual(['p-turnos']);

    expect(() => ctx.deactivateProduct.execute(ctx.editor, 'no-existe')).toThrow(ProductNotFound);
    expect(() => ctx.reactivateProduct.execute(ctx.editor, 'no-existe')).toThrow(ProductNotFound);
  });
});
