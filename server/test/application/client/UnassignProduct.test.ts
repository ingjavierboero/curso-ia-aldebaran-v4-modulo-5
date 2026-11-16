import { describe, expect, it } from 'vitest';
import { ProductNotAssigned } from '../../../src/application/client/errors.js';
import { createCatalogContext } from '../../support/catalogContext.js';

describe('UnassignProduct', () => {
  // Desasignar uno de dos: el detalle muestra solo el que sigue (AC-15)
  it('test_unassign_producto', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });
    ctx.seedProduct({ id: 'p-2', name: 'Agenda' });
    ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1', 'p-2']);

    ctx.unassignProduct.execute(ctx.editor, 'c-andes', 'p-1');

    expect(ctx.getClient.execute(ctx.consulta, 'c-andes').products.map((p) => p.id)).toEqual(['p-2']);
    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual(['p-2']);
  });

  // Desasignar uno que no está asignado (o que no existe): ProductNotAssigned
  it('test_unassign_producto_no_asignado_rechazado', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedClient({ id: 'c-sur', businessName: 'Del Sur', cuit: '20111111112', billingEmail: 'pagos@delsur.com' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });
    ctx.assignProducts.execute(ctx.editor, 'c-sur', ['p-1']);

    expect(() => {
      ctx.unassignProduct.execute(ctx.editor, 'c-andes', 'p-1');
    }).toThrow(ProductNotAssigned);
    expect(() => {
      ctx.unassignProduct.execute(ctx.editor, 'c-andes', 'no-existe');
    }).toThrow(ProductNotAssigned);

    expect(ctx.clientProducts.listProductIdsOf('c-sur')).toEqual(['p-1']);
  });
});
