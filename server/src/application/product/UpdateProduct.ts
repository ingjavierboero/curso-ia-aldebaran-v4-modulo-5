import { assertCan } from '../../domain/auth/Authorization.js';
import { parseCurrency, Price } from '../../domain/product/Price.js';
import { parseProductName } from '../../domain/product/Product.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { assertUniqueProductName } from './assertUniqueProductName.js';
import { type PublicProduct, toPublicProduct } from './dto/PublicProduct.js';
import { ProductNotFound } from './errors.js';

export interface UpdateProductDeps {
  uow: UnitOfWork;
}

/** Los campos ausentes no cambian. "Al menos uno" es forma del body y lo valida la ruta. */
export interface UpdateProductInput {
  name?: string;
  /** Texto decimal con punto (`"15000.50"`), nunca un número (NFR-03). */
  price?: string;
  currency?: string;
}

/**
 * Modifica nombre, precio y moneda de un producto (FR-09), Activo o Inactivo, por un Admin o Editor
 * (FR-19). Valida con el dominio antes de la transacción (FR-10) y, dentro de ella, relee al actor y
 * rechaza un nombre de OTRO producto (FR-11).
 */
export class UpdateProduct {
  constructor(private readonly deps: UpdateProductDeps) {}

  execute(actor: Actor, id: string, input: UpdateProductInput): PublicProduct {
    assertCan(actor.role, 'products.manage');

    const name = input.name === undefined ? undefined : parseProductName(input.name);
    const currency = input.currency === undefined ? undefined : parseCurrency(input.currency);
    const amountCents = input.price === undefined ? undefined : Price.parseAmount(input.price);

    const updated = this.deps.uow.run(({ users, products }) => {
      requireActor(users, actor, 'products.manage');
      const current = products.findById(id);
      if (!current) throw new ProductNotFound();

      const cents = amountCents ?? current.price.cents;
      const next = current.withData({
        name: name ?? current.name,
        price: Price.fromCents(cents, currency ?? current.price.currency),
      });
      assertUniqueProductName(products, next);
      products.update(next);
      return next;
    });

    return toPublicProduct(updated);
  }
}
