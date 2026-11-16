import { assertCan } from '../../domain/auth/Authorization.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type PublicProduct, toPublicProduct } from './dto/PublicProduct.js';
import { ProductNotFound } from './errors.js';

export interface DeactivateProductDeps {
  uow: UnitOfWork;
}

/**
 * Desactiva un producto (FR-12): pasa a Inactivo, sigue asignado a los clientes que lo tenían y no se
 * puede asignar a otros (FR-14). Admin o Editor (FR-19). Desactivar uno Inactivo no cambia nada.
 */
export class DeactivateProduct {
  constructor(private readonly deps: DeactivateProductDeps) {}

  execute(actor: Actor, id: string): PublicProduct {
    assertCan(actor.role, 'products.manage');

    const result = this.deps.uow.run(({ users, products }) => {
      requireActor(users, actor, 'products.manage');
      const current = products.findById(id);
      if (!current) throw new ProductNotFound();
      if (!current.isActive()) return current;

      const next = current.deactivated();
      products.update(next);
      return next;
    });

    return toPublicProduct(result);
  }
}
