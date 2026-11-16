import { describe, expect, it } from 'vitest';
import { ProductInactive, ProductNotFound } from '../../../src/application/product/errors.js';
import { ProductAlreadyAssigned } from '../../../src/domain/client/errors.js';
import { createCatalogContext } from '../../support/catalogContext.js';

describe('AssignProducts', () => {
  // Dos productos Activos a un cliente Inactivo: el detalle muestra los dos (AC-13, D-03)
  it('test_assign_productos_a_cliente_inactivo', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes', status: 'inactivo' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos', price: '100', currency: 'ARS' });
    ctx.seedProduct({ id: 'p-2', name: 'Agenda', price: '20.5', currency: 'USD' });

    const detail = ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1', 'p-2']);

    const expectedProducts = [
      { id: 'p-2', name: 'Agenda', price: '20.50', currency: 'USD', status: 'activo', createdAt: '2026-11-04T12:00:00.000Z' },
      { id: 'p-1', name: 'Turnos', price: '100.00', currency: 'ARS', status: 'activo', createdAt: '2026-11-04T12:00:00.000Z' },
    ];
    expect(detail.status).toBe('inactivo');
    expect(detail.products).toEqual(expectedProducts);
    expect(ctx.getClient.execute(ctx.consulta, 'c-andes').products).toEqual(expectedProducts);
    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual(['p-1', 'p-2']);
  });

  // Lote con un producto Inactivo: ProductInactive y no se asigna ninguno (AC-12)
  it('test_assign_producto_inactivo_rechazado_todo_o_nada', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });
    ctx.seedProduct({ id: 'p-2', name: 'Agenda', status: 'inactivo' });

    expect(() => ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1', 'p-2'])).toThrow(ProductInactive);

    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual([]);
  });

  // Ya asignado: ProductAlreadyAssigned, una sola asignación y nada del lote (AC-14)
  it('test_assign_producto_ya_asignado_rechazado', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });
    ctx.seedProduct({ id: 'p-2', name: 'Agenda' });
    ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1']);

    expect(() => ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-2', 'p-1'])).toThrow(ProductAlreadyAssigned);
    expect(() => ctx.assignProducts.execute(ctx.admin, 'c-andes', ['p-1'])).toThrow(ProductAlreadyAssigned);

    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual(['p-1']);
    expect(ctx.getClient.execute(ctx.consulta, 'c-andes').products.map((p) => p.id)).toEqual(['p-1']);
  });

  // Un id que no es de ningún producto: ProductNotFound y no se asigna ninguno
  it('test_assign_producto_inexistente_no_encontrado', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });

    expect(() => ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1', 'no-existe'])).toThrow(ProductNotFound);

    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual([]);
  });

  // Un id repetido en el lote se asigna una vez; no es un "ya asignado"
  it('un id repetido en el lote se asigna una sola vez', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });

    const detail = ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1', 'p-1']);

    expect(detail.products.map((p) => p.id)).toEqual(['p-1']);
    expect(ctx.clientProducts.listProductIdsOf('c-andes')).toEqual(['p-1']);
  });
});
