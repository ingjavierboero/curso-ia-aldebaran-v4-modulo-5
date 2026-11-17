import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../../src/domain/auth/errors.js';
import { CUITS, createCatalogContext, type CatalogContext } from '../../../support/catalogContext.js';

const CLIENT_INPUT = {
  businessName: 'Nuevo SRL',
  cuit: CUITS.norte,
  address: 'Calle 1',
  billingEmail: 'nuevo@cliente.com',
  ivaCondition: 1,
};

/** Foto de todo lo que un caso de uso de escritura podría cambiar. */
function snapshot(ctx: CatalogContext) {
  return {
    clients: ctx.clients.list(),
    products: ctx.products.list(),
    andes: ctx.clientProducts.listProductIdsOf('c-andes'),
  };
}

describe('permisos de clientes y productos', () => {
  // Consulta en cada caso de uso de escritura: Forbidden y nada cambia (AC-16)
  it('test_consulta_no_autorizado_a_modificar', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    ctx.seedProduct({ id: 'p-1', name: 'Turnos' });
    ctx.seedProduct({ id: 'p-2', name: 'Agenda' });
    ctx.assignProducts.execute(ctx.editor, 'c-andes', ['p-1']);
    const before = snapshot(ctx);
    const { consulta } = ctx;

    const attempts: Array<[string, () => unknown]> = [
      ['createClient', () => ctx.createClient.execute(consulta, CLIENT_INPUT)],
      ['updateClient', () => ctx.updateClient.execute(consulta, 'c-andes', { address: 'Otra 2' })],
      ['deactivateClient', () => ctx.deactivateClient.execute(consulta, 'c-andes')],
      ['reactivateClient', () => ctx.reactivateClient.execute(consulta, 'c-andes')],
      ['assignProducts', () => ctx.assignProducts.execute(consulta, 'c-andes', ['p-2'])],
      [
        'unassignProduct',
        () => {
          ctx.unassignProduct.execute(consulta, 'c-andes', 'p-1');
        },
      ],
      ['createProduct', () => ctx.createProduct.execute(consulta, { name: 'Nuevo', price: '10', currency: 'ARS' })],
      ['updateProduct', () => ctx.updateProduct.execute(consulta, 'p-1', { price: '20' })],
      ['deactivateProduct', () => ctx.deactivateProduct.execute(consulta, 'p-1')],
      ['reactivateProduct', () => ctx.reactivateProduct.execute(consulta, 'p-1')],
    ];
    for (const [name, attempt] of attempts) {
      expect(attempt, name).toThrow(Forbidden);
    }

    expect(snapshot(ctx)).toEqual(before);
  });

  it('un editor degradado a Consulta o dado de baja no escribe aunque traiga el perfil viejo', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });
    const staleEditor = { id: ctx.editor.id, role: 'editor' as const };
    ctx.users.update(ctx.editor.withProfile({ name: ctx.editor.name, email: ctx.editor.email, role: 'consulta' }));

    expect(() => ctx.deactivateClient.execute(staleEditor, 'c-andes')).toThrow(Forbidden);
    expect(() => ctx.createProduct.execute(staleEditor, { name: 'X', price: '1', currency: 'ARS' })).toThrow(Forbidden);

    ctx.users.update(ctx.editor.deactivated());
    expect(() => ctx.updateClient.execute(staleEditor, 'c-andes', { address: 'Otra 3' })).toThrow(Forbidden);

    expect(ctx.clients.findById('c-andes')?.status).toBe('activo');
    expect(ctx.products.list()).toEqual([]);
  });

  // Consulta ve los listados (ordenados como en español) y el detalle del cliente (AC-16)
  it('test_consulta_puede_listar_y_ver_detalle', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-zeta', businessName: 'Zeta SRL', cuit: CUITS.losAndes, billingEmail: 'z@z.com' });
    ctx.seedClient({ id: 'c-arbol', businessName: 'árbol SA', cuit: CUITS.delSur, billingEmail: 'a@a.com' });
    ctx.seedClient({
      id: 'c-beta',
      businessName: 'Beta SA',
      cuit: CUITS.norte,
      billingEmail: 'b@b.com',
      status: 'inactivo',
    });
    ctx.seedProduct({ id: 'p-nandu', name: 'Ñandú' });
    ctx.seedProduct({ id: 'p-nube', name: 'nube' });
    ctx.seedProduct({ id: 'p-oca', name: 'Oca', status: 'inactivo' });
    ctx.assignProducts.execute(ctx.editor, 'c-zeta', ['p-nandu', 'p-nube']);

    const clients = ctx.listClients.execute(ctx.consulta);
    expect(clients.map((c) => c.businessName)).toEqual(['árbol SA', 'Beta SA', 'Zeta SRL']);
    expect(clients.map((c) => c.status)).toEqual(['activo', 'inactivo', 'activo']);

    const products = ctx.listProducts.execute(ctx.consulta);
    expect(products.map((p) => p.name)).toEqual(['nube', 'Ñandú', 'Oca']);

    const detail = ctx.getClient.execute(ctx.consulta, 'c-zeta');
    expect(detail).toEqual({
      id: 'c-zeta',
      businessName: 'Zeta SRL',
      cuit: CUITS.losAndes,
      address: 'Av. Siempre Viva 742',
      billingEmail: 'z@z.com',
      ivaCondition: { code: 1, name: 'IVA Responsable Inscripto' },
      status: 'activo',
      createdAt: '2026-11-04T12:00:00.000Z',
      products: [products[0], products[1]],
    });

    // Admin y Editor también leen.
    expect(ctx.listClients.execute(ctx.admin)).toEqual(clients);
    expect(ctx.listProducts.execute(ctx.editor)).toEqual(products);
  });
});
