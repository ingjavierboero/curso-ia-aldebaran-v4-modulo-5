import { describe, expect, it } from 'vitest';
import { ClientNotFound } from '../../../../src/application/client/errors.js';
import { createCatalogContext } from '../../../support/catalogContext.js';

describe('DeactivateClient / ReactivateClient', () => {
  // Baja → Inactivo y sigue en el listado; reactivar → Activo; las dos idempotentes (AC-04)
  it('test_deactivate_reactivate_client', () => {
    const ctx = createCatalogContext();
    ctx.seedClient({ id: 'c-andes' });

    const deactivated = ctx.deactivateClient.execute(ctx.editor, 'c-andes');
    expect(deactivated.status).toBe('inactivo');
    expect(ctx.clients.findById('c-andes')?.status).toBe('inactivo');
    expect(ctx.listClients.execute(ctx.consulta)).toEqual([deactivated]);

    expect(ctx.deactivateClient.execute(ctx.admin, 'c-andes')).toEqual(deactivated);
    expect(ctx.clients.findById('c-andes')?.status).toBe('inactivo');

    const reactivated = ctx.reactivateClient.execute(ctx.editor, 'c-andes');
    expect(reactivated).toEqual({ ...deactivated, status: 'activo' });
    expect(ctx.clients.findById('c-andes')?.status).toBe('activo');

    expect(ctx.reactivateClient.execute(ctx.admin, 'c-andes')).toEqual(reactivated);
    expect(ctx.listClients.execute(ctx.consulta)).toEqual([reactivated]);
  });

  // Cualquier caso de uso sobre un cliente inexistente: ClientNotFound
  it('test_client_inexistente_no_encontrado', () => {
    const ctx = createCatalogContext();
    const product = ctx.seedProduct({ id: 'p-turnos' });

    expect(() => ctx.getClient.execute(ctx.consulta, 'no-existe')).toThrow(ClientNotFound);
    expect(() => ctx.updateClient.execute(ctx.editor, 'no-existe', { address: 'X 1' })).toThrow(ClientNotFound);
    expect(() => ctx.deactivateClient.execute(ctx.editor, 'no-existe')).toThrow(ClientNotFound);
    expect(() => ctx.reactivateClient.execute(ctx.editor, 'no-existe')).toThrow(ClientNotFound);
    expect(() => ctx.assignProducts.execute(ctx.editor, 'no-existe', [product.id])).toThrow(ClientNotFound);
    expect(() => {
      ctx.unassignProduct.execute(ctx.editor, 'no-existe', product.id);
    }).toThrow(ClientNotFound);

    expect(ctx.clientProducts.listProductIdsOf('no-existe')).toEqual([]);
  });
});
