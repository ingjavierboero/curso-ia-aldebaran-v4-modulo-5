import { assertCan } from '../../domain/auth/Authorization.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type PublicProduct, toPublicProduct } from './dto/PublicProduct.js';
import { ProductNotFound } from './errors.js';

export interface ReactivateProductDeps {
  uow: UnitOfWork;
}

/**
 * Reactiva un producto Inactivo (FR-12): vuelve a poder asignarse. Admin o Editor (FR-19). Reactivar
 * uno Activo no cambia nada y lo devuelve.
 */
export class ReactivateProduct {
  constructor(private readonly deps: ReactivateProductDeps) {}

  execute(actor: Actor, id: string): PublicProduct {
    assertCan(actor.role, 'products.manage');

    const result = this.deps.uow.run(({ users, products }) => {
      requireActor(users, actor, 'products.manage');
      const current = products.findById(id);
      if (!current) throw new ProductNotFound();
      if (current.isActive()) return current;

      const next = current.reactivated();
      products.update(next);
      return next;
    });

    return toPublicProduct(result);
  }
}
